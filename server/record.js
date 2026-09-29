/**
 * Remember responsibly: memory a helper can see, correct and have forgotten, and facts about
 * temporary circumstances that expire.
 *
 * - recordFor: what the agency remembers about her FROM HER OWN WORDS (her call statements, her
 *   requests and preferences, her corrections). Household feedback, coordinator notes, safety
 *   signals, scores and standing profiles are never shown to her.
 * - correct: her correction, retained in her words; recall puts it ahead of the older fact.
 * - retire / restore: once the coordinator agrees, the fact she corrected is invalidated in
 *   Hindsight, so recall never returns it again; it stays on record and can be restored.
 * - markExpired: "unwell", "went home", "on leave" said more than 30 days ago is marked as
 *   possibly outdated, so the agent does not state it as current.
 * - forget: on the coordinator's request, delete every memory about her (Hindsight documents tagged
 *   helper:<id>, her standing profile, her local personal data) and anonymise her roster row.
 */
const db = require('./db');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');

db.exec(`
  CREATE TABLE IF NOT EXISTS record_corrections (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    fact TEXT,
    correction TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
// memory_id: the Hindsight fact she corrected. status: pending -> retired (old fact invalidated) | kept | restored.
{
  const cols = new Set(db.prepare('PRAGMA table_info(record_corrections)').all().map(c => c.name));
  if (!cols.has('memory_id')) db.exec('ALTER TABLE record_corrections ADD COLUMN memory_id TEXT');
  if (!cols.has('status')) db.exec("ALTER TABLE record_corrections ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  if (!cols.has('reviewed_at')) db.exec('ALTER TABLE record_corrections ADD COLUMN reviewed_at TEXT');
}
const MEMORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXPIRE_DAYS = 30;
// Circumstances that stop being true on their own: health, travel, leave, "this week".
const TEMPORARY = /\b(unwell|sick|ill|fever|cough|cold|injur\w*|hospital\w*|recover\w*|travel\w*|went home|going home|gone home|on leave|taking leave|village|native place|out of town|festival|running late|this week|this month)\b/i;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.status = 404; this.code = 'NOT_FOUND'; }
}
class MemoryUnavailableError extends Error {
  constructor(message) { super(message); this.status = 502; this.code = 'MEMORY_UNAVAILABLE'; }
}

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
function newId(prefix) { return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
function core(text) { return String(text || '').split(' | ')[0].trim(); }
function helperRow(id) { return db.prepare('SELECT * FROM helpers WHERE id = ?').get(id) || null; }

function activity(text) {
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run(newId('act_'), text, nowSql());
}

/* ------------------------------------------------------------------ expiry */

function isTemporary(text) { return TEMPORARY.test(core(text)); }

/** Flag facts about temporary circumstances older than EXPIRE_DAYS as possibly outdated (in place). */
function markExpired(facts, now = Date.now()) {
  for (const f of facts || []) {
    const when = Date.parse(String(f.mentionedAt || '').replace(' ', 'T'));
    if (!Number.isNaN(when) && isTemporary(f.text) && now - when > EXPIRE_DAYS * 86400000) f.outdated = true;
  }
  return facts;
}

/* ------------------------------------------------------------------ her record */

/** True when a recalled memory came from the helper's own words (never feedback, notes, flags, profiles). */
function isHerWords(f) {
  if (!f || f.type === 'observation') return false;
  const doc = String(f.documentId || '');
  const tags = f.tags || [];
  const kind = (f.metadata || {}).kind;
  if (doc.startsWith('correction:') || tags.includes('source:helper_correction')) return true;
  // Both sides' requests carry both tags; who wrote it is in the metadata (helper_id or household_id).
  const fromHousehold = Boolean((f.metadata || {}).household_id) && !(f.metadata || {}).helper_id;
  if (!fromHousehold && (doc.startsWith('request:') || doc.startsWith('prefs:helper:') || tags.includes('source:self_report'))) return true;
  if (/^call:.+:transcript$/.test(doc)) return true;
  if (doc.startsWith('seed:') && kind === 'helperSaid') return true;
  return false;
}

function originOf(f) {
  const doc = String(f.documentId || '');
  if (doc.startsWith('correction:')) return 'your correction';
  if (doc.startsWith('request:') || doc.startsWith('prefs:')) return 'you told the agency in this app';
  return 'you said on a call';
}

function correctionsFor(helperId, limit = 10) {
  return db.prepare('SELECT id, fact, correction, created_at, memory_id, status, reviewed_at FROM record_corrections WHERE helper_id = ? ORDER BY created_at DESC LIMIT ?').all(helperId, limit);
}

/** Local fallback: facts extracted from her own words on saved calls, and her own requests. */
function localRecord(helperId) {
  const out = [];
  for (const c of db.prepare("SELECT created_at, outcome_json FROM calls WHERE helper_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 20").all(helperId)) {
    let o = {};
    try { o = JSON.parse(c.outcome_json || '{}'); } catch { o = {}; }
    for (const f of Array.isArray(o.memory_facts) ? o.memory_facts : []) out.push({ text: String(f), when: c.created_at, origin: 'you said on a call' });
  }
  try {
    for (const r of db.prepare("SELECT text, created_at FROM requests WHERE role = 'helper' AND person_id = ? ORDER BY created_at DESC LIMIT 10").all(helperId)) {
      out.push({ text: r.text, when: r.created_at, origin: 'you told the agency in this app' });
    }
  } catch { /* requests table not created yet */ }
  return out;
}

async function recordFor(helperId) {
  const helper = helperRow(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');
  let facts = [];
  let source = 'local';
  if (hindsight.isConfigured()) {
    try {
      const hits = await hindsight.recall(
        `${helper.name}: what she said about her situation, her family, her schedule, her work and what she agreed`,
        { tags: ['helper:' + helper.id], budget: 'mid', limit: 25 }
      );
      const seen = new Set();
      facts = hits.filter(isHerWords).map(f => ({ id: f.id || null, text: core(f.text), when: String(f.mentionedAt || '').slice(0, 10), origin: originOf(f) }))
        .filter(f => { const k = f.text.toLowerCase(); if (!f.text || seen.has(k)) return false; seen.add(k); return true; });
      source = 'hindsight';
    } catch {
      facts = localRecord(helper.id);
    }
  } else {
    facts = localRecord(helper.id);
  }
  markExpired(facts.map(f => Object.assign(f, { mentionedAt: f.when })));
  for (const f of facts) delete f.mentionedAt;
  facts.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  return { helper: { id: helper.id, name: helper.name }, facts, corrections: correctionsFor(helper.id), source };
}

/* ------------------------------------------------------------------ correction */

function correct(helperId, { fact, correction, memory_id: memoryId } = {}) {
  const helper = helperRow(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');
  const c = String(correction == null ? '' : correction).replace(/\s+/g, ' ').trim();
  const f = String(fact == null ? '' : fact).replace(/\s+/g, ' ').trim();
  if (c.length < 3 || c.length > 400) throw new ValidationError('Say what is right in 3 to 400 characters.');
  if (f.length > 400) throw new ValidationError('The fact you are correcting is too long.');
  const mid = memoryId && MEMORY_ID.test(String(memoryId)) ? String(memoryId) : null;
  const id = newId('corr_');
  const created = nowSql();
  db.prepare('INSERT INTO record_corrections (id, helper_id, fact, correction, created_at, memory_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, helper.id, f || null, c, created, mid);
  activity('MEMORY AGENT — A helper corrected the agency\'s record in her own words.');

  if (hindsight.isConfigured()) {
    const item = {
      content: `On ${created.slice(0, 10)}, ${helper.name} said the agency's record about her was wrong${f ? ` ("${f}")` : ''}. In her words: "${c}"`,
      context: 'The helper corrected the agency\'s record herself, in her own view of the agency app. Her correction replaces the older fact it refers to.',
      documentId: 'correction:' + id,
      timestamp: new Date().toISOString(),
      metadata: { helper_id: helper.id, kind: 'correction' },
      tags: ['helper:' + helper.id, 'source:helper_correction'],
    };
    hindsight.retain([item]).catch(err => retainQueue.enqueue([item], { helperId: helper.id, callId: 'correction', error: err.message }));
  }
  return { id, fact: f || null, correction: c, created_at: created, memory_id: mid, status: 'pending' };
}

