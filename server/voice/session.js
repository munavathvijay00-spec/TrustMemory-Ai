/**
 * Browser voice agent: session brain for the live coaching call.
 *
 *  startSession    -> recall memory (Hindsight, with local SQLite fallback), build the
 *                     persona prompt with that memory, ask Groq for the opening line.
 *  turn            -> one conversational turn via Groq.
 *  completeSession -> Groq extracts a structured outcome from the real transcript,
 *                     writes call + Experience memory to SQLite, retains transcript and
 *                     summary to Hindsight, then asks the Decision Agent to re-score.
 *
 * Nothing in here fabricates an outcome. If Groq is unavailable the session fails
 * loudly instead of substituting a canned transcript.
 */
const crypto = require('crypto');
const db = require('../db');
const groq = require('../groq');
const hindsight = require('../hindsight');
const { recalculateChurn } = require('../decision');
const retainQueue = require('../retain-queue');
const commitments = require('../commitments');
const { END_TOKEN, LANGUAGES, nowSql, firstName, helperTags, daysBetween, callLanguage, callPurpose } = require('./util');
const { wordSet, dedupeFacts, factOrigin, recallForHelper } = require('./recall');
const { buildSystemPrompt } = require('./prompt');
const { mayUseMemory, knownTags, attributeCitations, splitCitations } = require('./citations');
const { extractOutcome, PROBLEM_TYPES, SAFETY_KINDS } = require('./extraction');
const hooks = require('./hooks');
const { SESSIONS, persist, remove } = require('./session-store');
const { expireRing } = require('./relay');
const { record } = require('./trace');
const inflight = require('./inflight');

/** Timings behind one agent line, for the console latency strip: memory recall, LLM, attribution, total. */
function latencyOf(steps, llmStep, recallStep) {
  const find = name => steps.filter(e => e.step === name).pop();
  const recall = find(recallStep), llm = find(llmStep), attr = find('attribution');
  const out = {
    recall_ms: recall ? recall.ms : null,
    recall_ok: recall ? recall.ok : null,
    llm_ms: llm ? llm.ms : null,
    attribution_ms: attr ? attr.ms : null,
  };
  out.total_ms = (out.recall_ms || 0) + (out.llm_ms || 0) + (out.attribution_ms || 0);
  return out;
}

