/**
 * Requests and preferences from helpers and households, in their own words.
 *
 * A helper can ask for leave, say she is running late, raise a problem at work or a pay issue;
 * a household can raise a concern, ask for a check-in or cover, or report a schedule change.
 * Every request is stored for the coordinator, and retained to Hindsight as a dated fact in the
 * person's own words, so the next call and the handover brief know about it. A helper's pay
 * issue also counts as a safety signal, so repeated ones raise the private safety check.
 *
 * Helpers also set how the agency should call them (language, best time); households describe
 * what the next helper should know about their home.
 */
const db = require('./db');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');
const care = require('./care');
const outreach = require('./outreach');

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('helper', 'household')),
    person_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    date_from TEXT,
    date_to TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'acknowledged')),
    coordinator_note TEXT,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT
  );
`);

function addColumn(table, column, type) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
addColumn('helpers', 'pref_language', 'TEXT');
addColumn('helpers', 'call_window', 'TEXT');
addColumn('helpers', 'pref_notes', 'TEXT');
addColumn('households', 'home_routine', 'TEXT');
addColumn('households', 'home_health', 'TEXT');
addColumn('households', 'home_preferences', 'TEXT');

const KINDS = {
  helper: { leave: 'Leave', running_late: 'Running late', problem_at_work: 'Problem at work', pay_issue: 'Pay issue', other: 'Other' },
  household: { concern: 'Concern', checkin_request: 'Check-in request', cover_needed: 'Cover needed', schedule_change: 'Schedule change', praise: 'Praise' },
};
const NEEDS_DATES = ['leave', 'cover_needed'];
const LANGS = { en: 'English', hi: 'Hindi', te: 'Telugu' };
const MAX_DAYS_AHEAD = 120;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
function today() { return new Date().toISOString().slice(0, 10); }
function newId(prefix) { return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

function clean(value, field, { min = 0, max = 500 } = {}) {
  const v = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (v.length < min || v.length > max) throw new ValidationError(min ? `${field} must be ${min} to ${max} characters.` : `${field} can be at most ${max} characters.`);
  return v;
}

function checkDate(value, field) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00Z'))) throw new ValidationError(`${field} must be a date (YYYY-MM-DD).`);
  const days = Math.round((new Date(v + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000);
  if (days < -7) throw new ValidationError(`${field} is too far in the past.`);
  if (days > MAX_DAYS_AHEAD) throw new ValidationError(`${field} can be at most ${MAX_DAYS_AHEAD} days ahead.`);
  return v;
}

function personOf(role, id) {
  return role === 'helper'
    ? db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(id)
    : db.prepare('SELECT id, name FROM households WHERE id = ?').get(id);
}

/** The other side of an active placement: the helper's household, or the household's helper. */
function counterpart(role, id) {
  const row = role === 'helper'
    ? db.prepare("SELECT household_id AS other FROM placements WHERE helper_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").get(id)
    : db.prepare("SELECT helper_id AS other FROM placements WHERE household_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").get(id);
  return row ? row.other : null;
}

/** One dated fact in the person's own words; queued for retry if Hindsight is down, never blocks. */
function remember({ content, context, documentId, tags, metadata, helperId }) {
  if (!hindsight.isConfigured()) return 'local_only';
  const item = { content, context, documentId, timestamp: new Date().toISOString(), metadata, tags };
  hindsight.retain([item]).catch(err => retainQueue.enqueue([item], { helperId: helperId || null, callId: 'self_report', error: err.message }));
  return 'sent';
}

function activity(text) {
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run(newId('act_'), text, nowSql());
}

/* ------------------------------------------------------------------ requests */

function createRequest(role, personId, input = {}) {
  if (!KINDS[role]) throw new ValidationError('Only helpers and households can send requests.');
  const person = personOf(role, personId);
  if (!person) throw new ValidationError('Your profile was not found.');
  const kind = String(input.kind || '');
  if (!KINDS[role][kind]) throw new ValidationError('Choose what this is about: ' + Object.values(KINDS[role]).join(', ') + '.');
  const text = clean(input.text, 'Message', { min: 3, max: 500 });
  let from = null;
  let to = null;
  if (NEEDS_DATES.includes(kind) || input.date_from || input.date_to) {
    from = checkDate(input.date_from, 'Start date');
    to = input.date_to ? checkDate(input.date_to, 'End date') : from;
    if (to < from) throw new ValidationError('The end date must be on or after the start date.');
  }

  const id = newId('req_');
  db.prepare(`INSERT INTO requests (id, role, person_id, kind, text, date_from, date_to, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`).run(id, role, personId, kind, text, from, to, nowSql());

  const label = KINDS[role][kind].toLowerCase();
  const dates = from ? (to && to !== from ? ` for ${from} to ${to}` : ` for ${from}`) : '';
  activity(`MEMORY AGENT — ${person.name} sent a ${label} request${dates}: "${text.slice(0, 120)}"`);

  const other = counterpart(role, personId);
  const helperId = role === 'helper' ? personId : other;
  const householdId = role === 'household' ? personId : other;
  const tags = [(role === 'helper' ? 'helper:' : 'household:') + personId, 'source:self_report'];
  if (other) tags.push((role === 'helper' ? 'household:' : 'helper:') + other);
  const retained = remember({
    content: `On ${today()}, ${person.name} told the agency (${label}${dates}): "${text}"`,
    context: `Written by the ${role} in their own view of the agency app. First-person statements are facts about them, true as of this date.`,
    documentId: 'request:' + id,
    tags,
    metadata: { [role + '_id']: personId, kind: 'self_report', request_kind: kind },
    helperId,
  });

  // A pay issue in her own words is a safety signal; repeated ones raise the private check.
  let safetyFlag = null;
  if (role === 'helper' && kind === 'pay_issue') {
    const callId = 'request_' + id;
    care.recordSignals({ helperId: personId, householdId, callId, concerns: [{ kind: 'unpaid_pay', evidence: text }] });
    safetyFlag = care.evaluate(personId, { latestCallId: callId, householdId });
  }
  return { request: getRequest(id), retained, safety_flag: safetyFlag ? { id: safetyFlag.id || null } : null };
}

function withNames(r) {
  if (!r) return null;
  const p = personOf(r.role, r.person_id);
  return Object.assign({}, r, { person_name: p ? p.name : r.person_id, kind_label: (KINDS[r.role] || {})[r.kind] || r.kind });
}

function getRequest(id) { return withNames(db.prepare('SELECT * FROM requests WHERE id = ?').get(id)); }

function listFor(role, personId, limit = 10) {
  return db.prepare('SELECT * FROM requests WHERE role = ? AND person_id = ? ORDER BY created_at DESC LIMIT ?').all(role, personId, limit).map(withNames);
}

function listAll({ status } = {}) {
  const rows = status === 'open' || status === 'acknowledged'
    ? db.prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC LIMIT 50').all(status)
    : db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 50').all();
  return rows.map(withNames);
}

function acknowledge(id, note) {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  if (!r) return null;
  const n = clean(note, 'Note', { max: 300 });
  db.prepare("UPDATE requests SET status = 'acknowledged', coordinator_note = ?, acknowledged_at = ? WHERE id = ?").run(n || null, nowSql(), id);
  const p = personOf(r.role, r.person_id);
  activity(`MEMORY AGENT — Coordinator acknowledged ${p ? p.name : r.person_id}'s ${((KINDS[r.role] || {})[r.kind] || r.kind).toLowerCase()} request${n ? ': ' + n.slice(0, 120) : '.'}`);
  return getRequest(id);
}

