/**
 * Calling before problems: who the coordinator should ring today, and why.
 *
 * Each helper gets a list of reasons, every one citing where it came from:
 *   - promise_due     an open promise whose check-in date has come (commitment ledger)
 *   - escalation      two or more broken promises in 60 days (commitment ledger)
 *   - festival_risk   a festival is coming and, last time, she went home and came back late or
 *                     left the household without cover (agency records + Hindsight memory)
 *   - advance_requests repeated salary-advance requests, often a sign she is about to leave
 *   - no_recent_call  nobody has spoken to a placed helper for a long time
 * Reasons are scored, the helpers ranked, and a one-paragraph `purpose` is written for the
 * voice agent so the call opens with why the agency is ringing.
 *
 * Also listens for finished calls (voice/hooks) to label the new promise with its problem type,
 * and retains a dated agency-level fact to Hindsight when what works for a problem type changes.
 */
const db = require('./db');
const commitments = require('./commitments');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');
const hooks = require('./voice/hooks');

db.exec(`
  CREATE TABLE IF NOT EXISTS outreach_signals (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('festival_travel', 'advance_request')),
    festival TEXT,
    occurred_on TEXT NOT NULL,
    days_late INTEGER,
    days_away INTEGER,
    cover_arranged INTEGER,
    detail TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'agency records'
  );
  CREATE TABLE IF NOT EXISTS agency_learning_state (
    key TEXT PRIMARY KEY,
    kept INTEGER NOT NULL,
    total INTEGER NOT NULL,
    retained_at TEXT NOT NULL
  );
`);

/**
 * Festivals when helpers in Hyderabad most often travel home. Dates from the Telangana
 * government holiday list for 2026 and the 2027 panchang (Sankranti, Ugadi); 2027 Dussehra and
 * Diwali are left out until the state's 2027 list is published (December 2026).
 */
const FESTIVALS = [
  { key: 'sankranti', name: 'Sankranti', date: '2026-01-15', aliases: ['sankranti', 'pongal', 'bhogi', 'kanuma'] },
  { key: 'ugadi', name: 'Ugadi', date: '2026-03-20', aliases: ['ugadi'] },
  { key: 'bonalu', name: 'Bonalu', date: '2026-08-10', aliases: ['bonalu'] },
  { key: 'bathukamma', name: 'Bathukamma', date: '2026-10-10', aliases: ['bathukamma'] },
  { key: 'dussehra', name: 'Dussehra', date: '2026-10-20', aliases: ['dussehra', 'dasara', 'dasera', 'vijayadashami', 'vijaya dasami', 'navratri'] },
  { key: 'diwali', name: 'Diwali', date: '2026-11-08', aliases: ['diwali', 'deepavali'] },
  { key: 'christmas', name: 'Christmas', date: '2026-12-25', aliases: ['christmas'] },
  { key: 'sankranti', name: 'Sankranti', date: '2027-01-15', aliases: ['sankranti', 'pongal', 'bhogi', 'kanuma'] },
  { key: 'ugadi', name: 'Ugadi', date: '2027-04-07', aliases: ['ugadi'] },
];
const FESTIVAL_LOOKAHEAD_DAYS = 45;
const ADVANCE_WINDOW_DAYS = 30;
const QUIET_DAYS = 45;              // a placed helper nobody has spoken to for this long
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_FAIL_TTL_MS = 60 * 1000;
const MEMORY_TIMEOUT_MS = 6000;

const WEIGHTS = { escalation: 45, promise_overdue: 40, promise_today: 35, promise_soon: 20, festival_late: 50, festival_no_cover: 30, festival_memory: 25, advance_requests: 35, no_recent_call: 10 };