async function startSession({ helperId = 'anita', scenario = 'coaching_call', lateCount = 2, useMemory = true, language, purpose }) {
  const trace = [];
  // No language chosen: use the one the helper asked to be called in (set in her own view).
  if (language === undefined || language === null || language === '') language = require('../requests').preferredLanguage(helperId) || undefined;
  language = callLanguage(language);
  purpose = callPurpose(purpose);
  if (lateCount === undefined || lateCount === null || lateCount === '') lateCount = 2;
  useMemory = useMemory !== false && useMemory !== 'false' && useMemory !== 0;
  const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get(helperId);
  if (!helper) throw Object.assign(new Error('Unknown helper "' + helperId + '".'), { status: 404 });

  const placement = db.prepare("SELECT household_id FROM placements WHERE helper_id = ? AND status = 'active' LIMIT 1").get(helperId);
  const household = placement ? db.prepare('SELECT * FROM households WHERE id = ?').get(placement.household_id) : null;

  const priorCalls = db.prepare(
    "SELECT scenario, outcome_json, created_at FROM calls WHERE helper_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 5"
  ).all(helperId).map(c => {
    let note = '', commitment = null;
    try { const o = JSON.parse(c.outcome_json || '{}'); note = o.coordinator_note || ''; commitment = o.specific_commitment || null; } catch { /* ignore */ }
    return { scenario: c.scenario, created_at: c.created_at, daysAgo: daysBetween(c.created_at.replace(' ', 'T') + 'Z', Date.now()), note: note || 'no summary recorded', commitment };
  });

  const memory = await recallForHelper(helper, { useMemory, scenario, household, trace });
  const tLedger = Date.now();
  const ledger = useMemory ? { open: commitments.openFor(helperId), works: commitments.whatWorks(helperId), stats: commitments.stats(helperId) } : null;
  record(trace, 'ledger', tLedger, true, ledger ? ledger.open.length + ' open' : 'memory off');
  // Number the facts the same way the prompt does, so citations resolve back to them.
  memory.facts = memory.facts.slice(0, 11).map((f, i) => Object.assign({}, f, { tag: 'm' + (i + 1) }));
  const system = buildSystemPrompt({ helper, household, scenario, lateCount, memory, priorCalls: useMemory ? priorCalls : [], ledger, language, purpose });

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: '(The call has just connected. ' + firstName(helper.name) + ' has picked up. Say your opening line.)' },
  ];
  const tGreeting = Date.now();
  // groq.chat does not report which model in its chain answered, so the entry carries no model.
  const rawGreeting = await groq.chat(messages, { temperature: 0.6, maxTokens: 400 });
  record(trace, 'llm_greeting', tGreeting, true);
  const g = splitCitations(rawGreeting);
  const greeting = g.text;
  g.cited = knownTags(g.cited, memory.facts);
  if (!g.cited.length && useMemory && memory.facts.length && ((language && language !== 'en') || mayUseMemory(greeting, memory.facts, helper.name))) {
    const tAttr = Date.now();
    g.cited = await attributeCitations(greeting, memory.facts);
    record(trace, 'attribution', tAttr, true, g.cited.length + ' cited');
  }

  const id = 'vs_' + crypto.randomBytes(6).toString('hex');
  const session = {
    id,
    helper,
    household,
    scenario,
    lateCount: Number.isFinite(Number(lateCount)) ? Number(lateCount) : 2,
    memory,
    priorCalls,
    startedAt: new Date().toISOString(),
    lastActivity: Date.now(),
    useMemory,
    language,
    purpose,
    ledger,
    messages: [messages[0], { role: 'assistant', content: rawGreeting }],
    transcript: [{ who: 'Agent', text: greeting, cited: g.cited, t: new Date().toISOString(), latency: latencyOf(trace, 'llm_greeting', 'recall') }],
    status: 'active',
    result: null,
    trace,
  };
  SESSIONS.set(id, session);
  persist(session);

  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    'VOICE AGENT — Live browser call started with ' + helper.name + ' (' + scenario + (language !== 'en' ? ', in ' + LANGUAGES[language].name : '') + '). ' + (purpose ? 'Reason: ' + purpose + ' ' : '') + (useMemory ? 'Recalled ' + memory.facts.length + ' memories from ' + memory.source + (memory.mentalModel ? ' plus the standing profile' : '') + '.' : 'Memory switched OFF for comparison.'),
    nowSql()
  );

  return publicView(session);
}

