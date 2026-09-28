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
const db = require('./db');
const groq = require('./groq');
const hindsight = require('./hindsight');
const { recalculateChurn } = require('./decision');
const retainQueue = require('./retain-queue');
const commitments = require('./commitments');

const SESSIONS = new Map();
const END_TOKEN = '[END_CALL]';

function nowSql() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function firstName(name) {
  return String(name || '').split(' ')[0] || 'there';
}

function helperTags(helperId) {
  return ['helper:' + helperId];
}

/* ------------------------------------------------------------------ memory */

/** Hindsight appends " | When: ... | Involving: ..." to recall text; compare on the sentence itself. */
function factCore(text) {
  return String(text || '').split(' | ')[0].trim();
}

function wordSet(text) {
  return new Set(factCore(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
}

/** Drop near-duplicates (the same fact retained by the seed and by live calls, or phrased twice). */
function dedupeFacts(facts, existing = []) {
  const kept = [];
  const seen = existing.map(f => wordSet(f.text));
  for (const f of facts) {
    const ws = wordSet(f.text);
    if (!ws.size) continue;
    const dup = seen.some(o => {
      let inter = 0;
      for (const w of ws) if (o.has(w)) inter += 1;
      return inter / Math.min(ws.size, o.size) >= 0.8;
    });
    if (dup) continue;
    seen.push(ws);
    kept.push(f);
  }
  return kept;
}

function factOrigin(f) {
  const doc = String(f.documentId || '');
  if (f.type === 'observation') return 'consolidated';
  if (doc.startsWith('call:')) return 'learned on a call';
  if (doc.startsWith('feedback:')) return 'coordinator feedback';
  if (doc.startsWith('note:')) return 'coordinator note';
  if (doc.startsWith('seed:')) return 'agency records';
  return 'agency records';
}

async function recallForHelper(helper, { useMemory = true, scenario = 'coaching_call', household = null } = {}) {
  if (!useMemory) {
    return { source: 'disabled', bank: hindsight.BANK_ID, facts: [], mentalModel: null, error: null };
  }
  const query = scenario === 'followup_call'
    ? helper.name + ': commitments made on the last coaching call, what she agreed to do, the follow-up that was planned, and anything that happened since then'
    : helper.name + ': attendance, late arrivals, previous coaching calls, commitments made and whether they held, preferences, times not to call, household feedback';
  const local = db.prepare(
    'SELECT network, content, created_at FROM memories WHERE helper_id = ? ORDER BY created_at DESC LIMIT 12'
  ).all(helper.id).map(m => ({ text: m.content, type: m.network, mentionedAt: m.created_at }));

  if (!hindsight.isConfigured()) {
    return { source: 'local', bank: null, facts: local, mentalModel: null, error: 'Hindsight not configured; using local SQLite memories.' };
  }
  try {
    const [factsA, mm] = await Promise.all([
      hindsight.recall(query, { tags: helperTags(helper.id), budget: 'mid', limit: 10 }),
      hindsight.mentalModels.get('coach-' + helper.id).catch(() => null),
    ]);
    // Only this helper's memories: an untagged, bank-wide fallback could pull another helper's facts into the call.
    let facts = dedupeFacts(factsA).map(f => Object.assign(f, { origin: factOrigin(f) }));
    if (household) {
      try {
        const hh = await hindsight.recall(household.name + ': what the household expects from a helper and what they have said about ' + helper.name, { tags: ['household:' + household.id], budget: 'low', limit: 3, maxTokens: 600 });
        facts = facts.concat(dedupeFacts(hh, facts).map(f => Object.assign(f, { origin: 'household', about: household.name })));
      } catch (e) { /* household memory is additive */ }
    }
    const mentalModel = mm && mm.content ? { name: mm.name, content: mm.content, updatedAt: mm.updated_at || mm.last_refreshed_at || null } : null;
    return { source: 'hindsight', bank: hindsight.BANK_ID, facts, mentalModel, localFacts: local, error: null };
  } catch (err) {
    return { source: 'local', bank: hindsight.BANK_ID, facts: local, mentalModel: null, error: err.message };
  }
}

/* ------------------------------------------------------------------ prompt */

const SCENARIO_GOALS = {
  coaching_call:
    'Reason for the call: {{late_count}} late arrivals in the past two weeks. Goal: understand the real obstacle, agree one concrete adjustment, and get a commitment to message the household if ever running more than 10 minutes late.',
  household_checkin:
    'Reason for the call: routine check-in on how the placement is going. Goal: hear how the work and the household are, surface any friction early, and note anything the agency should act on.',
  escalation_call:
    'Reason for the call: follow-up on a commitment made on an earlier call. Goal: check whether the commitment held, understand what got in the way if not, and agree the next step.',
  followup_call:
    'Reason for the call: the two-week follow-up you promised on the last call. Goal: ask specifically whether the commitment from that call held, thank her if it did, understand what got in the way if it did not, and agree what happens next.',
};

function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function buildSystemPrompt({ helper, household, scenario, lateCount, memory, priorCalls, ledger }) {
  // Keep the prompt lean: every turn resends it, and the free tier meters tokens per minute.
  const trimmed = memory.facts.slice(0, 11).map((f, i) => {
    const text = String(f.text).split(' | ')[0].trim(); // drop Hindsight's "| When: ... | Involving: ..." suffix
    return { tag: f.tag || ('m' + (i + 1)), text: text.length > 220 ? text.slice(0, 217) + '...' : text, mentionedAt: f.mentionedAt, origin: f.origin };
  });
  const memLines = memory.source === 'disabled'
    ? '- (memory is switched off for this call: you know nothing about this helper beyond the header above)'
    : trimmed.length
      ? trimmed.map((f, i) => '[' + (f.tag || ('m' + (i + 1))) + '] ' + (f.origin === 'household' ? '(said by the household) ' : '') + f.text + (f.mentionedAt ? ' (' + String(f.mentionedAt).slice(0, 10) + ')' : '')).join('\n')
      : '- (nothing on record yet. This is the first conversation with this helper.)';
  const keyFact = trimmed.find(f => f.origin !== 'household' && /commit|arrang|agreed|plan|will take|neighbour|bus|school|backup|message the/i.test(f.text)) || trimmed.find(f => f.origin !== 'household') || trimmed[0];
  const keyBlock = memory.source !== 'disabled' && keyFact
    ? '\nKEY MEMORY FOR THIS CALL: [' + (keyFact.tag || 'm1') + '] ' + keyFact.text + '\nWhen you state the reason for calling (your second turn, after she confirms it is a good time), you MUST name this key memory specifically and ask whether it held, in the same sentence as the reason. Do not use a generic line like "we noticed a couple of late arrivals" on its own. Example: "Last time you arranged for your neighbour to take Lakshmi to school; has that been working? [' + (keyFact.tag || 'm1') + ']".\n'
    : '';
  const mentalModelBlock = memory.mentalModel && memory.mentalModel.content
    ? '\nSTANDING PROFILE (a mental model Hindsight keeps current for this helper):\n' + String(memory.mentalModel.content).slice(0, 1200) + '\n'
    : '';

  const priorLines = priorCalls.length
    ? priorCalls.slice(0, 3).map(c => '- ' + c.created_at.slice(0, 10) + ' (' + c.daysAgo + ' days ago) ' + c.scenario + ': ' + c.note + (c.commitment ? ' Commitment then: ' + c.commitment + '.' : '')).join('\n')
    : '- none';
  const last = priorCalls[0];
  const sinceBlock = scenario === 'followup_call' && last
    ? '\nSINCE LAST CALL: you last spoke ' + (last.daysAgo === 0 ? 'earlier today' : last.daysAgo === 1 ? 'yesterday' : last.daysAgo + ' days ago (' + last.created_at.slice(0, 10) + ')') + '. She committed to: ' + (last.commitment || 'see note') + '. Open by referring to that conversation (say "earlier today" or the date exactly as given, never invent a date) and that commitment, then ask whether it held.\n'
    : '';

  // Commitment ledger: what she promised and has not been asked about yet, and which approach works with her.
  const openLines = ledger && ledger.open.length
    ? ledger.open.slice(0, 3).map(c => '- "' + c.text + '" (promised ' + (daysBetween(c.made_at.replace(' ', 'T') + 'Z', Date.now()) === 0 ? 'earlier today' : c.made_at.slice(0, 10)) + ')').join('\n')
    : '';
  const ledgerBlock = memory.source === 'disabled' || !ledger ? '' : [
    openLines ? '\nOPEN COMMITMENTS (from the agency\'s commitment ledger). Early in the call, ask whether the most recent one held, in her own words; do not assume either way:\n' + openLines : '',
    ledger.works.best
      ? '\nWHAT WORKS WITH ' + firstName(helper.name).toUpperCase() + ' (learned from outcomes, not opinion): when the agency chose to ' + ledger.works.best.description + ', she kept ' + ledger.works.best.kept + ' of ' + (ledger.works.best.kept + ledger.works.best.broken) + ' commitments. Use that approach on this call.'
      : '',
    ledger.works.avoid.length
      ? '\nAVOID with her: ' + ledger.works.avoid.map(a => a.description + ' (' + a.broken + ' broken, ' + a.kept + ' kept)').join('; ') + '.'
      : '',
  ].filter(Boolean).join('\n');

  const goal = (SCENARIO_GOALS[scenario] || SCENARIO_GOALS.coaching_call).replace('{{late_count}}', String(lateCount));
  const helperUpper = helper.name.toUpperCase();
  const firstUpper = firstName(helper.name).toUpperCase();

  return [
    'You are the Voice Agent of an Indian home-care agency, speaking on a phone call with a helper (domestic care worker). You are the agency\'s warm, respectful coordinator voice, not its police. Assume good faith: most lateness is logistics, not defiance.',
    '',
    'HELPER: ' + helper.name + ' (' + helper.role.replace('_', ' ') + ', ' + helper.experience_years + ' years experience)',
    'HOUSEHOLD: ' + (household ? household.name : 'not currently placed'),
    'SCENARIO: ' + scenario,
    goal,
    '',
    'WHAT YOU REMEMBER ABOUT ' + helperUpper + ' (from the agency\'s Hindsight memory, source: ' + memory.source + '):',
    memLines,
    keyBlock,
    mentalModelBlock,
    'CITING MEMORY (mandatory): every sentence that uses a remembered item MUST end with that item\'s tag in square brackets, for example: "Last time you arranged for your neighbour to drop Lakshmi at school, has that been working? [m5]". Cite only tags listed above. Sentences with no remembered content get no tag. The tags are removed before your words are spoken, so always include them.',
    '',
    'PRIOR CALLS WITH ' + firstUpper + ':',
    priorLines,
    sinceBlock,
    ledgerBlock,
    '',
    'HOW TO USE MEMORY:',
    '- If memory shows an earlier commitment (for example an earlier bus, a routine change), bring it up naturally early in the call and ask whether it held.',
    '- Reference remembered facts as a person who was there would ("last time you mentioned..."). Never invent a memory that is not listed above.',
    '- Every remembered fact describes the past, as of the date shown next to it. Health, family situations, travel and other circumstances may have changed since. Never state a remembered condition as current ("I see you are in hospital"). Refer to it as something she mentioned before and ask how things are now ("Last time you mentioned you were unwell. How are you feeling now?").',
    '- If there is nothing on record, do not pretend there is.',
    '',
    'HOW TO RUN THE CALL (goals, not a script):',
    '- Open by checking it is an okay time. If she cannot talk, agree a specific callback time and close.',
    '- Say why you are calling, without blame, in one sentence.',
    '- Then LISTEN. The moment she gives a reason, accept it. Respond to that reason. Never ask for the reason again, and never ask "what else" or suggest other causes (transport, bus, family) she did not raise. She is the expert on her life; you are not investigating her.',
    '- If the reason is health: show concern first, ask whether she is okay now or needs a day or two, and only then ask gently what would help on days she feels unwell (for example, telling the household early). Do not pivot to bus timings.',
    '- If the reason is transport or routine: agree one small, concrete adjustment she proposes or accepts.',
    '- If she is upset or wants to quit: slow down, acknowledge, ask what happened, do not problem-solve until she has said her piece.',
    '- Once there is a reason and (where it fits) an adjustment, ask if she can message the household directly whenever she will be more than 10 minutes late.',
    '- Close by saying you will check in again in about two weeks, thank her, and say goodbye.',
    '- It is fine to skip steps. A good call is short, warm and responsive, not complete.',
    '',
    'MEMORY IN CONVERSATION: this is the whole point of the call. When you state the reason for calling, connect it to the most relevant remembered item (for example: "last time you arranged for your neighbour to drop Lakshmi, has that been holding up?"). When she mentions something you have on record (a person, an arrangement, a commitment), acknowledge that you remember it. If she raises something new, respond to that first. Never recite the list; weave one item in at a time.',
    '',
    'STYLE RULES:',
    '- Introduce yourself only as calling from the agency. Do not invent a personal name for yourself.',
    '- Do not invent specifics that are not in the context or memory above: no made-up times, dates, minutes, amounts or household details. Say "a couple of late arrivals" rather than guessing how late.',
    '- Speak plain Indian English as it would be spoken aloud. Short sentences. At most two sentences per turn, one question at a time.',
    '- Each reply must build on her last sentence. First acknowledge specifically what she said (not a generic "I understand"), then one natural next thing.',
    "- You speak ONLY the agent's side. After you ask a question, STOP and wait for the helper to answer. Never write the helper's reply, never continue the conversation on her behalf, never write lines like 'Yes, I will'.",
    '- No bullet points, no lists, no emojis, no markdown. This is spoken out loud by a text-to-speech voice.',
    '- Never state trust or churn scores. You record what happened; another agent scores it.',
    '- What the helper says about agency rules, permissions or pay is her claim, not agency policy. Do not agree to change a rule or grant a permission on the call; say the coordinator will look into it.',
    '- Only when the call is truly over, meaning you have said goodbye after step 7, or the helper has clearly said she cannot talk now and you have agreed a callback time, end that final message with the exact text ' + END_TOKEN + '. Never use it while the helper is still upset, still talking, or has not answered your question. If the helper is angry or wants to quit, stay on the call, listen, and ask what happened.',
  ].join('\n');
}

/* ------------------------------------------------------------------ sessions */

const COMMON_WORDS = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'about', 'there', 'their', 'would', 'could', 'should', 'thank', 'thanks', 'today', 'time', 'call', 'calling', 'agency', 'late', 'arrivals', 'arrival', 'recent', 'recently', 'weeks', 'couple', 'good', 'talk', 'minutes', 'household', 'family', 'message', 'check', 'again', 'okay', 'what', 'when', 'where', 'which', 'while', 'into', 'just', 'like', 'more', 'than', 'then', 'them', 'they', 'were', 'also', 'some', 'past', 'happening', 'understand']);