function day(d) { return new Date(d).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(day(b)) - new Date(day(a))) / 86400000); }
function prettyDate(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function firstName(name) { return String(name || '').split(' ')[0]; }

/* ------------------------------------------------------------------ local signals (seeded, idempotent) */

function seedSignals(now = new Date()) {
  // Same arithmetic as the Hindsight seed (local date, 10:00), so both sides agree on the day.
  const ago = n => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d.toISOString().slice(0, 10); };
  const rows = [
    { id: 'os_radha_dussehra_2025', helper_id: 'radha', kind: 'festival_travel', festival: 'dussehra', occurred_on: '2025-09-29', days_late: 9, days_away: 14, cover_arranged: 0,
      detail: 'Radha went home to her mother\'s village near Warangal for Dussehra 2025. She had agreed to be back on 4 October and came back on 13 October, 9 days late, and the family she worked for had no cover for those days.' },
    { id: 'os_meena_diwali_2025', helper_id: 'meena', kind: 'festival_travel', festival: 'diwali', occurred_on: '2025-10-17', days_late: 0, days_away: 8, cover_arranged: 0,
      detail: 'Meena went home to Nashik for Diwali 2025 for eight days, as agreed. No cover was arranged, and the Nair family said their father\'s kidney diet slipped while she was away.' },
    { id: 'os_sunita_advance_1', helper_id: 'sunita', kind: 'advance_request', occurred_on: ago(21),
      detail: 'Sunita asked for an advance of Rs 3,000 on her salary to pay her evening-class fees.' },
    { id: 'os_sunita_advance_2', helper_id: 'sunita', kind: 'advance_request', occurred_on: ago(5),
      detail: 'Sunita asked for a second salary advance this month, Rs 2,000, saying her rent had gone up.' },
  ];
  let added = 0;
  for (const r of rows) {
    if (!db.prepare('SELECT 1 FROM helpers WHERE id = ?').get(r.helper_id)) continue;
    // Relative rows ("21 days ago") are re-dated on every start so the demo never goes stale.
    added += db.prepare(`INSERT INTO outreach_signals (id, helper_id, kind, festival, occurred_on, days_late, days_away, cover_arranged, detail)
                         VALUES (@id, @helper_id, @kind, @festival, @occurred_on, @days_late, @days_away, @cover_arranged, @detail)
                         ON CONFLICT(id) DO UPDATE SET occurred_on = excluded.occurred_on`)
      .run(Object.assign({ festival: null, days_late: null, days_away: null, cover_arranged: null }, r)).changes;
  }
  return added;
}
seedSignals();

/* ------------------------------------------------------------------ Hindsight memory, cached per helper */

const memoryCache = new Map();

const FESTIVAL_WORDS = /festival|went home|going home|native place|village|dussehra|dasara|diwali|deepavali|sankranti|pongal|ugadi|bathukamma|bonalu|eid|christmas|came back late|returned late/i;
// A request to the agency for money ahead of payday; not "advanced training" or "a roster in advance".
const ADVANCE_WORDS = /\b(salary|wages?)\s+advance|\bpay\s+advance\b(?!\s+rent)|\badvance\s+(salary|pay|wages?)\b|\badvance\s+(of|on|against)\b.{0,60}?\b(salary|pay|wages?)\b|\basked\b.{0,40}\ban advance\b|\bloan from the agency\b/i;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Hindsight recall timed out')), ms))]);
}

/** Festival-travel and salary-advance facts Hindsight holds about this helper ([] on any failure). */
async function memoryFacts(helperId, { now = Date.now() } = {}) {
  if (!hindsight.isConfigured()) return { facts: [], source: 'off' };
  const hit = memoryCache.get(helperId);
  if (hit && now - hit.at < hit.ttl) return hit.value;
  let value;
  try {
    const results = await withTimeout(hindsight.recall(
      'Going home to her village or native place for a festival, coming back late after a festival, and asking the agency for a salary advance or loan',
      { tags: ['helper:' + helperId], tagsMatch: 'any', budget: 'low', maxTokens: 1200, limit: 8 }), MEMORY_TIMEOUT_MS);
    const facts = results
      .filter(r => FESTIVAL_WORDS.test(r.text) || ADVANCE_WORDS.test(r.text))
      .map(r => ({ id: r.id, text: String(r.text).split(' | ')[0], when: r.mentionedAt ? day(r.mentionedAt) : '', festival: FESTIVAL_WORDS.test(r.text), advance: ADVANCE_WORDS.test(r.text) }));
    value = { facts, source: 'hindsight' };
    memoryCache.set(helperId, { at: now, ttl: MEMORY_TTL_MS, value });
  } catch (err) {
    value = { facts: [], source: 'unavailable', error: err.message };
    memoryCache.set(helperId, { at: now, ttl: MEMORY_FAIL_TTL_MS, value });
  }
  return value;
}

function clearMemoryCache() { memoryCache.clear(); }

