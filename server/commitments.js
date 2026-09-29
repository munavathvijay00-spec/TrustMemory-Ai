/**
 * Commitment ledger: what each helper promised, and whether she kept it.
 *
 * A commitment is opened when a call ends with a concrete promise. The next call asks about
 * it, and the outcome extraction marks it kept, broken or still open from the helper's own
 * words. Each commitment also records the coaching approach the agent used when it was made,
 * so the agency learns which approach actually leads to kept commitments with each helper.
 * Outcomes are retained to Hindsight too (see voice-agent.js), so the memory bank holds
 * what worked, not only what was said.
 */
const { istDate } = require('./dates');
const db = require('./db');

const APPROACHES = {
  reassure_first: 'reassure her first, then look for a fix together',
  listen_first: 'let her explain fully and acknowledge before suggesting anything',
  direct_problem_solving: 'move quickly to one practical fix',
  firm_reminder: 'restate the expectation clearly and kindly',
};

db.exec(`
  CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open', 'kept', 'broken', 'replaced')),
    approach TEXT,
    source TEXT NOT NULL DEFAULT 'call',
    made_at TEXT NOT NULL,
    made_call_id TEXT,
    resolved_at TEXT,
    resolved_call_id TEXT,
    evidence TEXT
  );
`);
// Added after the first version of the table: when the promise should be checked.
if (!db.prepare('PRAGMA table_info(commitments)').all().some(c => c.name === 'due_date')) {
  db.exec('ALTER TABLE commitments ADD COLUMN due_date TEXT');
}
// Added for learning across helpers: what kind of problem the promise was meant to fix.
if (!db.prepare('PRAGMA table_info(commitments)').all().some(c => c.name === 'problem_type')) {
  db.exec('ALTER TABLE commitments ADD COLUMN problem_type TEXT');
}

// Same list as PROBLEM_TYPES in voice/extraction.js (not required from there: extraction requires this module).
const PROBLEM_TYPES = ['transport', 'family', 'health', 'pay', 'workload', 'household_conflict', 'other'];
const PROBLEM_LABELS = { transport: 'transport', family: 'family', health: 'health', pay: 'pay', workload: 'workload', household_conflict: 'household conflict', other: 'other' };
const APPROACH_LABELS = { reassure_first: 'reassuring her first', listen_first: 'listening first', direct_problem_solving: 'going straight to a fix', firm_reminder: 'a firm reminder' };
const MIN_RESOLVED_FOR_PRIOR = 2;