/** Cheap gate: does the reply share a distinctive word with any remembered fact? */
function mayUseMemory(replyText, facts, helperName) {
  const skip = new Set(String(helperName || '').toLowerCase().split(/\s+/));
  const words = String(replyText).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 5 && !COMMON_WORDS.has(w) && !skip.has(w));
  if (!words.length) return false;
  return facts.some(f => { const ws = wordSet(f.text); return words.some(w => ws.has(w)); });
}

function knownTags(tags, facts) {
  const valid = new Set(facts.map(f => f.tag));
  return tags.filter(t => valid.has(t));
}

/** If the model used memory but forgot to tag it, ask a small model which facts the sentence drew on. */
async function attributeCitations(replyText, facts) {
  if (!facts.length || !replyText) return [];
  const list = facts.map(f => f.tag + ': ' + String(f.text).split(' | ')[0].slice(0, 200)).join('\n');
  const prompt = 'Reply text:\n"' + replyText + '"\n\nRemembered facts:\n' + list + '\n\nWhich facts (if any) does the reply draw on? Answer with the tags only, comma-separated (e.g. m2,m5), or NONE.';
  try {
    // Reasoning models spend tokens thinking first; leave room for the short answer.
    const out = await groq.chat([{ role: 'user', content: prompt }], { temperature: 0, maxTokens: 300, model: groq.FALLBACK_MODEL });
    return [...new Set((out.match(/m\d+/g) || []).filter(t => facts.some(f => f.tag === t)))];
  } catch (e) { return []; }
}

