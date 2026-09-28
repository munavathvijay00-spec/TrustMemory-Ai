/**
 * Live voice sessions: the in-memory map plus a SQLite copy so a call survives a restart.
 *
 * Every change to a live session (start, turn, call state) is written to voice_sessions.
 * Completed and cancelled sessions are removed from the table (they stay in memory so the
 * console can still read the result). On boot, restore() reloads sessions touched within
 * the last 30 minutes.
 */
const db = require('../db');

const SESSIONS = new Map();
const IDLE_MS = 30 * 60 * 1000;
const RESTORE_WINDOW_MS = 30 * 60 * 1000;

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_sessions (
    id TEXT PRIMARY KEY,
    helper_id TEXT,
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

/** Runtime-only fields that never go to disk (the in-flight save promise, the saved result). */
function serialize(s) {
  return JSON.stringify(s, (key, value) => (key === 'completing' || key === 'result' ? undefined : value));
}

function isLive(s) {
  return !s.result && s.status !== 'completed' && s.status !== 'cancelled';
}

function remove(id) {
  try { db.prepare('DELETE FROM voice_sessions WHERE id = ?').run(id); } catch { /* persistence is best-effort */ }
}

/** Write a live session to SQLite; a finished one is removed instead. */
function persist(s) {
  if (!s || !s.id) return;
  if (!isLive(s)) return remove(s.id);
  try {
    db.prepare(`INSERT INTO voice_sessions (id, helper_id, json, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET helper_id = excluded.helper_id, json = excluded.json, updated_at = excluded.updated_at`)
      .run(s.id, s.helper ? s.helper.id : null, serialize(s), Date.now());
  } catch (e) {
    console.warn('[TrustMemory AI] Could not persist voice session ' + s.id + ': ' + e.message);
  }
}

/** Reload live sessions updated within the window; older rows are dropped. Returns the count restored. */
function restore({ maxAgeMs = RESTORE_WINDOW_MS } = {}) {
  const cutoff = Date.now() - maxAgeMs;
  db.prepare('DELETE FROM voice_sessions WHERE updated_at < ?').run(cutoff);
  let restored = 0;
  for (const row of db.prepare('SELECT id, json FROM voice_sessions').all()) {
    if (SESSIONS.has(row.id)) continue;
    let s;
    try { s = JSON.parse(row.json); } catch { remove(row.id); continue; }
    // A save that was running when the process stopped never finished: let it be retried.
    if (s.status === 'completing') s.status = 'active';
    if (!Array.isArray(s.trace)) s.trace = [];
    s.result = null;
    SESSIONS.set(row.id, s);
    restored += 1;
  }
  return restored;
}

/* Sessions live in memory. Sweep finished and abandoned ones so the process does not grow forever. */
function sweep(now = Date.now()) {
  for (const [id, s] of SESSIONS) {
    if (s.completing) continue;
    if (now - (s.lastActivity || 0) > IDLE_MS) { SESSIONS.delete(id); remove(id); }
  }
  try { db.prepare('DELETE FROM voice_sessions WHERE updated_at < ?').run(now - IDLE_MS); } catch { /* best-effort */ }
}

setInterval(() => sweep(), 5 * 60 * 1000).unref();

module.exports = { SESSIONS, IDLE_MS, persist, remove, restore, sweep };