/* ------------------------------------------------------------------ coordinator review */

function correctionRow(id) {
  const row = db.prepare('SELECT * FROM record_corrections WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('Unknown correction.');
  return row;
}

function setStatus(row, status) {
  const at = nowSql();
  db.prepare('UPDATE record_corrections SET status = ?, reviewed_at = ? WHERE id = ?').run(status, at, row.id);
  return Object.assign({}, row, { status, reviewed_at: at });
}

/** The fact must be one of her own raw facts in Hindsight, never someone else's or a derived observation. */
async function herFact(row) {
  if (!row.memory_id) throw new ValidationError('This correction is not linked to a stored memory, so there is nothing to retire.');
  if (!hindsight.isConfigured()) throw new MemoryUnavailableError('Hindsight is not configured.');
  let m;
  try { m = await hindsight.memories.get(row.memory_id); } catch (err) {
    if (err.status === 404) throw new NotFoundError('That memory no longer exists.');
    throw new MemoryUnavailableError('Could not reach the memory bank. Try again in a minute. (' + err.message + ')');
  }
  const type = m.fact_type || m.type;
  if (!(m.tags || []).includes('helper:' + row.helper_id) || type === 'observation') throw new ValidationError('That memory is not one of her own facts.');
  return m;
}

/** Coordinator agrees with her: invalidate the old fact in Hindsight. Recall never returns it again. */
async function retire(correctionId) {
  const row = correctionRow(correctionId);
  if (row.status === 'retired') return row;
  await herFact(row);
  const helper = helperRow(row.helper_id);
  const reason = `Corrected by ${helper ? helper.name : 'the helper'} on ${row.created_at.slice(0, 10)}: "${row.correction}"`.slice(0, 480);
  try { await hindsight.memories.invalidate(row.memory_id, reason); } catch (err) {
    throw new MemoryUnavailableError('Could not retire the fact, so nothing changed. (' + err.message + ')');
  }
  activity('MEMORY AGENT — Retired a fact a helper corrected, after the coordinator agreed. It stays on record and can be restored.');
  return setStatus(row, 'retired');
}

/** Undo a retire: the fact is valid again and recall can return it. */
async function restore(correctionId) {
  const row = correctionRow(correctionId);
  if (row.status !== 'retired') throw new ValidationError('Only a retired fact can be restored.');
  await herFact(row);
  try { await hindsight.memories.restore(row.memory_id); } catch (err) {
    throw new MemoryUnavailableError('Could not restore the fact. (' + err.message + ')');
  }
  activity('MEMORY AGENT — Restored a fact that had been retired after a correction.');
  return setStatus(row, 'restored');
}

/** Coordinator keeps the old fact alongside her correction (both stay in recall). */
function keep(correctionId) {
  const row = correctionRow(correctionId);
  if (row.status === 'retired') throw new ValidationError('Restore the fact first.');
  return setStatus(row, 'kept');
}

/** Her corrections as recall facts, newest first; recall puts them ahead of what they correct. */
function correctionFacts(helper, limit = 3) {
  return correctionsFor(helper.id, limit).map(r => ({
    text: `${helper.name} corrected the agency's record${r.fact ? ` about "${r.fact}"` : ''}: ${r.correction}`,
    mentionedAt: r.created_at,
    origin: 'correction',
    correction: true,
  }));
}

/* ------------------------------------------------------------------ forget */

async function listDocuments() {
  const all = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await fetch(`${hindsight.BASE_URL}/v1/default/banks/${encodeURIComponent(hindsight.BANK_ID)}/documents?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${process.env.HINDSIGHT_API_KEY || ''}` },
    });
    if (!res.ok) throw new Error(`Listing documents failed (${res.status}).`);
    const d = await res.json();
    all.push(...(d.items || []));
    if (!d.items || d.items.length < 100) break;
  }
  return all;
}