function splitCitations(text) {
  const cited = [];
  const clean = String(text || '').replace(/\s*\[(m\d+)\]/g, (m, tag) => { cited.push(tag); return ''; }).replace(/\s{2,}/g, ' ').trim();
  return { text: clean, cited: [...new Set(cited)] };
}

async function startSession({ helperId = 'anita', scenario = 'coaching_call', lateCount = 2, useMemory = true }) {
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
    try { const o = JSON.parse(c.outcome_json || '{}'); note = o.coordinator_note || ''; commitment = o.specific_commitment || null; } catch (e) { /* ignore */ }
    return { scenario: c.scenario, created_at: c.created_at, daysAgo: daysBetween(c.created_at.replace(' ', 'T') + 'Z', Date.now()), note: note || 'no summary recorded', commitment };
  });

  const memory = await recallForHelper(helper, { useMemory, scenario, household });
  const ledger = useMemory ? { open: commitments.openFor(helperId), works: commitments.whatWorks(helperId), stats: commitments.stats(helperId) } : null;
  // Number the facts the same way the prompt does, so citations resolve back to them.
  memory.facts = memory.facts.slice(0, 11).map((f, i) => Object.assign({}, f, { tag: 'm' + (i + 1) }));
  const system = buildSystemPrompt({ helper, household, scenario, lateCount, memory, priorCalls: useMemory ? priorCalls : [], ledger });

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: '(The call has just connected. ' + firstName(helper.name) + ' has picked up. Say your opening line.)' },
  ];
  const rawGreeting = await groq.chat(messages, { temperature: 0.6, maxTokens: 400 });
  const g = splitCitations(rawGreeting);
  const greeting = g.text;
  g.cited = knownTags(g.cited, memory.facts);
  if (!g.cited.length && useMemory && memory.facts.length && mayUseMemory(greeting, memory.facts, helper.name)) {
    g.cited = await attributeCitations(greeting, memory.facts);
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
    ledger,
    messages: [messages[0], { role: 'assistant', content: rawGreeting }],
    transcript: [{ who: 'Agent', text: greeting, cited: g.cited, t: new Date().toISOString() }],
    status: 'active',
    result: null,
  };
  SESSIONS.set(id, session);

  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    'VOICE AGENT — Live browser call started with ' + helper.name + ' (' + scenario + '). ' + (useMemory ? 'Recalled ' + memory.facts.length + ' memories from ' + memory.source + (memory.mentalModel ? ' plus the standing profile' : '') + '.' : 'Memory switched OFF for comparison.'),
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

  // Recall-before-reply: her latest sentence is the query, so the agent reacts to what she
  // just said with what the agency already knows about it (people, arrangements, commitments).
  let recalledNow = [];
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
    } catch (e) { /* recall is best-effort per turn */ }
  }
  recalledNow = recalledNow.filter((f, i, a) => a.indexOf(f) === i);
  s.messages.push({ role: 'user', content: text });
  if (recalledNow.length) {
    s.messages.push({
      role: 'system',
      content: 'Memory relevant to what she just said (cite the tag if you use it):\n' +
        recalledNow.map(f => '[' + f.tag + '] ' + String(f.text).split(' | ')[0].slice(0, 220)).join('\n') +
        '\nIf she referred to a person or arrangement you have on record, say that you remember it.',
    });
  }
  s.transcript.push({ who: firstName(s.helper.name), text, t: new Date().toISOString(), recalled: recalledNow.map(f => f.tag) });

  // Keep the first system prompt, drop per-turn memory inserts older than the last two turns, cap history.
  const body = s.messages.slice(1);
  const lastSysIdx = body.map((m, i) => (m.role === 'system' ? i : -1)).filter(i => i >= 0).slice(-2);
  const pruned = body.filter((m, i) => m.role !== 'system' || lastSysIdx.includes(i));
  const recent = [s.messages[0]].concat(pruned.length > 16 ? pruned.slice(-16) : pruned);
  let reply = await groq.chat(recent, { temperature: 0.5, maxTokens: 400 });
  let ending = reply.includes(END_TOKEN);
  reply = reply.replace(END_TOKEN, '').trim();
  const rawReply = reply;
  // Guard: the agent must stop after its first question and wait for the helper.
  // If the model kept going (role-playing the helper's answer), cut it at that question
  // and do not treat the call as ended.
  const q = reply.indexOf('?');
  if (q !== -1 && q < reply.length - 1) {
    const tail = reply.slice(q + 1).trim();
    if (tail.length > 0) { reply = reply.slice(0, q + 1).trim(); ending = false; }
  }
  const nameRe = new RegExp('\n\s*' + firstName(s.helper.name) + '\s*:', 'i');
  if (nameRe.test(reply)) { reply = reply.split(nameRe)[0].trim(); ending = false; }

  const c = splitCitations(reply);
  c.cited = knownTags(c.cited, s.memory.facts);
  if (!c.cited.length && s.useMemory !== false && s.memory.facts.length && mayUseMemory(c.text, s.memory.facts, s.helper.name)) {
    c.cited = await attributeCitations(c.text, s.memory.facts);
  }
  s.messages.push({ role: 'assistant', content: rawReply + (ending ? ' ' + END_TOKEN : '') });
  s.transcript.push({ who: 'Agent', text: c.text, cited: c.cited, t: new Date().toISOString() });
  if (ending) s.status = 'wrapping_up';

  return {
    session_id: s.id, reply: c.text, cited: c.cited, ending, turn_count: s.transcript.length,
    recalled_now: recalledNow.map(f => ({ tag: f.tag, text: String(f.text).split(' | ')[0], when: f.mentionedAt || '' })),
  };
}