const FOLLOW_UP_DAYS = 14;
const ESCALATE_AFTER_BROKEN = 2;     // broken promises ...
const ESCALATE_WINDOW_DAYS = 60;     // ... within this many days

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
function newId() { return 'cm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

function openFor(helperId) {
  return db.prepare("SELECT * FROM commitments WHERE helper_id = ? AND status = 'open' ORDER BY made_at DESC").all(helperId);
}

function listFor(helperId) {
  return helperId
    ? db.prepare('SELECT * FROM commitments WHERE helper_id = ? ORDER BY made_at DESC').all(helperId)
    : db.prepare('SELECT * FROM commitments ORDER BY made_at DESC').all();
}

function add({ helperId, text, approach = null, callId = null, source = 'call', madeAt = null, dueDate = null, problemType = null }) {
  const id = newId();
  const made = madeAt || nowSql();
  const due = dueDate || new Date(new Date(made.replace(' ', 'T') + 'Z').getTime() + FOLLOW_UP_DAYS * 86400000).toISOString().slice(0, 10);
  db.prepare('INSERT INTO commitments (id, helper_id, text, status, approach, source, made_at, made_call_id, due_date, problem_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, helperId, String(text).slice(0, 300), 'open', APPROACHES[approach] ? approach : null, source, made, callId, due, PROBLEM_TYPES.includes(problemType) ? problemType : null);
  return id;
}

/** Record what kind of problem a promise was meant to fix (set after the call's extraction). */
function setProblemType(id, problemType) {
  if (!PROBLEM_TYPES.includes(problemType)) return false;
  return db.prepare('UPDATE commitments SET problem_type = ? WHERE id = ?').run(problemType, id).changes > 0;
}

function resolve(id, status, { evidence = '', callId = null, at = null } = {}) {
  if (!['kept', 'broken', 'replaced'].includes(status)) return false;
  const r = db.prepare("UPDATE commitments SET status = ?, resolved_at = ?, resolved_call_id = ?, evidence = ? WHERE id = ? AND status = 'open'")
    .run(status, at || nowSql(), callId, String(evidence || '').slice(0, 300), id);
  if (r.changes > 0 && status === 'broken') escalateIfNeeded(id);
  return r.changes > 0;
}

/** Helpers who broke ESCALATE_AFTER_BROKEN or more promises within the window. */
function escalations() {
  const since = new Date(Date.now() - ESCALATE_WINDOW_DAYS * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  return db.prepare(`SELECT helper_id, COUNT(*) AS broken, MAX(resolved_at) AS last_broken_at
                     FROM commitments WHERE status = 'broken' AND resolved_at >= ?
                     GROUP BY helper_id HAVING COUNT(*) >= ? ORDER BY last_broken_at DESC`).all(since, ESCALATE_AFTER_BROKEN);
}

/** A second broken promise within the window flags the coordinator in the activity log. */
function escalateIfNeeded(commitmentId) {
  const row = db.prepare('SELECT helper_id FROM commitments WHERE id = ?').get(commitmentId);
  if (!row) return false;
  const hit = escalations().find(e => e.helper_id === row.helper_id);
  if (!hit) return false;
  const helper = db.prepare('SELECT name FROM helpers WHERE id = ?').get(row.helper_id);
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'decision', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    'DECISION AGENT — Escalation: ' + (helper ? helper.name : row.helper_id) + ' has broken ' + hit.broken + ' promises in ' + ESCALATE_WINDOW_DAYS + ' days. Coordinator review and a matching review are recommended.',
    nowSql());
  return true;
}

/** Open promises due for a check-in: overdue, today, or within the next few days. */
function due({ withinDays = 3 } = {}) {
  const limit = istDate(new Date(Date.now() + withinDays * 86400000));
  const today = istDate();
  return db.prepare(`SELECT c.*, h.name AS helper_name FROM commitments c JOIN helpers h ON h.id = c.helper_id
                     WHERE c.status = 'open' AND c.due_date IS NOT NULL AND c.due_date <= ? ORDER BY c.due_date ASC`).all(limit)
    .map(c => Object.assign(c, { overdue: c.due_date < today, due_today: c.due_date === today }));
}

/** Kept rate and, per approach, how often commitments made that way were kept. */
function stats(helperId) {
  const rows = listFor(helperId);
  const resolved = rows.filter(r => r.status === 'kept' || r.status === 'broken');
  const kept = resolved.filter(r => r.status === 'kept').length;
  const byApproach = {};
  for (const r of resolved) {
    if (!r.approach) continue;
    const a = byApproach[r.approach] || (byApproach[r.approach] = { kept: 0, broken: 0 });
    a[r.status] += 1;
  }
  return {
    total: rows.length,
    open: rows.filter(r => r.status === 'open').length,
    kept,
    broken: resolved.length - kept,
    kept_rate: resolved.length ? Math.round(kept / resolved.length * 100) : null,
    by_approach: byApproach,
  };
}

/**
 * Across every helper: for each approach, how often promises made that way were kept.
 * Optionally limited to one problem type. Sorted best first.
 */
function whatWorksAgency({ problemType = null } = {}) {
  const rows = problemType
    ? db.prepare("SELECT approach, status, helper_id FROM commitments WHERE status IN ('kept', 'broken') AND approach IS NOT NULL AND problem_type = ?").all(problemType)
    : db.prepare("SELECT approach, status, helper_id FROM commitments WHERE status IN ('kept', 'broken') AND approach IS NOT NULL").all();
  const by = {};
  for (const r of rows) {
    const a = by[r.approach] || (by[r.approach] = { kept: 0, broken: 0, helperIds: new Set() });
    a[r.status] += 1;
    a.helperIds.add(r.helper_id);
  }
  return Object.entries(by)
    .map(([approach, a]) => ({ approach, description: APPROACHES[approach], kept: a.kept, broken: a.broken, total: a.kept + a.broken, helpers: a.helperIds.size, kept_rate: Math.round(a.kept / (a.kept + a.broken) * 100) }))
    .sort((a, b) => b.kept_rate - a.kept_rate || b.kept - a.kept || b.total - a.total);
}

/**
 * The agency-wide approach to start from when a helper has little history of her own: the best
 * approach for this problem type (or overall) with at least MIN_RESOLVED_FOR_PRIOR resolved promises.
 */
function agencyPrior(problemType = null) {
  const pick = rows => rows.find(r => r.total >= MIN_RESOLVED_FOR_PRIOR && r.kept > 0 && r.kept_rate >= 50);
  const typed = problemType ? pick(whatWorksAgency({ problemType })) : null;
  const best = typed || pick(whatWorksAgency());
  if (!best) return null;
  return { problem_type: typed ? problemType : null, approach: best.approach, description: best.description, kept: best.kept, total: best.total, helpers: best.helpers };
}

function capitalise(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

/** One plain sentence per problem type, e.g. "For transport problems, listening first led to kept promises 2 of 2 times across 2 helpers." */
function takeaway(problemType, rows) {
  const label = PROBLEM_LABELS[problemType] || problemType;
  const best = rows.find(r => r.kept > 0);
  if (!best) {
    return `For ${label} problems, no approach has led to a kept promise yet (` + rows.map(r => APPROACH_LABELS[r.approach] + ' ' + r.kept + ' of ' + r.total).join(', ') + '). Look at the situation, not only the helper.';
  }
  const weak = rows.filter(r => r !== best && r.kept_rate < 50);
  const weakText = weak.map(w => ' ' + capitalise(APPROACH_LABELS[w.approach]) + ' was kept ' + w.kept + ' of ' + w.total + (w.total === 1 ? ' time.' : ' times.')).join('');
  const across = best.helpers === 1 ? '1 helper' : best.helpers + ' helpers';
  const thin = best.total < MIN_RESOLVED_FOR_PRIOR ? ' Only one result so far, so treat it as a hint.' : '';
  return `For ${label} problems, ${APPROACH_LABELS[best.approach]} led to kept promises ${best.kept} of ${best.total} ${best.total === 1 ? 'time' : 'times'} across ${across}.${weakText}${thin}`;
}

/** The agency learning table: problem type x approach, with a takeaway per problem type. */
function agencyLearning() {
  const types = db.prepare("SELECT DISTINCT problem_type FROM commitments WHERE problem_type IS NOT NULL AND status IN ('kept', 'broken') AND approach IS NOT NULL").all()
    .map(r => r.problem_type).sort((a, b) => PROBLEM_TYPES.indexOf(a) - PROBLEM_TYPES.indexOf(b));
  const byProblem = types.map(t => {
    const approaches = whatWorksAgency({ problemType: t });
    return { problem_type: t, label: PROBLEM_LABELS[t] || t, approaches, resolved: approaches.reduce((n, a) => n + a.total, 0), takeaway: takeaway(t, approaches) };
  });
  const untyped = db.prepare("SELECT COUNT(*) AS n FROM commitments WHERE problem_type IS NULL AND status IN ('kept', 'broken')").get().n;
  return { by_problem: byProblem, overall: whatWorksAgency(), prior: agencyPrior(), untyped_resolved: untyped, min_resolved_for_prior: MIN_RESOLVED_FOR_PRIOR, approach_labels: APPROACH_LABELS };
}

/**
 * The approach with the best evidence for this helper, or null when there is none.
 * Needs at least one kept commitment; ties go to the approach with more kept.
 * `prior` is the agency-wide starting point for her open promise's problem type (or overall).
 */
function whatWorks(helperId) {
  const s = stats(helperId);
  const ranked = Object.entries(s.by_approach)
    .map(([approach, c]) => ({ approach, kept: c.kept, broken: c.broken, rate: c.kept / (c.kept + c.broken) }))
    .sort((a, b) => b.rate - a.rate || b.kept - a.kept);
  const best = ranked.find(r => r.kept > 0) || null;
  const avoid = ranked.filter(r => r.broken > r.kept);
  const openTyped = db.prepare("SELECT problem_type FROM commitments WHERE helper_id = ? AND status = 'open' AND problem_type IS NOT NULL ORDER BY made_at DESC LIMIT 1").get(helperId);
  return {
    best: best ? Object.assign(best, { description: APPROACHES[best.approach] }) : null,
    avoid: avoid.map(r => Object.assign(r, { description: APPROACHES[r.approach] })),
    ranked,
    prior: agencyPrior(openTyped ? openTyped.problem_type : null),
  };
}

/** Kept rate over time, one point per resolution, oldest first (for the dashboard). */
function timeline() {
  const rows = db.prepare("SELECT helper_id, status, resolved_at FROM commitments WHERE status IN ('kept', 'broken') ORDER BY resolved_at ASC").all();
  let kept = 0;
  return rows.map((r, i) => {
    if (r.status === 'kept') kept += 1;
    return { at: r.resolved_at, helper_id: r.helper_id, status: r.status, cumulative_kept_rate: Math.round(kept / (i + 1) * 100) };
  });
}

/**
 * Historical commitments that match the seeded memory history (server/seed-memory.js), so the
 * ledger and the memory bank tell the same story from the first run. Only runs on an empty ledger.
 */
function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM commitments').get().n;
  if (n > 0) return 0;
  const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  const rows = [
    { helperId: 'radha', text: 'Ask her neighbour to take Lakshmi to school three days a week', approach: 'reassure_first', made: 34, resolved: 20, status: 'kept', evidence: 'Two weeks later she said the neighbour arrangement was working and she had not been late since.' },
    { helperId: 'sunita', text: 'Follow the written daily schedule at the Iyer household', approach: 'firm_reminder', made: 76, resolved: 70, status: 'broken', evidence: 'The Iyer family asked for her to be replaced; she said the schedule kept changing.' },
    { helperId: 'kavita', text: 'Stick to the agreed schedule and check in with Mrs Iyer each morning', approach: 'direct_problem_solving', made: 60, resolved: 55, status: 'broken', evidence: 'The placement ended; she said the instructions changed constantly.' },
  ];
  for (const r of rows) {
    const helper = db.prepare('SELECT 1 FROM helpers WHERE id = ?').get(r.helperId);
    if (!helper) continue;
    const id = add({ helperId: r.helperId, text: r.text, approach: r.approach, source: 'agency records', madeAt: daysAgo(r.made) });
    resolve(id, r.status, { evidence: r.evidence, at: daysAgo(r.resolved) });
  }
  return rows.length;
}

/**
 * Older agency records, from before the seeded memory history, so learning across helpers has
 * something to learn from on the first run. Fixed ids make this idempotent; the same facts are
 * retained to Hindsight by server/seed/outreach-seed.js. Also labels the problem type of the
 * original seed rows.
 */
const HISTORY = [
  { id: 'cm_hist_anita_bus', helperId: 'anita', text: 'Take the 7:10 bus instead of the 7:40 on days the Himayatnagar road floods', approach: 'listen_first', problem: 'transport', made: 180, resolved: 166, status: 'kept', evidence: 'She said the earlier bus worked and she had been on time every day since.' },
  { id: 'cm_hist_lakshmi_metro', helperId: 'lakshmi', text: 'Leave home fifteen minutes earlier while the metro works close her road', approach: 'listen_first', problem: 'transport', made: 200, resolved: 186, status: 'kept', evidence: 'The Sharma family confirmed she had been on time for two weeks.' },
  { id: 'cm_hist_priya_auto', helperId: 'priya', text: 'Take the shared auto from Banjara Hills on Mondays', approach: 'direct_problem_solving', problem: 'transport', made: 150, resolved: 137, status: 'broken', evidence: 'She said the shared auto kept running late and she was late twice more.' },
  { id: 'cm_hist_anita_call', helperId: 'anita', text: 'Call the family ahead whenever the bus is more than ten minutes late', approach: 'direct_problem_solving', problem: 'transport', made: 140, resolved: 126, status: 'kept', evidence: 'The Verma family said she always called ahead when running late.' },
  { id: 'cm_hist_anita_hospital', helperId: 'anita', text: 'Swap the Thursday evening shift so she can take her mother-in-law to hospital', approach: 'reassure_first', problem: 'family', made: 120, resolved: 106, status: 'kept', evidence: 'She said the swap worked and she had not missed a shift.' },
  { id: 'cm_hist_priya_leave', helperId: 'priya', text: 'Tell the Reddy family a day ahead before taking leave for family functions', approach: 'firm_reminder', problem: 'family', made: 170, resolved: 160, status: 'broken', evidence: 'She took a day off for her cousin\'s engagement without telling the family.' },
];
const SEED_PROBLEM_TYPES = [
  ['radha', 'Ask her neighbour to take Lakshmi to school%', 'family'],
  ['sunita', 'Follow the written daily schedule at the Iyer household%', 'household_conflict'],
  ['kavita', 'Stick to the agreed schedule and check in with Mrs Iyer%', 'household_conflict'],
];

function seedHistory() {
  const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  let added = 0;
  for (const r of HISTORY) {
    if (!db.prepare('SELECT 1 FROM helpers WHERE id = ?').get(r.helperId)) continue;
    const made = daysAgo(r.made);
    added += db.prepare(`INSERT OR IGNORE INTO commitments (id, helper_id, text, status, approach, source, made_at, resolved_at, evidence, due_date, problem_type)
                         VALUES (?, ?, ?, ?, ?, 'agency records', ?, ?, ?, ?, ?)`)
      .run(r.id, r.helperId, r.text, r.status, r.approach, made, daysAgo(r.resolved), r.evidence, made.slice(0, 10), r.problem).changes;
  }
  for (const [helperId, like, type] of SEED_PROBLEM_TYPES) {
    db.prepare('UPDATE commitments SET problem_type = ? WHERE helper_id = ? AND text LIKE ? AND problem_type IS NULL').run(type, helperId, like);
  }
  return added;
}

seedIfEmpty();
seedHistory();

module.exports = {
  APPROACHES, APPROACH_LABELS, PROBLEM_TYPES, PROBLEM_LABELS, HISTORY,
  openFor, listFor, add, resolve, stats, whatWorks, timeline, seedIfEmpty, seedHistory, due, escalations,
  setProblemType, whatWorksAgency, agencyPrior, agencyLearning,
};
