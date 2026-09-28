/**
 * Accounts and sessions for the three roles: coordinator, helper, household.
 *
 * Passwords are hashed with scrypt and a per-account salt; sessions are random tokens in an
 * HttpOnly cookie. Helpers and households sign themselves up (their profile is created through
 * people.js, so it is retained to Hindsight) and wait for a coordinator to approve them.
 * Coordinators cannot sign up; they are seeded or created by another coordinator.
 */
const crypto = require('crypto');
const db = require('./db');
const people = require('./people');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('coordinator', 'helper', 'household')),
    person_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'active')),
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

// A sign-up's profile waits on the account until a coordinator approves it; only then does the
// person join the roster and Hindsight, so strangers cannot write into the agency's memory.
if (!db.prepare('PRAGMA table_info(accounts)').all().some(c => c.name === 'profile_json')) db.exec('ALTER TABLE accounts ADD COLUMN profile_json TEXT');

const ROLES = ['coordinator', 'helper', 'household'];
const SESSION_DAYS = 7;
const COOKIE = 'tm_session';
const MAX_FAILURES = { emailip: 5, ip: 20 }; // per 15 minutes; the IP limit is looser so one typo-prone user cannot lock out a shared office
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class AuthError extends Error {
  constructor(message, status = 400, code = 'VALIDATION') { super(message); this.status = status; this.code = code; }
}

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function passwordMatches(password, account) {
  const a = Buffer.from(hashPassword(password, account.salt), 'hex');
  const b = Buffer.from(account.password_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normEmail(email) { return String(email == null ? '' : email).trim().toLowerCase(); }

function checkEmail(email) {
  const e = normEmail(email);
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) throw new AuthError('Enter a valid email address.');
  return e;
}

function checkPassword(password, confirm) {
  const p = String(password == null ? '' : password);
  if (p.length < 8 || p.length > 72) throw new AuthError('Password must be 8 to 72 characters.');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new AuthError('Password must contain at least one letter and one number.');
  if (confirm !== undefined && String(confirm) !== p) throw new AuthError('The two passwords do not match.');
  return p;
}

function insertAccount({ email, name, password, role, personId = null, status }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const id = 'acc_' + crypto.randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO accounts (id, email, name, password_hash, salt, role, person_id, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, email, name, hashPassword(password, salt), salt, role, personId, status, nowSql());
  return getAccount(id);
}

function getAccount(id) { return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null; }

/** What the browser may see about an account: never the hash or salt. */
function publicAccount(a) {
  if (!a) return null;
  return { id: a.id, email: a.email, name: a.name, role: a.role, person_id: a.person_id, status: a.status, created_at: a.created_at };
}

/**
 * Helper or household self sign-up. Account fields are checked before the profile is created,
 * so a bad password never leaves an orphaned helper or household behind.
 */
function signup(input = {}) {
  const role = input.role;
  if (role === 'coordinator') throw new AuthError('Coordinator accounts are created by the agency, not by sign-up.', 403, 'FORBIDDEN');
  if (role !== 'helper' && role !== 'household') throw new AuthError('Choose whether you are signing up as a helper or a household.');
  const email = checkEmail(input.email);
  const password = checkPassword(input.password, input.confirm);
  if (db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(email)) throw new AuthError('An account with this email already exists.', 409, 'EXISTS');

  let profile;
  try {
    profile = role === 'helper' ? people.checkHelper(input) : people.checkHousehold(input);
  } catch (err) {
    if (err instanceof people.ValidationError) throw new AuthError(err.message);
    throw err;
  }
  const account = insertAccount({ email, name: profile.name, password, role, status: 'pending' });
  db.prepare('UPDATE accounts SET profile_json = ? WHERE id = ?').run(JSON.stringify(profile), account.id);
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)")
    .run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), `MEMORY AGENT — ${profile.name} signed up as a ${role}; waiting for coordinator approval.`, nowSql());
  return { account: publicAccount(getAccount(account.id)), person: null };
}

/** A coordinator adds another coordinator (the only way to get one besides the seed). */
function createCoordinator(input = {}) {
  const email = checkEmail(input.email);
  const password = checkPassword(input.password, input.confirm);
  const name = String(input.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) throw new AuthError('Name must be 2 to 60 characters.');
  if (db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(email)) throw new AuthError('An account with this email already exists.', 409, 'EXISTS');
  return publicAccount(insertAccount({ email, name, password, role: 'coordinator', status: 'active' }));
}

/* ------------------------------------------------------------------ login attempts */

const failures = new Map(); // key -> [timestamps]

function recentFailures(key) {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  const list = (failures.get(key) || []).filter(t => t > cutoff);
  if (list.length) failures.set(key, list); else failures.delete(key);
  return list;
}