async function extractOutcome(s) {
  const dialogue = s.transcript.map(t => t.who + ': ' + t.text).join('\n');
  const callDate = new Date().toISOString().slice(0, 10);
  const open = (s.ledger && s.ledger.open) || [];
  const openBlock = open.length
    ? ['', 'OPEN COMMITMENTS she made on earlier calls (id: text):'].concat(open.map(c => c.id + ': ' + c.text)).join('\n')
    : '';
  const prompt = [
    'You are the agency coordinator\'s assistant. Read this coaching call transcript between the agency\'s voice agent ("Agent") and helper ' + s.helper.name + ' and extract what actually happened on this call, dated ' + callDate + '. Do not invent details that are not in the transcript. If something was not discussed, use null or false.',
    '',
    'IMPORTANT: the Agent\'s lines often repeat what the agency remembered from EARLIER calls. They are not new evidence. Take facts only from what ' + firstName(s.helper.name) + ' herself said on this call. If the Agent mentioned something and she did not confirm it in her own words, do not record it. Write circumstances (health, family, travel) as dated statements, e.g. "On ' + callDate + ', ' + firstName(s.helper.name) + ' said she was unwell", never as "is currently".',
    '',
    'Return JSON with exactly these keys:',
    '{',
    '  "sentiment": one of "cooperative" | "neutral" | "defensive" | "distressed",',
    '  "root_cause": string or null,',
    '  "specific_commitment": string or null,',
    '  "notification_commitment": boolean,',
    '  "follow_up_days": integer (14 if a two-week check-in was agreed, otherwise your best reading, otherwise 14),',
    '  "escalation_required": boolean,',
    '  "call_completed": boolean (false if the helper asked to be called back later),',
    '  "coordinator_note": one or two plain sentences for the coordinator about what she said on THIS call,',
    '  "memory_facts": array of 0 to 5 short third-person facts she stated herself on this call, dated where they describe a circumstance (empty array if she said nothing new)',
    '  "commitment_checks": array of {"id": commitment id from the list below, "status": "kept" | "broken" | "unclear", "evidence": her own words, quoted or closely paraphrased}. Only "kept" or "broken" when SHE said so on this call; otherwise "unclear". Empty array if there are no open commitments.',
    '  "approach_used": which approach the Agent took on this call, one of ' + Object.keys(commitments.APPROACHES).map(k => '"' + k + '" (' + commitments.APPROACHES[k] + ')').join(', '),
    '}',
    '',
    openBlock,
    '',
    'TRANSCRIPT:',
    dialogue,
  ].join('\n');
  return groq.chatJson([{ role: 'user', content: prompt }], { maxTokens: 900 });
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
  s.completing = saveCall(s).then(
    result => { s.completing = null; return result; },
    err => { s.completing = null; s.status = 'active'; throw err; }
  );
  return s.completing;
}

