/**
 * What changed since the last call with a helper: everything the agency learned about her after
 * that call, so the coordinator does not go over old ground. Read-only; nothing is retained.
 *
 * Local sources (SQLite): promises made or resolved, requests she sent, corrections she made,
 * household feedback about her, call preferences she set, and private safety notes (counted only,
 * never shown). Hindsight: memories tagged helper:<id> mentioned after the last call, excluding
 * safety notes and consolidated observations. De-duplicated, newest first, capped.
 */
const db = require('./db');
const hindsight = require('./hindsight');

const MAX_ITEMS = 8;
const NO_CALL_ITEMS = 5;
const SAME_CALL_MARGIN_MS = 5 * 60 * 1000;   // facts written while saving the last call are part of it
const RECALL_TIMEOUT_MS = 8000;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.status = 404; this.code = 'NOT_FOUND'; }
}

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO -> epoch ms; NaN when missing. */
function ms(v) {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
}
function iso(v) { const t = ms(v); return Number.isNaN(t) ? '' : new Date(t).toISOString(); }
function prettyDate(v) {
  const t = ms(v);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function clip(s, n = 160) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function norm(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim(); }

/** Run a query on a table another module creates; a missing table just means "nothing there". */
function rows(sql, ...args) {
  try { return db.prepare(sql).all(...args); } catch { return []; }
}

function lastCall(helperId) {
  try { return db.prepare('SELECT call_id, created_at FROM calls WHERE helper_id = ? ORDER BY created_at DESC LIMIT 1').get(helperId) || null; } catch { return null; }
}

/** Everything local about her, each {when, what, source, key}; lastCallId excludes what that call itself produced. */
function localItems(helper, lastCallId) {
  const out = [];
  for (const c of rows('SELECT text, status, made_at, made_call_id, resolved_at, resolved_call_id FROM commitments WHERE helper_id = ?', helper.id)) {
    if (!lastCallId || c.made_call_id !== lastCallId) out.push({ when: c.made_at, what: `Promise made: ${clip(c.text)}`, source: 'promise ledger' });
    if ((c.status === 'kept' || c.status === 'broken') && c.resolved_at && (!lastCallId || c.resolved_call_id !== lastCallId)) {
      out.push({ when: c.resolved_at, what: `Promise ${c.status}: ${clip(c.text)}`, source: 'promise ledger' });
    }
  }
  for (const r of rows("SELECT kind, text, date_from, date_to, created_at FROM requests WHERE role = 'helper' AND person_id = ?", helper.id)) {
    const dates = r.date_from ? ` (${r.date_from}${r.date_to && r.date_to !== r.date_from ? ' to ' + r.date_to : ''})` : '';
    out.push({ when: r.created_at, what: `She sent a ${String(r.kind).replace(/_/g, ' ')} request${dates}: "${clip(r.text, 120)}"`, source: 'her request' });
  }
  for (const c of rows('SELECT correction, created_at FROM record_corrections WHERE helper_id = ?', helper.id)) {
    out.push({ when: c.created_at, what: `She corrected her record: "${clip(c.correction, 120)}"`, source: 'her correction' });
  }
  for (const f of rows('SELECT f.rating, f.text, f.created_at, h.name AS household FROM household_feedback f LEFT JOIN households h ON h.id = f.household_id WHERE f.helper_id = ?', helper.id)) {
    out.push({ when: f.created_at, what: `${f.household || 'The household'} gave feedback (${f.rating}/5): "${clip(f.text, 120)}"`, source: 'household feedback' });
  }
  for (const a of rows("SELECT text, created_at FROM activity WHERE text LIKE ?", `%${helper.name} set her call preferences%`)) {
    const m = String(a.text).match(/set her call preferences:\s*(.+?)\.?$/);
    out.push({ when: a.created_at, what: `She set her call preferences: ${clip(m ? m[1] : a.text, 80)}`, source: 'her preferences' });
  }
  return out;
}

/** Private safety notes after a time: counted only, never their content. */
function safetyCount(helperId, sinceMs) {
  return rows("SELECT created_at FROM safety_signals WHERE helper_id = ? AND source != 'seed'", helperId)
    .filter(s => Number.isNaN(sinceMs) || ms(s.created_at) > sinceMs).length;
}

function isSafetyMemory(m) {
  const doc = String(m.documentId || '');
  return doc.startsWith('safety:') || (m.tags || []).includes('source:safety') || /safety check|safety note|safety flag/i.test(m.text || '');
}

/** Hindsight memories about her with a date; excludes observations, safety notes and the last call's own documents. */
async function memoryItems(helper, lastCallId) {
  if (!hindsight.isConfigured()) return { items: [], source: 'local' };
  try {
    // Never keep the coordinator waiting on memory: after the cap, show what SQLite knows.
    const hits = await Promise.race([
      hindsight.recall(
        `${helper.name}: what is new, recent changes, plans, promises, requests, corrections, household feedback`,
        { tags: ['helper:' + helper.id], budget: 'low', limit: 25 }
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hindsight took too long')), RECALL_TIMEOUT_MS).unref()),
    ]);
    const items = hits
      .filter(m => m.type !== 'observation' && !isSafetyMemory(m) && m.mentionedAt)
      .filter(m => !lastCallId || !String(m.documentId || '').startsWith('call:' + lastCallId))
      .map(m => ({ when: m.mentionedAt, what: clip(String(m.text).split(' | ')[0], 180), source: 'Hindsight memory' }));
    return { items, source: 'hindsight' };
  } catch (err) {
    return { items: [], source: 'local', error: String(err.message || err).slice(0, 120) };
  }
}

/** Newest first, one per meaning (same words, or the same local event restated in memory). */
function dedupe(items) {
  const seen = [];
  const out = [];
  for (const it of items.slice().sort((a, b) => ms(b.when) - ms(a.when))) {
    const k = norm(it.what.replace(/^(promise (made|kept|broken)|she sent a [a-z ]+ request[^:]*|she corrected her record|she set her call preferences):\s*/i, ''));
    if (!k || seen.some(s => s === k || (s.length > 24 && k.length > 24 && (s.includes(k) || k.includes(s))))) continue;
    seen.push(k);
    out.push(it);
  }
  return out;
}

async function since(helperId) {
  if (!helperId || typeof helperId !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(helperId)) throw new ValidationError('Pick a helper (helper=<id>).');
  const helper = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');

  const last = lastCall(helper.id);
  const lastMs = last ? ms(last.created_at) : NaN;
  const local = localItems(helper, last && last.call_id);
  const mem = await memoryItems(helper, last && last.call_id);
  const after = it => Number.isNaN(lastMs) || ms(it.when) > lastMs + (it.source === 'Hindsight memory' ? SAME_CALL_MARGIN_MS : 0);

  let items = dedupe(local.concat(mem.items).filter(it => !Number.isNaN(ms(it.when))).filter(last ? after : () => true));
  items = items.slice(0, last ? MAX_ITEMS : NO_CALL_ITEMS);
  const notes = safetyCount(helper.id, last ? lastMs : NaN);
  if (notes && last) items.unshift({ when: new Date().toISOString(), what: `${notes} private safety note${notes === 1 ? '' : 's'} (see Safety across calls)`, source: 'safety check', private: true });
  items = items.slice(0, last ? MAX_ITEMS : NO_CALL_ITEMS).map(it => ({ when: iso(it.when), what: it.what, source: it.source, ...(it.private ? { private: true } : {}) }));

  const count = items.length;
  const summary = last
    ? (count ? `Since the last call on ${prettyDate(last.created_at)}: ${count} new thing${count === 1 ? '' : 's'}` : `Since the last call on ${prettyDate(last.created_at)}: nothing new`)
    : `No call with ${helper.name.split(' ')[0]} on record yet.` + (count ? ` The latest ${count} thing${count === 1 ? '' : 's'} on record:` : ' Nothing else on record either.');

  return {
    helper_id: helper.id,
    helper_name: helper.name,
    last_call: last ? { at: iso(last.created_at), date: prettyDate(last.created_at) } : null,
    summary,
    items,
    memory_source: mem.source,
  };
}

module.exports = { since, ValidationError, NotFoundError, MAX_ITEMS, _test: { dedupe, isSafetyMemory, ms } };