async function turn(sessionId, userText) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.status === 'completing' || s.status === 'completed' || s.status === 'cancelled') {
    throw Object.assign(new Error('This call has already been saved. Start a new call to continue.'), { status: 409 });
  }
  if (s.callState === 'declined' || s.callState === 'ended') {
    throw Object.assign(new Error('This call has ended.'), { status: 409 });
  }
  s.lastActivity = Date.now();
  // The agent may have tried to wrap up, but the helper kept talking: the call is still live.
  if (s.status === 'wrapping_up') s.status = 'active';
  const text = String(userText || '').trim();
  if (!text) throw Object.assign(new Error('Empty message.'), { status: 400 });
  const herLine = { who: firstName(s.helper.name), text, t: new Date().toISOString(), recalled: [] };
  s.transcript.push(herLine);
  // The call can be hung up, saved or cancelled while this turn waits on Hindsight or Groq.
  const stillLive = () => {
    if (!SESSIONS.has(s.id) || s.completing || s.status === 'completed' || s.status === 'cancelled' || s.callState === 'ended' || s.callState === 'declined') {
      throw Object.assign(new Error('This call has ended.'), { status: 409 });
    }
  };

  // Recall-before-reply: her latest sentence is the query, so the agent reacts to what she
  // just said with what the agency already knows about it (people, arrangements, commitments).
  if (!Array.isArray(s.trace)) s.trace = [];
  const steps = [];
  let recalledNow = [];
  const tRecall = Date.now();
  if (s.useMemory !== false && hindsight.isConfigured() && text.split(' ').length >= 3) {
    try {
      const hits = await hindsight.recall(text, { tags: helperTags(s.helper.id), budget: 'low', limit: 3, maxTokens: 600 });
      // Facts already on this call are reused (same tag); genuinely new ones are appended once.
      const known = new Set(s.memory.facts.map(f => String(f.text).split(' | ')[0].slice(0, 80)));
      for (const h of hits) {
        const key = String(h.text).split(' | ')[0].slice(0, 80);
        let fact = s.memory.facts.find(f => String(f.text).split(' | ')[0].slice(0, 80) === key);
        if (!fact) {
          if (!dedupeFacts([h], s.memory.facts).length) {
            const hw = wordSet(h.text);
            fact = s.memory.facts.find(f => { const fw = wordSet(f.text); let i = 0; for (const w of hw) if (fw.has(w)) i += 1; return i / Math.min(hw.size || 1, fw.size || 1) >= 0.8; });
            if (fact) { recalledNow.push(fact); continue; }
          }
          fact = Object.assign({}, h, { tag: 'm' + (s.memory.facts.length + 1), origin: factOrigin(h) });
          s.memory.facts.push(fact);
          known.add(key);
        }
        recalledNow.push(fact);
      }
      record(s.trace, 'turn_recall', tRecall, true, hits.length + ' hits', steps);
    } catch (e) { record(s.trace, 'turn_recall', tRecall, false, e.message, steps); /* recall is best-effort per turn */ }
  } else {
    record(s.trace, 'turn_recall', tRecall, true, 'skipped', steps);
  }
  recalledNow = recalledNow.filter((f, i, a) => a.indexOf(f) === i);
  stillLive();
  s.messages.push({ role: 'user', content: text });
  if (recalledNow.length) {
    s.messages.push({
      role: 'system',
      content: 'Memory relevant to what she just said (cite the tag if you use it):\n' +
        recalledNow.map(f => '[' + f.tag + '] ' + String(f.text).split(' | ')[0].slice(0, 220)).join('\n') +
        '\nIf she referred to a person or arrangement you have on record, say that you remember it.',
    });
  }
  herLine.recalled = recalledNow.map(f => f.tag);

  // Keep the first system prompt, drop per-turn memory inserts older than the last two turns, cap history.
  const body = s.messages.slice(1);
  const lastSysIdx = body.map((m, i) => (m.role === 'system' ? i : -1)).filter(i => i >= 0).slice(-2);
  const pruned = body.filter((m, i) => m.role !== 'system' || lastSysIdx.includes(i));
  const recent = [s.messages[0]].concat(pruned.length > 16 ? pruned.slice(-16) : pruned);
  const tReply = Date.now();
  let reply;
  try {
    reply = await groq.chat(recent, { temperature: 0.5, maxTokens: 400 });
  } catch (err) {
    record(s.trace, 'llm_reply', tReply, false, err.message, steps);
    persist(s);
    throw err;
  }
  record(s.trace, 'llm_reply', tReply, true, undefined, steps);
  stillLive();
  let ending = reply.includes(END_TOKEN);
  reply = reply.replace(END_TOKEN, '').trim();
  // Guard: the agent must stop after its first question and wait for the helper.
  // If the model kept going (role-playing the helper's answer), cut it at that question
  // and do not treat the call as ended. Citation tags right after the question mark are kept.
  const q = reply.indexOf('?');
  if (q !== -1 && q < reply.length - 1) {
    const after = reply.slice(q + 1);
    const tags = (after.match(/^(\s*\[m\d+\])+/) || [''])[0];
    if (after.slice(tags.length).trim()) { reply = reply.slice(0, q + 1 + tags.length).trim(); ending = false; }
  }
  // Cut a reply where the model starts writing the helper's side ("\nRadha: ...").
  const nameRe = new RegExp('\\n\\s*' + firstName(s.helper.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'i');
  if (nameRe.test(reply)) { reply = reply.split(nameRe)[0].trim(); ending = false; }
  // In Hindi or Telugu the model writes her name in that script; cut at any one-word speaker label on a new line.
  const labelRe = /\n\s*[\p{L}\p{M}]{1,24}\s*:/u;   // letters only, so a time like 10:30 is not a speaker
  if (s.language && s.language !== 'en' && labelRe.test(reply)) { reply = reply.split(labelRe)[0].trim(); ending = false; }

  const c = splitCitations(reply);
  c.cited = knownTags(c.cited, s.memory.facts);
  if (!c.cited.length && s.useMemory !== false && s.memory.facts.length && (s.language !== 'en' || mayUseMemory(c.text, s.memory.facts, s.helper.name))) {
    const tAttr = Date.now();
    c.cited = await attributeCitations(c.text, s.memory.facts);
    record(s.trace, 'attribution', tAttr, true, c.cited.length + ' cited', steps);
    stillLive();
  }
  // History holds what was actually said (after the cuts above), so a role-played answer is not reinforced.
  s.messages.push({ role: 'assistant', content: reply + (ending ? ' ' + END_TOKEN : '') });
  s.transcript.push({ who: 'Agent', text: c.text, cited: c.cited, t: new Date().toISOString(), latency: latencyOf(steps, 'llm_reply', 'turn_recall') });
  if (ending && s.status === 'active') s.status = 'wrapping_up';
  persist(s);

  return {
    session_id: s.id, reply: c.text, cited: c.cited, ending, turn_count: s.transcript.length,
    recalled_now: recalledNow.map(f => ({ tag: f.tag, text: String(f.text).split(' | ')[0], when: f.mentionedAt || '' })),
    trace: steps,
  };
}