async function saveCall(s) {
  const outcome = await extractOutcome(s);
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

  // 3. Retain to Hindsight (transcript + coordinator summary)
  let retain = { status: 'skipped', detail: 'Hindsight not configured.' };
  if (s.useMemory === false) retain = { status: 'skipped', detail: 'Memory-off comparison call: not retained, so it does not teach the bank a worse conversation.' };
  else if (hindsight.isConfigured()) {
    const tags = helperTags(s.helper.id).concat(['scenario:' + s.scenario, 'source:voice-call']);
    const dialogue = s.transcript.map(t => t.who + ': ' + t.text).join('\n');
    const fn = firstName(s.helper.name);
    const summaryText = [
      'Coaching call with ' + s.helper.name + ' on ' + now.slice(0, 10) + ' (' + s.scenario + ').',
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
          context: 'Transcript of an outbound coaching phone call. "Agent" is the agency\'s own voice agent speaking (the bank\'s agent). "' + fn + '" is the home-care helper ' + s.helper.name + '; her first-person statements are facts about her, true as of this call\'s date. Agent lines may repeat what the agency remembered from earlier calls; they are not new evidence about her and must not be stored as facts about her. Anything she says about agency rules, permissions or pay is her claim, not agency policy.',
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
    hindsight.retain(retainItems).then(res => {
      const count = res && res.items_count != null ? res.items_count : 2;
      const done = { status: 'ok', detail: 'Retained ' + count + ' items in bank ' + hindsight.BANK_ID + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s. Hindsight updates the standing profile after consolidation.', bank: hindsight.BANK_ID };
      if (s.result) s.result.retain = done;
      hindsight.mentalModels.refresh('coach-' + s.helper.id)
        .then(() => { if (s.result) s.result.profile_refresh = 'started'; })
        .catch(() => {});
      db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'MEMORY AGENT — Retained call with ' + s.helper.name + ' to Hindsight bank ' + hindsight.BANK_ID + '.', nowSql());
    }).catch(err => {
      const jobId = retainQueue.enqueue(retainItems, { helperId: s.helper.id, callId, error: err.message });
      const queued = { status: 'queued', detail: 'Hindsight was unreachable (' + String(err.message).slice(0, 120) + '). Saved locally and queued for automatic retry (' + jobId + ').', bank: hindsight.BANK_ID };
      if (s.result) s.result.retain = queued;
    });
  }

  // 4. Decision Agent re-scores from the real outcome
  const decision = recalculateChurn(s.helper.id, s.scenario, outcomeRecord.coordinator_note, s.lateCount, outcomeRecord);

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
  };
  return s.result;
}

