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

function add({ helperId, text, approach = null, callId = null, source = 'call', madeAt = null, dueDate = null }) {
  const id = newId();
  const made = madeAt || nowSql();
  const due = dueDate || new Date(new Date(made.replace(' ', 'T') + 'Z').getTime() + FOLLOW_UP_DAYS * 86400000).toISOString().slice(0, 10);
  db.prepare('INSERT INTO commitments (id, helper_id, text, status, approach, source, made_at, made_call_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, helperId, String(text).slice(0, 300), 'open', APPROACHES[approach] ? approach : null, source, made, callId, due);
  return id;
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
  const limit = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
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
 * The approach with the best evidence for this helper, or null when there is none.
 * Needs at least one kept commitment; ties go to the approach with more kept.
 */
function whatWorks(helperId) {
  const s = stats(helperId);
  const ranked = Object.entries(s.by_approach)
    .map(([approach, c]) => ({ approach, kept: c.kept, broken: c.broken, rate: c.kept / (c.kept + c.broken) }))
    .sort((a, b) => b.rate - a.rate || b.kept - a.kept);
  const best = ranked.find(r => r.kept > 0) || null;
  const avoid = ranked.filter(r => r.broken > r.kept);
  return {
    best: best ? Object.assign(best, { description: APPROACHES[best.approach] }) : null,
    avoid: avoid.map(r => Object.assign(r, { description: APPROACHES[r.approach] })),
    ranked,
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

seedIfEmpty();

module.exports = { APPROACHES, openFor, listFor, add, resolve, stats, whatWorks, timeline, seedIfEmpty, due, escalations };