async function completeSession(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.result) return s.result;
  // A second request while the first is still saving waits for the same result instead of saving again.
  if (s.completing) return s.completing;
  if (s.transcript.length < 2) throw Object.assign(new Error('The call has no helper turns yet, nothing to record.'), { status: 400 });

  s.status = 'completing';
  s.lastActivity = Date.now();
  persist(s);
  s.completing = saveCall(s).then(
    result => { s.completing = null; return result; },
    err => { s.completing = null; s.status = 'active'; persist(s); throw err; }
  );
  inflight.trackSave(s.completing);
  return s.completing;
}

async function saveCall(s) {
  if (!Array.isArray(s.trace)) s.trace = [];
  const steps = []; // this completion's timings, returned as result.trace
  const tExtract = Date.now();
  let outcome;
  try {
    outcome = await extractOutcome(s);
  } catch (err) {
    record(s.trace, 'extract', tExtract, false, err.message);
    throw err;
  }
  record(s.trace, 'extract', tExtract, true, undefined, steps);
  const tSave = Date.now();
  const now = nowSql();
  const callId = 'browser_' + s.id;
  const followUpDate = new Date(Date.now() + (Number(outcome.follow_up_days) || 14) * 86400000).toISOString().split('T')[0];

  const outcomeRecord = {
    sentiment: outcome.sentiment || 'neutral',
    root_cause_identified: outcome.root_cause || null,
    specific_commitment: outcome.specific_commitment || null,
    notification_commitment: Boolean(outcome.notification_commitment),
    follow_up_date: followUpDate,
    escalations_required: Boolean(outcome.escalation_required),
    call_completed: outcome.call_completed !== false,
    coordinator_note: outcome.coordinator_note || 'Call recorded.',
    memory_facts: Array.isArray(outcome.memory_facts) ? outcome.memory_facts.slice(0, 5) : [],
    provider: 'browser_voice',
    late_count: s.lateCount,
    household_id: s.household ? s.household.id : null,
    memory_source_at_start: s.memory.source,
    memories_recalled: s.memory.facts.length,
    memory_used: s.useMemory !== false,
    memory_citations: s.transcript.reduce((n, t) => n + ((t.cited && t.cited.length) || 0), 0),
    helper_turns: s.transcript.filter(t => t.who !== 'Agent').length,
    approach_used: commitments.APPROACHES[outcome.approach_used] ? outcome.approach_used : null,
    commitment_checks: [],
    problem_type: PROBLEM_TYPES.includes(outcome.problem_type) ? outcome.problem_type : null,
    safety_concerns: (Array.isArray(outcome.safety_concerns) ? outcome.safety_concerns : [])
      .filter(c => c && SAFETY_KINDS.includes(c.kind) && String(c.evidence || '').trim())
      .slice(0, 5).map(c => ({ kind: c.kind, evidence: String(c.evidence).slice(0, 300) })),
  };

  // Commitment ledger: resolve what she said about earlier promises, then open the new one.
  const openNow = (s.ledger && s.ledger.open) || [];
  for (const chk of Array.isArray(outcome.commitment_checks) ? outcome.commitment_checks : []) {
    const c = openNow.find(x => x.id === chk.id);
    if (!c || !['kept', 'broken'].includes(chk.status)) continue;
    if (commitments.resolve(c.id, chk.status, { evidence: chk.evidence, callId: 'browser_' + s.id })) {
      outcomeRecord.commitment_checks.push({ id: c.id, text: c.text, status: chk.status, evidence: chk.evidence || '', approach: c.approach, made_at: c.made_at });
    }
  }
  if (outcomeRecord.specific_commitment && s.useMemory !== false) {
    // A new promise replaces any earlier one she did not resolve on this call.
    for (const c of openNow) if (!outcomeRecord.commitment_checks.some(x => x.id === c.id)) commitments.resolve(c.id, 'replaced', { evidence: 'Replaced by a new commitment on a later call.', callId: 'browser_' + s.id });
    outcomeRecord.new_commitment_id = commitments.add({ helperId: s.helper.id, text: outcomeRecord.specific_commitment, approach: outcomeRecord.approach_used, callId: 'browser_' + s.id });
  }

  // 1. Call record (SQLite)
  db.prepare("INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)")
    .run('c_' + Date.now(), s.helper.id, callId, s.scenario, JSON.stringify(s.transcript), JSON.stringify(outcomeRecord), now);

  // 2. Experience memory (SQLite, local ledger)
  const memoryId = 'mem_' + Date.now();
  db.prepare("INSERT INTO memories (id, helper_id, household_id, network, content, created_at) VALUES (?, ?, ?, 'experience', ?, ?)")
    .run(memoryId, s.helper.id, outcomeRecord.household_id, 'Voice call (' + s.scenario + '): ' + outcomeRecord.coordinator_note, now);
  record(s.trace, 'save_local', tSave, true, callId, steps);

  // 3. Retain to Hindsight (transcript + coordinator summary)
  let retain = { status: 'skipped', detail: 'Hindsight not configured.' };
  if (s.useMemory === false) retain = { status: 'skipped', detail: 'Memory-off comparison call: not retained, so it does not teach the bank a worse conversation.' };
  else if (hindsight.isConfigured()) {
    const tags = helperTags(s.helper.id).concat(['scenario:' + s.scenario, 'source:voice-call']);
    const dialogue = s.transcript.map(t => t.who + ': ' + t.text).join('\n');
    const fn = firstName(s.helper.name);
    const summaryText = [
      'Coaching call with ' + s.helper.name + ' on ' + now.slice(0, 10) + ' (' + s.scenario + ').' + (s.language && s.language !== 'en' ? ' (Call held in ' + LANGUAGES[s.language].name + '.)' : ''),
      outcomeRecord.coordinator_note,
      outcomeRecord.root_cause_identified ? 'Root cause: ' + outcomeRecord.root_cause_identified + '.' : null,
      outcomeRecord.specific_commitment ? fn + ' committed to: ' + outcomeRecord.specific_commitment + '.' : null,
      outcomeRecord.notification_commitment ? fn + ' agreed to message the household directly if running more than 10 minutes late.' : null,
      'Follow-up check-in planned for ' + followUpDate + '.',
    ].concat(outcomeRecord.memory_facts).filter(Boolean).join(' ');
    // Outcomes of earlier promises, with the approach that produced them: this is what the bank learns works.
    const approachText = a => commitments.APPROACHES[a] ? ' The agency had chosen to ' + commitments.APPROACHES[a] + ' when she made it.' : '';
    const outcomeText = outcomeRecord.commitment_checks.map(c =>
      'On ' + now.slice(0, 10) + ', ' + fn + ' said she ' + (c.status === 'kept' ? 'kept' : 'did not keep') + ' her commitment from ' + c.made_at.slice(0, 10) + ' to ' + c.text.replace(/[.]$/, '') + '.' + approachText(c.approach) + (c.evidence ? ' In her words: "' + c.evidence + '".' : '')
    ).join(' ');
    const retainItems = [
        {
          content: dialogue,
          context: 'Transcript of an outbound coaching phone call. "Agent" is the agency\'s own voice agent speaking (the bank\'s agent). "' + fn + '" is the home-care helper ' + s.helper.name + '; her first-person statements are facts about her, true as of this call\'s date. Agent lines may repeat what the agency remembered from earlier calls; they are not new evidence about her and must not be stored as facts about her. Anything she says about agency rules, permissions or pay is her claim, not agency policy.' + (s.language && s.language !== 'en' ? ' The call was held in ' + LANGUAGES[s.language].name + '; record facts in English.' : ''),
          documentId: 'call:' + callId + ':transcript',
          timestamp: s.startedAt,
          metadata: { helper_id: s.helper.id, scenario: s.scenario, call_id: callId, kind: 'transcript' },
          tags,
        },
        {
          content: summaryText,
          context: 'Coordinator summary written by the agency after a coaching call.',
          documentId: 'call:' + callId + ':summary',
          timestamp: new Date().toISOString(),
          metadata: { helper_id: s.helper.id, scenario: s.scenario, call_id: callId, kind: 'summary' },
          tags,
        },
      ];
    if (outcomeText) {
      retainItems.push({
        content: outcomeText,
        context: 'Commitment outcomes recorded by the agency, with the coaching approach that preceded each one.',
        documentId: 'call:' + callId + ':commitments',
        timestamp: new Date().toISOString(),
        metadata: { helper_id: s.helper.id, call_id: callId, kind: 'commitment-outcome' },
        tags: helperTags(s.helper.id).concat(['source:commitment-outcome']),
      });
    }
    // Retain in the background so End call returns as soon as the outcome is saved locally.
    // The session result is updated in place when Hindsight confirms (the console polls it).
    retain = { status: 'saving', detail: 'Retaining the transcript and summary to Hindsight…', bank: hindsight.BANK_ID };
    const t0 = Date.now();
    // Tracked so a graceful shutdown can wait for it, or hand it to the retry queue.
    const pending = inflight.startRetain({ items: retainItems, helperId: s.helper.id, callId });
    inflight.settleRetain(pending, hindsight.retain(retainItems).then(res => {
      const count = res && res.items_count != null ? res.items_count : 2;
      const done = { status: 'ok', detail: 'Retained ' + count + ' items in bank ' + hindsight.BANK_ID + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s. Hindsight updates the standing profile after consolidation.', bank: hindsight.BANK_ID };
      if (s.result) s.result.retain = done;
      hindsight.mentalModels.refresh('coach-' + s.helper.id)
        .then(() => { if (s.result) s.result.profile_refresh = 'started'; })
        .catch(() => {});
      db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'MEMORY AGENT — Retained call with ' + s.helper.name + ' to Hindsight bank ' + hindsight.BANK_ID + '.', nowSql());
      record(s.trace, 'retain', t0, true, count + ' items', steps);
    }).catch(err => {
      // Already written to the retry queue by a shutdown drain: do not queue it twice.
      const jobId = pending.handedOff ? pending.jobId : retainQueue.enqueue(retainItems, { helperId: s.helper.id, callId, error: err.message });
      const queued = { status: 'queued', detail: 'Hindsight was unreachable (' + String(err.message).slice(0, 120) + '). Saved locally and queued for automatic retry (' + jobId + ').', bank: hindsight.BANK_ID };
      if (s.result) s.result.retain = queued;
      record(s.trace, 'retain', t0, false, String(err.message).slice(0, 120) + ' (queued ' + jobId + ')', steps);
    }));
  } else {
    record(s.trace, 'retain', Date.now(), true, 'skipped: ' + retain.detail, steps);
  }

  // 4. Decision Agent re-scores from the real outcome
  const tDecision = Date.now();
  const decision = recalculateChurn(s.helper.id, s.scenario, outcomeRecord.coordinator_note, s.lateCount, outcomeRecord);
  record(s.trace, 'decision', tDecision, true, decision && decision.delta !== undefined ? 'delta ' + decision.delta : undefined, steps);

  const where = retain.status === 'saving' ? 'local now, Hindsight in the background' : 'local only';
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    'MEMORY AGENT — Retained call with ' + s.helper.name + ' to Experience network (' + where + ').',
    nowSql()
  );

  s.status = 'completed';
  s.result = {
    session_id: s.id,
    call_id: callId,
    memory_id: memoryId,
    outcome: outcomeRecord,
    learned: outcomeRecord.memory_facts,
    commitment_checks: outcomeRecord.commitment_checks,
    new_commitment: outcomeRecord.specific_commitment,
    approach_used: outcomeRecord.approach_used,
    ledger_after: commitments.stats(s.helper.id),
    used: s.memory.facts.filter(f => s.transcript.some(t => (t.cited || []).includes(f.tag))).map(f => ({ tag: f.tag, text: String(f.text).split(' | ')[0], origin: f.origin || factOrigin(f), when: f.mentionedAt || '' })),
    profile_before: s.memory.mentalModel ? { content: s.memory.mentalModel.content, updated_at: s.memory.mentalModel.updatedAt } : null,
    retain,
    decision,
    transcript: s.transcript,
    trace: steps,
  };
  hooks.emitCallSaved(s, s.result);
  remove(s.id);
  return s.result;
}