/* ------------------------------------------------------------------ helper preferences */

function getPreferences(helperId) {
  const h = db.prepare('SELECT id, name, pref_language, call_window, pref_notes FROM helpers WHERE id = ?').get(helperId);
  if (!h) return null;
  return { helper_id: h.id, language: h.pref_language || null, call_window: h.call_window || null, notes: h.pref_notes || null };
}

function savePreferences(helperId, input = {}) {
  const h = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(helperId);
  if (!h) throw new ValidationError('Your profile was not found.');
  const language = String(input.language || '').trim().toLowerCase();
  if (!LANGS[language]) throw new ValidationError('Choose English, Hindi or Telugu.');
  const window = clean(input.call_window, 'Best time to call', { min: 3, max: 60 });
  const notes = clean(input.notes, 'Notes', { max: 200 });
  db.prepare('UPDATE helpers SET pref_language = ?, call_window = ?, pref_notes = ? WHERE id = ?').run(language, window, notes || null, helperId);
  activity(`MEMORY AGENT — ${h.name} set her call preferences: ${LANGS[language]}, ${window}.`);
  remember({
    content: `On ${today()}, ${h.name} told the agency she prefers calls ${window}, in ${LANGS[language]}.${notes ? ' ' + notes : ''}`,
    context: 'Call preferences set by the helper herself in her view of the agency app.',
    documentId: 'prefs:helper:' + helperId,
    tags: ['helper:' + helperId, 'source:self_report'],
    metadata: { helper_id: helperId, kind: 'call_preferences' },
    helperId,
  });
  return getPreferences(helperId);
}