/* ------------------------------------------------------------------ today's calls */

function upcomingFestivals(now = new Date()) {
  const today = day(now);
  return FESTIVALS
    .filter(f => f.date >= today && daysBetween(today, f.date) <= FESTIVAL_LOOKAHEAD_DAYS)
    .map(f => Object.assign({}, f, { days_away: daysBetween(today, f.date) }));
}

function festivalOf(text) {
  const t = String(text || '').toLowerCase();
  const f = FESTIVALS.find(x => x.aliases.some(a => t.includes(a)));
  return f ? f.key : null;
}

/** The latest call in the call log (calls made from this console), or null. */
function lastCall(helperId) {
  const row = db.prepare('SELECT MAX(created_at) AS at FROM calls WHERE helper_id = ?').get(helperId);
  return (row && row.at) || null;
}

function reasonsFor(helper, { now, due, escalations, festivals, memory }) {
  const reasons = [];
  const today = day(now);
  const name = firstName(helper.name);

  for (const c of due.filter(d => d.helper_id === helper.id)) {
    const weight = c.overdue ? WEIGHTS.promise_overdue + Math.min(15, daysBetween(c.due_date, today)) : c.due_today ? WEIGHTS.promise_today : WEIGHTS.promise_soon;
    reasons.push({
      kind: 'promise_due', weight,
      text: c.overdue ? `Promise check-in overdue by ${daysBetween(c.due_date, today)} day${daysBetween(c.due_date, today) === 1 ? '' : 's'}` : c.due_today ? 'Promise check-in due today' : `Promise check-in due ${prettyDate(c.due_date)}`,
      evidence: `She promised: "${c.text}" (made ${day(c.made_at.replace(' ', 'T') + 'Z')}).`,
      when: c.due_date, source: 'commitment ledger', ref: c.id,
      purpose: `Check on the promise she made: "${c.text}". Ask in her own words whether it held, before suggesting anything new.`,
    });
  }

  const esc = escalations.find(e => e.helper_id === helper.id);
  if (esc) {
    reasons.push({
      kind: 'escalation', weight: WEIGHTS.escalation,
      text: `Broke ${esc.broken} promises in 60 days`,
      evidence: `Latest broken promise recorded ${day(esc.last_broken_at.replace(' ', 'T') + 'Z')}.`,
      when: day(esc.last_broken_at.replace(' ', 'T') + 'Z'), source: 'commitment ledger',
      purpose: `She has broken ${esc.broken} promises in 60 days. Understand what is getting in the way before setting anything new.`,
    });
  }

  // Festival risk: local agency records first, then anything Hindsight remembers about festival travel.
  const travel = db.prepare("SELECT * FROM outreach_signals WHERE helper_id = ? AND kind = 'festival_travel' ORDER BY occurred_on DESC").all(helper.id);
  for (const f of festivals) {
    const past = travel.find(t => t.festival === f.key);
    const memFacts = memory.facts.filter(m => m.festival && festivalOf(m.text) === f.key);
    if (!past && !memFacts.length) continue;
    const soon = f.days_away <= 14 ? 15 : f.days_away <= 30 ? 10 : 0;
    const when = `${f.name} is on ${prettyDate(f.date)} (in ${f.days_away} day${f.days_away === 1 ? '' : 's'})`;
    let text; let purpose; let weight;
    if (past && past.days_late > 0) {
      weight = WEIGHTS.festival_late + soon;
      text = `${when}. Last ${f.name} she came back ${past.days_late} days late`;
      purpose = `${f.name} is on ${prettyDate(f.date)}. Last ${f.name} ${name} went home and came back ${past.days_late} days late. Ask kindly about her travel plans now and agree the dates she will be away, so cover can be arranged early.`;
    } else if (past) {
      weight = WEIGHTS.festival_no_cover + soon;
      text = `${when}. Last ${f.name} she was away ${past.days_away || 'several'} days${past.cover_arranged ? '' : ' with no cover arranged'}`;
      purpose = `${f.name} is on ${prettyDate(f.date)}. Last ${f.name} ${name} was away ${past.days_away || 'several'} days${past.cover_arranged ? '' : ' and no cover was arranged'}. Ask about her plans and agree the dates early so cover can be planned.`;
    } else {
      weight = WEIGHTS.festival_memory + soon;
      text = `${when}. Memory mentions festival travel`;
      purpose = `${f.name} is on ${prettyDate(f.date)}. The agency remembers her travelling for festivals before. Ask about her plans and agree dates early.`;
    }
    reasons.push({
      kind: 'festival_risk', weight, text,
      evidence: past ? past.detail : memFacts[0].text,
      when: past ? past.occurred_on : memFacts[0].when,
      source: past ? 'agency records' : 'Hindsight memory', ref: past ? past.id : memFacts[0].id,
      memory: memFacts.map(m => ({ text: m.text, when: m.when })),
      festival: { key: f.key, name: f.name, date: f.date, days_away: f.days_away },
      purpose,
    });
  }

  // Repeated salary-advance requests.
  const since = day(new Date(now.getTime() - ADVANCE_WINDOW_DAYS * 86400000));
  const adv = db.prepare("SELECT * FROM outreach_signals WHERE helper_id = ? AND kind = 'advance_request' AND occurred_on >= ? ORDER BY occurred_on DESC").all(helper.id, since);
  // Memory facts often come back twice (fact and observation); count one per day.
  const advMem = memory.facts.filter(m => m.advance && m.when && m.when >= since && !adv.some(a => Math.abs(daysBetween(a.occurred_on, m.when)) <= 1))
    .filter((m, i, all) => all.findIndex(x => x.when === m.when) === i);
  const advCount = adv.length + advMem.length;
  if (advCount >= 2) {
    const latest = adv[0] || advMem[0];
    reasons.push({
      kind: 'advance_requests', weight: WEIGHTS.advance_requests,
      text: `Asked for a salary advance ${advCount} times in ${ADVANCE_WINDOW_DAYS} days`,
      evidence: adv.map(a => `${a.occurred_on}: ${a.detail}`).concat(advMem.map(m => `${m.when}: ${m.text}`)).join(' '),
      when: latest.occurred_on || latest.when, source: adv.length ? 'agency records' : 'Hindsight memory',
      memory: advMem.map(m => ({ text: m.text, when: m.when })),
      purpose: `${name} has asked for a salary advance ${advCount} times in the last month. Gently ask whether something has changed at home, and whether she is thinking of leaving, without judging.`,
    });
  }

  // Nobody has spoken to a placed helper for a long time.
  const placed = db.prepare("SELECT 1 FROM placements WHERE helper_id = ? AND status = 'active'").get(helper.id);
  if (placed) {
    const last = lastCall(helper.id);
    const lastDay = last ? day(last.replace(' ', 'T') + 'Z') : null;
    const quiet = lastDay ? daysBetween(lastDay, today) : null;
    if (quiet == null || quiet >= QUIET_DAYS) {
      reasons.push({
        kind: 'no_recent_call', weight: WEIGHTS.no_recent_call,
        text: quiet == null ? 'No call logged yet' : `No call logged in ${quiet} days`,
        evidence: lastDay ? `Last call in the call log: ${lastDay}.` : 'The call log has no call with her yet.',
        when: lastDay || '', source: 'call log',
        purpose: `A friendly check-in: the call log has no call with ${name} ${quiet == null ? 'yet' : 'in ' + quiet + ' days'}.`,
      });
    }
  }
  return reasons.sort((a, b) => b.weight - a.weight);
}