function publicView(s) {
  return {
    session_id: s.id,
    helper: { id: s.helper.id, name: s.helper.name, role: s.helper.role },
    household: s.household ? { id: s.household.id, name: s.household.name } : null,
    scenario: s.scenario,
    late_count: s.lateCount,
    language: s.language || 'en',
    speech_lang: LANGUAGES[s.language || 'en'].speech,
    purpose: s.purpose || null,
    greeting: s.transcript[0].text,
    use_memory: s.useMemory !== false,
    memory: {
      source: s.memory.source,
      bank: s.memory.bank,
      count: s.memory.facts.length,
      facts: s.memory.facts.map(f => ({ tag: f.tag, text: f.text, type: f.type || '', when: f.mentionedAt || '', origin: f.origin || factOrigin(f), about: f.about || null })),
      mental_model: s.memory.mentalModel ? { name: s.memory.mentalModel.name, content: s.memory.mentalModel.content, updated_at: s.memory.mentalModel.updatedAt } : null,
      error: s.memory.error,
    },
    prior_calls: s.priorCalls,
    ledger: s.ledger ? {
      open: s.ledger.open.map(c => ({ id: c.id, text: c.text, made_at: c.made_at })),
      stats: s.ledger.stats,
      best: s.ledger.works.best,
      avoid: s.ledger.works.avoid,
    } : null,
    status: s.status,
    call_state: s.callState || null,
    call_state_at: s.callStateAt || null,
    trace: s.trace || [],
  };
}

function getSession(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (!s) return null;
  expireRing(s);
  return Object.assign(publicView(s), { transcript: s.transcript, result: s.result });
}

function cancelSession(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (s && !s.result && !s.completing) { s.status = 'cancelled'; SESSIONS.delete(sessionId); remove(sessionId); return true; }
  return false;
}

module.exports = { startSession, turn, completeSession, saveCall, publicView, getSession, cancelSession };