/** The helper's saved call language, used when a call is started without one. */
function preferredLanguage(helperId) {
  const row = db.prepare('SELECT pref_language FROM helpers WHERE id = ?').get(helperId);
  return row && LANGS[row.pref_language] ? row.pref_language : null;
}

function allPreferences() {
  const out = {};
  for (const h of db.prepare('SELECT id, pref_language, call_window FROM helpers WHERE pref_language IS NOT NULL OR call_window IS NOT NULL').all()) {
    out[h.id] = { language: h.pref_language || null, call_window: h.call_window || null };
  }
  return out;
}

/* ------------------------------------------------------------------ household notes */

function getHouseholdNotes(householdId) {
  const hh = db.prepare('SELECT id, home_routine, home_health, home_preferences FROM households WHERE id = ?').get(householdId);
  if (!hh) return null;
  return { household_id: hh.id, routine: hh.home_routine || '', health: hh.home_health || '', preferences: hh.home_preferences || '' };
}

function saveHouseholdNotes(householdId, input = {}) {
  const hh = db.prepare('SELECT id, name FROM households WHERE id = ?').get(householdId);
  if (!hh) throw new ValidationError('Your household profile was not found.');
  const routine = clean(input.routine, 'Daily routine', { max: 400 });
  const health = clean(input.health, 'Health and care', { max: 400 });
  const preferences = clean(input.preferences, 'Preferences', { max: 400 });
  if (!routine && !health && !preferences) throw new ValidationError('Write something in at least one of the three boxes.');
  const summary = [routine && 'Routine: ' + routine, health && 'Health and care: ' + health, preferences && 'Preferences: ' + preferences].filter(Boolean).join(' ');
  db.prepare('UPDATE households SET home_routine = ?, home_health = ?, home_preferences = ?, notes = ? WHERE id = ?')
    .run(routine || null, health || null, preferences || null, summary.slice(0, 500), householdId);
  activity(`MEMORY AGENT — ${hh.name} updated what the next helper should know about their home; retained to Hindsight.`);
  const parts = [['routine', 'daily routine', routine], ['health', 'health and care needs', health], ['preferences', 'preferences', preferences]];
  for (const [key, label, value] of parts) {
    if (!value) continue;
    remember({
      content: `On ${today()}, the ${hh.name} described their ${label} for any helper working there: ${value}`,
      context: 'Written by the household itself for the agency, to brief the next helper.',
      documentId: `household-notes:${householdId}:${key}`,
      tags: ['household:' + householdId, 'source:household_notes'],
      metadata: { household_id: householdId, kind: 'household_notes', part: key },
    });
  }
  return getHouseholdNotes(householdId);
}

/* ------------------------------------------------------------------ festivals, for leave planning */

function festivalsAhead(days = 60) {
  const t = today();
  return outreach.FESTIVALS
    .map(f => Object.assign({}, f, { days_away: Math.round((new Date(f.date + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 86400000) }))
    .filter(f => f.days_away >= 0 && f.days_away <= days)
    .map(f => ({ key: f.key, name: f.name, date: f.date, days_away: f.days_away }));
}

module.exports = {
  KINDS, LANGS, ValidationError,
  createRequest, getRequest, listFor, listAll, acknowledge,
  getPreferences, savePreferences, preferredLanguage, allPreferences,
  getHouseholdNotes, saveHouseholdNotes, festivalsAhead,
};