function login(email, password, ip = '') {
  const e = normEmail(email);
  // Email+IP, so a stranger's wrong guesses cannot lock the real user out from their own machine.
  const keys = ['emailip:' + e + '|' + ip, 'ip:' + ip];
  if (keys.some(k => recentFailures(k).length >= MAX_FAILURES[k.split(':')[0]])) {
    throw new AuthError('Too many failed sign-in attempts. Try again in 15 minutes.', 429, 'RATE_LIMITED');
  }
  const account = e ? db.prepare('SELECT * FROM accounts WHERE email = ?').get(e) : null;
  if (!account) hashPassword(password, DUMMY_SALT);   // same cost as a real check, so timing does not reveal which emails exist
  if (!account || !passwordMatches(password, account)) {
    for (const k of keys) failures.set(k, recentFailures(k).concat(Date.now()));
    throw new AuthError('Email or password is incorrect.', 401, 'BAD_LOGIN');
  }
  for (const k of keys) failures.delete(k);
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)').run(token, account.id, expires);
  db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(nowSql(), account.id);
  return { token, expires, account: publicAccount(getAccount(account.id)) };
}

function accountForToken(token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getAccount(row.account_id);
}

function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function pending() {
  return db.prepare("SELECT * FROM accounts WHERE status = 'pending' ORDER BY created_at").all().map(publicAccount);
}

function approve(accountId) {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ? AND status = 'pending'").get(accountId);
  if (!row) return null;
  // Create the helper or household now: roster, Hindsight profile and standing profile.
  if (!row.person_id && row.role !== 'coordinator') {
    let person;
    try {
      const profile = JSON.parse(row.profile_json || '{}');
      person = row.role === 'helper' ? people.createHelper(profile) : people.createHousehold(profile);
    } catch (err) {
      if (err instanceof people.ValidationError) throw new AuthError('Cannot approve: ' + err.message, 409, 'CONFLICT');
      throw err;
    }
    db.prepare('UPDATE accounts SET person_id = ?, profile_json = NULL WHERE id = ?').run(person.id, accountId);
  }
  db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(accountId);
  const a = getAccount(accountId);
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)")
    .run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), `MEMORY AGENT — Coordinator approved ${a.name}'s ${a.role} account.`, nowSql());
  return publicAccount(a);
}

/* ------------------------------------------------------------------ demo accounts */

const DEMO_ACCOUNTS = [
  { env: 'DEMO_COORDINATOR_PASSWORD', email: 'coordinator@trustmemory.demo', name: 'Agency Coordinator', role: 'coordinator', personId: null },
  { env: 'DEMO_HELPER_PASSWORD', email: 'radha@trustmemory.demo', role: 'helper', personId: 'radha' },
  { env: 'DEMO_HOUSEHOLD_PASSWORD', email: 'gupta@trustmemory.demo', role: 'household', personId: 'h105' },
];

function randomPassword() {
  // Letters and digits only, always containing both, so it passes the password rules.
  return 'Tm' + crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) + String(crypto.randomInt(10, 99));
}

/**
 * Idempotent. Creates the three demo accounts if missing. A password set in the environment
 * always wins (so .env can reset a lost one); otherwise a random one is generated once and
 * returned so the caller can print it. Returns [{email, role, password}] for newly generated ones.
 */
function seedDemoAccounts(env = process.env) {
  const generated = [];
  for (const d of DEMO_ACCOUNTS) {
    if (d.personId) {
      const table = d.role === 'helper' ? 'helpers' : 'households';
      if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(d.personId)) continue;
    }
    const name = d.name || (d.role === 'helper' ? people.getHelper(d.personId) : people.getHousehold(d.personId)).name;
    const fromEnv = env[d.env];
    const existing = db.prepare('SELECT * FROM accounts WHERE email = ?').get(d.email);
    if (existing) {
      if (fromEnv && !passwordMatches(fromEnv, existing)) {
        const salt = crypto.randomBytes(16).toString('hex');
        db.prepare('UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?').run(hashPassword(fromEnv, salt), salt, existing.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(existing.id);
      }
      continue;
    }
    const password = fromEnv || randomPassword();
    insertAccount({ email: d.email, name, password, role: d.role, personId: d.personId, status: 'active' });
    if (!fromEnv) generated.push({ email: d.email, role: d.role, password, env: d.env });
  }
  return generated;
}

/* ------------------------------------------------------------------ cookies */

function readCookie(req, name = COOKIE) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function sessionCookie(req, token, expires) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [COOKIE + '=' + (token || ''), 'HttpOnly', 'SameSite=Lax', 'Path=/'];
  parts.push(token ? 'Expires=' + new Date(expires).toUTCString() : 'Max-Age=0');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  ROLES, COOKIE, AuthError, DEMO_ACCOUNTS,
  checkEmail, checkPassword, signup, createCoordinator, login, logout, accountForToken, publicAccount,
  pending, approve, seedDemoAccounts, readCookie, sessionCookie, hashPassword,
};
