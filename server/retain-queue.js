/**
 * Durable retry for Hindsight retains.
 *
 * A call is always saved locally first. If the retain to Hindsight fails (network, 5xx,
 * timeout, rate limit), the items are written to the retain_jobs table and retried in the
 * background with backoff, including after a server restart. The UI can show how many are
 * still waiting via pendingCount().
 */
const db = require('./db');
const hindsight = require('./hindsight');

const MAX_ATTEMPTS = 6;
const TICK_MS = 60 * 1000;
const BACKOFF_MS = [30e3, 60e3, 120e3, 300e3, 600e3, 1200e3];

db.exec(`
  CREATE TABLE IF NOT EXISTS retain_jobs (
    id TEXT PRIMARY KEY,
    helper_id TEXT,
    call_id TEXT,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function nowIso() { return new Date().toISOString(); }
function nowSql() { return nowIso().replace('T', ' ').substring(0, 19); }

function enqueue(items, { helperId = null, callId = null, error = '' } = {}) {
  const id = 'rj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const next = new Date(Date.now() + BACKOFF_MS[0]).toISOString();
  db.prepare(`INSERT INTO retain_jobs (id, helper_id, call_id, payload, status, attempts, last_error, next_attempt_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)`)
    .run(id, helperId, callId, JSON.stringify(items), String(error).slice(0, 500), next, nowIso(), nowIso());
  return id;
}

function pendingCount() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM retain_jobs WHERE status = 'pending'").get();
  return row ? row.n : 0;
}

let running = false;

async function runOnce() {
  if (running || !hindsight.isConfigured()) return { attempted: 0 };
  running = true;
  let attempted = 0;
  try {
    const due = db.prepare("SELECT * FROM retain_jobs WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT 10").all(nowIso());
    for (const job of due) {
      attempted += 1;
      try {
        await hindsight.retain(JSON.parse(job.payload));
        db.prepare("UPDATE retain_jobs SET status = 'done', updated_at = ?, last_error = NULL WHERE id = ?").run(nowIso(), job.id);
        db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run(
          'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
          `MEMORY AGENT — Retry succeeded: call ${job.call_id || ''} is now retained in Hindsight bank ${hindsight.BANK_ID}.`, nowSql());
      } catch (err) {
        const attempts = job.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        const next = new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]).toISOString();
        db.prepare('UPDATE retain_jobs SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?')
          .run(giveUp ? 'failed' : 'pending', attempts, String(err.message).slice(0, 500), next, nowIso(), job.id);
      }
    }
  } finally {
    running = false;
  }
  return { attempted };
}

function start() {
  setTimeout(() => { runOnce().catch(() => {}); }, 5000).unref();
  setInterval(() => { runOnce().catch(() => {}); }, TICK_MS).unref();
}

module.exports = { enqueue, pendingCount, runOnce, start };