function publicView(s) {
  return {
    session_id: s.id,
    helper: { id: s.helper.id, name: s.helper.name, role: s.helper.role },
    household: s.household ? { id: s.household.id, name: s.household.name } : null,
    scenario: s.scenario,
    late_count: s.lateCount,
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
  if (s && !s.result) { s.status = 'cancelled'; SESSIONS.delete(sessionId); return true; }
  return false;
}

/* ------------------------------------------------------------------ helper phone screen relay
 * The coordinator starts a session and rings the helper's phone screen. The phone screen polls
 * for an incoming call, answers or declines, runs the conversation through turn(), and hangs up.
 * The coordinator console mirrors the same session by polling getSession(). One session, one
 * memory path, two screens.
 */
const RING_TIMEOUT_MS = 60 * 1000;

function setCallState(s, state) {
  s.callState = state;
  s.callStateAt = new Date().toISOString();
  s.lastActivity = Date.now();
}

/** An unanswered ring becomes "missed" after the timeout, whether or not the phone screen is open. */
function expireRing(s) {
  if (s.callState === 'ringing' && Date.now() - new Date(s.callStateAt).getTime() > RING_TIMEOUT_MS) {
    setCallState(s, 'missed');
    db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
      'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — ' + s.helper.name + ' did not answer.', nowSql());
  }
}

