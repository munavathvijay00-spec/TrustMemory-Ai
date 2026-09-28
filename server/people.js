/**
 * Helpers and households: validated creation, stored in SQLite and retained to Hindsight.
 *
 * The original tables only held name/role/scores. This module adds the profile columns the
 * console shows (location, skills, availability, schedule, notes), backfills them for the
 * seeded roster, and creates new people so they survive a refresh and are known to the voice
 * agent on the first call (profile retained with the right tags, standing profile created).
 */
const db = require('./db');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');

const ROLES = ['elder_care', 'child_care', 'cleaning', 'cooking'];
const AVAILABILITY = ['Full-time', 'Part-time', 'Live-in', 'Weekends'];
const COLORS = ['#8F6A2E', '#3F6659', '#5B4A8F', '#A6453A', '#31507A'];

function addColumn(table, column, type) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
addColumn('helpers', 'location', 'TEXT');
addColumn('helpers', 'skills', 'TEXT');          // JSON array of roles
addColumn('helpers', 'availability', 'TEXT');
addColumn('helpers', 'color', 'TEXT');
addColumn('helpers', 'background', 'TEXT');
addColumn('helpers', 'created_at', 'TEXT');
addColumn('households', 'location', 'TEXT');
addColumn('households', 'schedule', 'TEXT');
addColumn('households', 'notes', 'TEXT');
addColumn('households', 'created_at', 'TEXT');

// Profile details for the seeded roster (the same values the console has always shown).
const SEED_HELPERS = {
  anita: ['Hyderabad', ['elder_care', 'cleaning'], 'Full-time', '#8F6A2E'],
  priya: ['Hyderabad', ['elder_care', 'child_care', 'cleaning'], 'Full-time', '#3F6659'],
  radha: ['Secunderabad', ['child_care', 'cooking'], 'Full-time', '#5B4A8F'],
  sunita: ['Hyderabad', ['cleaning', 'cooking'], 'Part-time', '#A6453A'],
  meena: ['Gachibowli', ['elder_care', 'cooking'], 'Full-time', '#31507A'],
  kavita: ['Kukatpally', ['child_care'], 'Full-time', '#8F6A2E'],
  lakshmi: ['Hyderabad', ['cleaning'], 'Full-time', '#3F6659'],
  fatima: ['Begumpet', ['elder_care', 'child_care'], 'Full-time', '#5B4A8F'],
};
const SEED_HOUSEHOLDS = {
  h101: ['Jubilee Hills', 'Weekday mornings'],
  h102: ['Banjara Hills', 'Live-in'],
  h104: ['Madhapur', 'Weekday, 9am–6pm'],
  h105: ['Kondapur', 'Weekday, 8am–5pm'],
  h106: ['Gachibowli', 'Live-in, new requirement'],
  h107: ['Himayatnagar', 'Full-time'],
};
for (const [id, [location, skills, availability, color]] of Object.entries(SEED_HELPERS)) {
  db.prepare('UPDATE helpers SET location = COALESCE(location, ?), skills = COALESCE(skills, ?), availability = COALESCE(availability, ?), color = COALESCE(color, ?) WHERE id = ?')
    .run(location, JSON.stringify(skills), availability, color, id);
}
for (const [id, [location, schedule]] of Object.entries(SEED_HOUSEHOLDS)) {
  db.prepare('UPDATE households SET location = COALESCE(location, ?), schedule = COALESCE(schedule, ?) WHERE id = ?').run(location, schedule, id);
}

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}

function text(value, field, { min = 2, max = 60, required = true } = {}) {
  const v = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!v && !required) return '';
  if (v.length < min || v.length > max) throw new ValidationError(`${field} must be ${min} to ${max} characters.`);
  return v;
}

function uniqueId(prefix, name, table) {
  const base = prefix + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || prefix + 'person';
  let id = base;
  for (let i = 2; db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id); i += 1) id = base + i;
  return id;
}

/** Retain a profile and create the standing profile in the background; never blocks creation. */
function rememberProfile({ kind, id, name, content, context }) {
  if (!hindsight.isConfigured()) return;
  const item = {
    content,
    context,
    documentId: 'profile:' + kind + ':' + id,
    timestamp: new Date().toISOString(),
    metadata: { [kind + '_id']: id, kind: 'profile' },
    tags: [kind + ':' + id, 'source:profile'],
  };
  hindsight.retain([item]).catch(err => retainQueue.enqueue([item], { helperId: kind === 'helper' ? id : null, callId: 'profile', error: err.message }));
  const model = kind === 'helper'
    ? { id: 'coach-' + id, name: 'How to coach ' + name, sourceQuery: `How should the agency coordinator approach a coaching or check-in call with ${name}? Cover: what she has committed to and whether it held, what is going on in her life that affects work, what tone and approach has worked with her before, any times she must not be called, and what to avoid saying.`, tags: ['helper:' + id] }
    : { id: 'household-' + id, name: 'What ' + name + ' expects', sourceQuery: `What does the ${name} expect from a helper, what has gone wrong with past placements there and why, and what kind of helper is most likely to succeed with them?`, tags: ['household:' + id] };
  hindsight.mentalModels.create(model).catch(() => { /* created later by seed-memory if needed */ });
}