async function deleteDocument(id) {
  const res = await fetch(`${hindsight.BASE_URL}/v1/default/banks/${encodeURIComponent(hindsight.BANK_ID)}/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.HINDSIGHT_API_KEY || ''}` },
  });
  return res.ok;
}

function aboutHelper(doc, helperId) {
  const meta = Object.assign({}, doc.document_metadata || {}, (doc.retain_params || {}).metadata || {});
  return (doc.tags || []).includes('helper:' + helperId) || meta.helper_id === helperId;
}

/** Local personal data about the helper: table -> WHERE clause. Missing tables are skipped. */
const LOCAL_ROWS = [
  ['calls', 'helper_id = ?'],
  ['memories', 'helper_id = ?'],
  ['commitments', 'helper_id = ?'],
  ['safety_signals', 'helper_id = ?'],
  ['safety_flags', 'helper_id = ?'],
  ['requests', "role = 'helper' AND person_id = ?"],
  ['voice_sessions', 'helper_id = ?'],
  ['household_feedback', 'helper_id = ?'],
  ['outreach_signals', 'helper_id = ?'],
  ['record_corrections', 'helper_id = ?'],
  ['retain_jobs', 'helper_id = ?'],
];

async function forget(helperId, confirmName) {
  const helper = helperRow(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');
  const typed = String(confirmName == null ? '' : confirmName).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!typed || typed !== String(helper.name).trim().toLowerCase()) throw new ValidationError('Type her full name exactly to confirm.');

  const result = { documents: 0, standing_profile: false, local: {} };
  if (hindsight.isConfigured()) {
    // Memory first: if Hindsight cannot be reached, nothing is deleted, so a retry forgets everything.
    let docs;
    try { docs = (await listDocuments()).filter(d => aboutHelper(d, helper.id)); } catch (err) {
      throw new MemoryUnavailableError('Could not reach the memory bank, so nothing was deleted. Try again in a minute. (' + err.message + ')');
    }
    for (const d of docs) if (await deleteDocument(d.id)) result.documents += 1;
    if (result.documents < docs.length) {
      throw new MemoryUnavailableError(`Deleted ${result.documents} of ${docs.length} memory documents; nothing else was changed. Try again to delete the rest.`);
    }
    try { await hindsight.mentalModels.remove('coach-' + helper.id); result.standing_profile = true; } catch { /* no standing profile */ }
  }
  for (const [table, where] of LOCAL_ROWS) {
    try { result.local[table] = db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(helper.id).changes; } catch { /* table not created yet */ }
  }
  // Keep the roster row so placements and history stay consistent, but with nothing personal left in it.
  const cols = new Set(db.prepare('PRAGMA table_info(helpers)').all().map(c => c.name));
  const clear = ['location', 'background', 'pref_language', 'call_window', 'pref_notes', 'availability'].filter(c => cols.has(c));
  db.prepare(`UPDATE helpers SET name = 'Forgotten helper'${clear.map(c => `, ${c} = NULL`).join('')} WHERE id = ?`).run(helper.id);
  activity('MEMORY AGENT — Forgot all memory about a helper at the coordinator\'s request.');
  // Recalled text about her must not linger in feature caches under "Forgotten helper".
  for (const mod of ['./outreach', './friction', './sides', './care']) {
    try { const m = require(mod); if (m.clearMemoryCache) m.clearMemoryCache(); if (m.clearCache) m.clearCache(); } catch { /* optional */ }
  }
  return result;
}

module.exports = {
  EXPIRE_DAYS, ValidationError, NotFoundError, MemoryUnavailableError,
  isTemporary, markExpired, isHerWords, recordFor, correct, correctionsFor, correctionFacts, forget, aboutHelper,
  retire, restore, keep,
};