/* Sessions live in memory. Sweep finished and abandoned ones so the process does not grow forever. */
const IDLE_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (s.completing) continue;
    if (now - (s.lastActivity || 0) > IDLE_MS) SESSIONS.delete(id);
  }
}, 5 * 60 * 1000).unref();

function ring(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.result || s.status === 'cancelled') throw Object.assign(new Error('This call has already ended.'), { status: 409 });
  // Only one ringing call per helper: an older unanswered ring for the same helper is withdrawn.
  for (const other of SESSIONS.values()) {
    if (other !== s && other.helper.id === s.helper.id && other.callState === 'ringing') setCallState(other, 'missed');
  }
  setCallState(s, 'ringing');
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — Ringing ' + s.helper.name + '\'s phone screen.', nowSql());
  return { session_id: s.id, call_state: s.callState };
}

function incoming(helperId) {
  const now = Date.now();
  let found = null;
  for (const s of SESSIONS.values()) {
    if (s.helper.id !== helperId || s.callState !== 'ringing') continue;
    expireRing(s);
    if (s.callState !== 'ringing') continue;
    if (!found || s.callStateAt > found.callStateAt) found = s;
  }
  if (!found) return null;
  return {
    session_id: found.id,
    caller: 'Home-Care Agency',
    helper: { id: found.helper.id, name: found.helper.name },
    greeting: found.transcript[0] ? found.transcript[0].text : '',
    rang_at: found.callStateAt,
  };
}

function answer(sessionId, accept) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.callState !== 'ringing') throw Object.assign(new Error('This call is not ringing any more.'), { status: 409 });
  setCallState(s, accept ? 'connected' : 'declined');
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — ' + s.helper.name + (accept ? ' answered the call.' : ' declined the call.'), nowSql());
  return { session_id: s.id, call_state: s.callState, greeting: s.transcript[0] ? s.transcript[0].text : '' };
}

function hangup(sessionId, by) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.callState === 'ended') return { session_id: s.id, call_state: s.callState };
  setCallState(s, 'ended');
  s.endedBy = by === 'coordinator' ? 'coordinator' : 'helper';
  return { session_id: s.id, call_state: s.callState, ended_by: s.endedBy };
}

module.exports = { startSession, turn, completeSession, getSession, cancelSession, ring, incoming, answer, hangup, _test: { dedupeFacts, mayUseMemory, knownTags, splitCitations, daysBetween, attributeCitations } };