function activity(text) {
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)")
    .run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), text, nowSql());
}

function createHelper(input = {}) {
  const name = text(input.name, 'Name', { max: 60 });
  if (!/^[\p{L} .'-]+$/u.test(name)) throw new ValidationError('Name can only contain letters, spaces, dots, apostrophes and hyphens.');
  const location = text(input.location, 'Location', { max: 60 });
  const exp = Number(input.experience_years);
  if (!Number.isInteger(exp) || exp < 0 || exp > 50) throw new ValidationError('Experience must be a whole number of years from 0 to 50.');
  const skills = Array.isArray(input.skills) ? [...new Set(input.skills)] : [];
  if (!skills.length || skills.some(s => !ROLES.includes(s))) throw new ValidationError('Pick at least one skill: ' + ROLES.join(', ') + '.');
  const availability = AVAILABILITY.includes(input.availability) ? input.availability : 'Full-time';
  const background = text(input.background, 'Background', { min: 0, max: 500, required: false });
  if (db.prepare('SELECT 1 FROM helpers WHERE lower(name) = lower(?)').get(name)) throw new ValidationError(`A helper called ${name} already exists.`);

  const id = uniqueId('', name, 'helpers');
  const color = COLORS[db.prepare('SELECT COUNT(*) AS n FROM helpers').get().n % COLORS.length];
  db.prepare(`INSERT INTO helpers (id, name, role, trust, churn, experience_years, location, skills, availability, color, background, created_at)
              VALUES (?, ?, ?, 68, 18, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, skills[0], exp, location, JSON.stringify(skills), availability, color, background || null, nowSql());

  const roleText = skills.map(s => s.replace('_', ' ')).join(', ');
  rememberProfile({
    kind: 'helper', id, name,
    content: `${name} joined the agency. She has ${exp} year${exp === 1 ? '' : 's'} of experience in ${roleText}, lives in ${location}, and is available ${availability.toLowerCase()}.${background ? ' ' + background : ''}`,
    context: 'Agency onboarding record for a helper, entered by the coordinator.',
  });
  activity(`MEMORY AGENT — Registered helper ${name} and retained her profile to Hindsight.`);
  return getHelper(id);
}

function createHousehold(input = {}) {
  const name = text(input.name, 'Name', { max: 60 });
  const location = text(input.location, 'Location', { max: 60 });
  const need = ROLES.includes(input.requirement) ? input.requirement : null;
  if (!need) throw new ValidationError('Pick what the household needs: ' + ROLES.join(', ') + '.');
  const schedule = text(input.schedule, 'Schedule', { max: 100 });
  const notes = text(input.notes, 'Notes', { min: 0, max: 500, required: false });
  if (db.prepare('SELECT 1 FROM households WHERE lower(name) = lower(?)').get(name)) throw new ValidationError(`A household called ${name} already exists.`);

  const id = uniqueId('h_', name, 'households');
  db.prepare('INSERT INTO households (id, name, need, difficulty, location, schedule, notes, created_at) VALUES (?, ?, ?, 20, ?, ?, ?, ?)')
    .run(id, name, need, location, schedule, notes || null, nowSql());
  rememberProfile({
    kind: 'household', id, name,
    content: `The ${name} in ${location} needs ${need.replace('_', ' ')}. Schedule: ${schedule}.${notes ? ' ' + notes : ''}`,
    context: 'Agency onboarding record for a client household, entered by the coordinator.',
  });
  activity(`MEMORY AGENT — Registered household ${name} and retained its profile to Hindsight.`);
  return getHousehold(id);
}

function parseHelper(row) {
  if (!row) return null;
  let skills = [];
  try { skills = JSON.parse(row.skills || '[]'); } catch { skills = []; }
  return Object.assign({}, row, { skills });
}

function getHelper(id) { return parseHelper(db.prepare('SELECT * FROM helpers WHERE id = ?').get(id)); }
function getHousehold(id) { return db.prepare('SELECT * FROM households WHERE id = ?').get(id) || null; }
function listHelpers() { return db.prepare('SELECT * FROM helpers ORDER BY created_at IS NULL, created_at DESC, name').all().map(parseHelper); }
function listHouseholds() { return db.prepare('SELECT * FROM households ORDER BY created_at IS NULL, created_at DESC, name').all(); }

module.exports = { ROLES, AVAILABILITY, ValidationError, createHelper, createHousehold, getHelper, getHousehold, listHelpers, listHouseholds };