function priorityOf(score) { return score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'; }

/** Ranked list of helpers to ring today, each with dated, sourced reasons and a call purpose. */
async function today({ now = new Date(), useMemory = true, limit = 8 } = {}) {
  const helpers = db.prepare('SELECT id, name FROM helpers ORDER BY name').all();
  const due = commitments.due({ withinDays: 3 });
  const escalations = commitments.escalations();
  const festivals = upcomingFestivals(now);

  const memories = {};
  let memorySource = 'off';
  if (useMemory && hindsight.isConfigured()) {
    const settled = await Promise.allSettled(helpers.map(h => memoryFacts(h.id)));
    settled.forEach((r, i) => { memories[helpers[i].id] = r.status === 'fulfilled' ? r.value : { facts: [], source: 'unavailable' }; });
    const sources = Object.values(memories).map(m => m.source);
    memorySource = sources.every(s => s === 'hindsight') ? 'hindsight' : sources.some(s => s === 'hindsight') ? 'partial' : 'unavailable';
  }

  const calls = helpers.map(h => {
    const reasons = reasonsFor(h, { now, due, escalations, festivals, memory: memories[h.id] || { facts: [] } });
    if (!reasons.length) return null;
    // The strongest reason dominates; further reasons add less each.
    const score = Math.min(100, Math.round(reasons.reduce((n, r, i) => n + r.weight * (i === 0 ? 1 : 0.4), 0)));
    const purpose = reasons.slice(0, 2).map(r => r.purpose).join(' ').slice(0, 300);
    return {
      helper_id: h.id, helper_name: h.name, score, priority: priorityOf(score),
      reasons: reasons.map(r => ({ kind: r.kind, text: r.text, evidence: r.evidence, when: r.when, source: r.source, ref: r.ref || null, memory: r.memory || [], festival: r.festival || null })),
      purpose,
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.helper_name.localeCompare(b.helper_name));

  return {
    generated_at: new Date().toISOString(),
    today: day(now),
    calls: calls.slice(0, limit),
    more: Math.max(0, calls.length - limit),
    upcoming_festivals: festivals.map(f => ({ name: f.name, date: f.date, days_away: f.days_away })),
    memory_source: memorySource,
  };
}

/* ------------------------------------------------------------------ after each call */

function learningFact(problemType, row, now = new Date()) {
  const label = commitments.PROBLEM_LABELS[problemType] || problemType;
  const approach = commitments.APPROACH_LABELS[row.approach] || row.approach;
  return `As of ${day(now)}, across the agency, when helpers had ${label} problems, promises made after the agency's voice agent used ${approach} were kept ${row.kept} of ${row.total} times, across ${row.helpers} helper${row.helpers === 1 ? '' : 's'}.`;
}

/**
 * Retain a dated agency-level fact when an approach's record for a problem type changes
 * (only once it has MIN resolved promises). Upserts one document per problem type and approach.
 */
function retainLearning(problemTypes, { now = new Date() } = {}) {
  const items = [];
  for (const t of new Set(problemTypes.filter(Boolean))) {
    for (const row of commitments.whatWorksAgency({ problemType: t })) {
      if (row.total < 2) continue;
      const key = t + ':' + row.approach;
      const prev = db.prepare('SELECT kept, total FROM agency_learning_state WHERE key = ?').get(key);
      if (prev && prev.kept === row.kept && prev.total === row.total) continue;
      db.prepare('INSERT INTO agency_learning_state (key, kept, total, retained_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET kept = excluded.kept, total = excluded.total, retained_at = excluded.retained_at')
        .run(key, row.kept, row.total, now.toISOString());
      items.push({
        content: learningFact(t, row, now),
        context: 'Agency-wide learning from the commitment ledger: which coaching approach led to kept promises, by kind of problem.',
        documentId: 'ledger:agency:' + key,
        timestamp: now.toISOString(),
        metadata: { kind: 'agency_learning', problem_type: t, approach: row.approach },
        tags: ['source:ledger', 'agency:learning', 'problem:' + t],
      });
    }
  }
  if (items.length && hindsight.isConfigured()) {
    hindsight.retain(items).catch(err => retainQueue.enqueue(items, { callId: 'agency-learning', error: err.message }));
  }
  return items;
}

/** Label the new promise with its problem type, then retain what the agency has learned. */
function onCallSaved({ outcome }) {
  if (!outcome) return { labelled: false, retained: 0 };
  const type = commitments.PROBLEM_TYPES.includes(outcome.problem_type) ? outcome.problem_type : null;
  let labelled = false;
  if (type && outcome.new_commitment_id) labelled = commitments.setProblemType(outcome.new_commitment_id, type);
  // Promises resolved on this call keep the problem type they were made with.
  const resolvedTypes = (outcome.commitment_checks || []).map(c => {
    const row = db.prepare('SELECT problem_type FROM commitments WHERE id = ?').get(c.id);
    return row && row.problem_type;
  });
  const retained = retainLearning(resolvedTypes);
  return { labelled, retained: retained.length };
}

hooks.onCallSaved(onCallSaved);

module.exports = { FESTIVALS, today, reasonsFor, upcomingFestivals, memoryFacts, clearMemoryCache, seedSignals, onCallSaved, retainLearning, learningFact };
