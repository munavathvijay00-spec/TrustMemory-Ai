/**
 * Sign-up, sign-in and role-based access for the API, plus the helper's and household's own
 * views (/api/me/*).
 *
 *   public       /api/health*, /api/auth/login|signup|me|logout, and every non-API file
 *   coordinator  everything
 *   helper       /api/me/*, her own name from /api/helpers, and the voice relay endpoints the
 *                phone screen uses, only for calls to her
 *   household    /api/me/*, including POST /api/me/feedback
 *   pending      nothing but /api/auth/me (the console shows "waiting for approval")
 *
 * TRUSTMEMORY_AUTH=off (the tests) skips the checks and treats every request as the coordinator.
 */
const { istDate } = require('./dates');
const express = require('express');
const auth = require('./auth');
const db = require('./db');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');
const agent = require('./voice-agent');

const router = express.Router();

const PUBLIC = [/^\/api\/health(\/|$)/, /^\/api\/auth\/(login|signup|me|logout|demo)$/];
const RELAY_POSTS = ['/api/voice/answer', '/api/voice/turn', '/api/voice/hangup'];

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

function sessionHelperId(sessionId) {
  const s = sessionId ? agent.getSession(String(sessionId)) : null;
  return s && s.helper ? s.helper.id : null;
}

/** The phone screen's calls, allowed only when the call is to this helper. */
function helperRelayAllowed(req, account) {
  if (req.method === 'GET' && req.path === '/api/voice/incoming') return req.query.helper === account.person_id;
  const m = req.path.match(/^\/api\/voice\/session\/([^/]+)$/);
  if (req.method === 'GET' && m) return sessionHelperId(decodeURIComponent(m[1])) === account.person_id;
  if (req.method === 'POST' && RELAY_POSTS.includes(req.path)) return sessionHelperId((req.body || {}).session_id) === account.person_id;
  // Neural voice for her own call's lines (text is capped at 600 characters by the route).
  if (req.method === 'GET' && req.path === '/api/voice/tts/status') return true;
  if (req.method === 'POST' && req.path === '/api/voice/tts') return sessionHelperId((req.body || {}).session_id) === account.person_id;
  return false;
}

function accessControl({ enabled }) {
  return (req, res, next) => {
    if (!enabled) { req.account = null; req.authOff = true; return next(); }
    req.account = auth.accountForToken(auth.readCookie(req));
    if (!req.path.startsWith('/api/') || PUBLIC.some(re => re.test(req.path))) return next();

    const a = req.account;
    if (!a) return res.status(401).json({ error: 'Sign in to continue.', code: 'AUTH_REQUIRED' });
    if (a.status !== 'active') return res.status(403).json({ error: 'Your account is waiting for approval by the agency.', code: 'PENDING' });
    if (a.role === 'coordinator') return next();
    if (req.path === '/api/me' || req.path.startsWith('/api/me/')) return next();
    if (a.role === 'helper') {
      // The phone screen reads /api/helpers for her name; she gets only her own entry, no scores.
      if (req.method === 'GET' && req.path === '/api/helpers') {
        const h = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(a.person_id);
        return res.json(h ? [h] : []);
      }
      if (helperRelayAllowed(req, a)) return next();
    }
    return res.status(403).json({ error: 'Only the agency coordinator can do this.', code: 'FORBIDDEN' });
  };
}

function coordinatorOnly(req, res, next) {
  if (req.authOff || (req.account && req.account.role === 'coordinator' && req.account.status === 'active')) return next();
  return res.status(403).json({ error: 'Only the agency coordinator can do this.', code: 'FORBIDDEN' });
}

function fail(res, err) {
  if (err instanceof auth.AuthError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('[TrustMemory AI] auth route failed:', err && err.message);
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
}

/* ------------------------------------------------------------------ sign-up / sign-in */

router.post('/api/auth/signup', (req, res) => {
  if (req.authOff) return res.status(400).json({ error: 'Sign-up is disabled while authentication is off.', code: 'AUTH_OFF' });
  try {
    const { account, person } = auth.signup(req.body || {});
    // Sign the new account in, so the console can show "waiting for approval" straight away.
    // Not through login(): a busy shared IP's failed sign-ins must not turn a created account into a 429.
    const s = auth.createSession(account.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(req, s.token, s.expires));
    res.status(201).json({ account, person });   // null until a coordinator approves the account
  } catch (err) { fail(res, err); }
});

router.post('/api/auth/login', (req, res) => {
  if (req.authOff) return res.status(400).json({ error: 'Sign-in is disabled while authentication is off.', code: 'AUTH_OFF' });
  try {
    const { email, password } = req.body || {};
    const s = auth.login(email, password, req.ip);
    res.setHeader('Set-Cookie', auth.sessionCookie(req, s.token, s.expires));
    res.json({ account: s.account });
  } catch (err) { fail(res, err); }
});

/** One-click demo sign-in: which roles are offered, and signing in as one. */
router.get('/api/auth/demo', (req, res) => {
  res.json({ roles: req.authOff ? [] : auth.demoRoles() });
});

router.post('/api/auth/demo', (req, res) => {
  if (req.authOff) return res.status(400).json({ error: 'Sign-in is disabled while authentication is off.', code: 'AUTH_OFF' });
  try {
    const s = auth.demoLogin(String((req.body || {}).role || ''), req.ip);
    res.setHeader('Set-Cookie', auth.sessionCookie(req, s.token, s.expires));
    res.json({ account: s.account });
  } catch (err) { fail(res, err); }
});

router.post('/api/auth/logout', (req, res) => {
  auth.logout(auth.readCookie(req));
  res.setHeader('Set-Cookie', auth.sessionCookie(req, null));
  res.json({ ok: true });
});

router.get('/api/auth/me', (req, res) => {
  if (req.authOff) {
    return res.json({ authenticated: true, auth: 'off', account: { role: 'coordinator', name: 'Agency Coordinator', email: '', status: 'active', person_id: null } });
  }
  res.json({ authenticated: Boolean(req.account), auth: 'on', account: auth.publicAccount(req.account) });
});

router.get('/api/auth/pending', coordinatorOnly, (req, res) => {
  // A pending account has no roster row yet: what they signed up with is in its profile.
  res.json(auth.pending().map(a => {
    const p = a.profile || {};
    const skills = Array.isArray(p.skills) ? p.skills.map(x => String(x).replace('_', ' ')).join(', ') : '';
    const detail = a.role === 'helper'
      ? [p.experience_years != null ? `${p.experience_years} yrs` : '', skills].filter(Boolean).join(', ')
      : (p.need || p.requirement ? `needs ${String(p.need || p.requirement).replace('_', ' ')}` : '');
    delete a.profile;
    return Object.assign(a, { location: p.location || null, detail: detail || null });
  }));
});

router.post('/api/auth/approve/:accountId', coordinatorOnly, (req, res) => {
  try {
    const a = auth.approve(req.params.accountId);
    if (!a) return res.status(404).json({ error: 'No pending account with that id.', code: 'NOT_FOUND' });
    res.json({ account: a });
  } catch (err) { fail(res, err); }
});

router.post('/api/auth/coordinators', coordinatorOnly, (req, res) => {
  try { res.status(201).json({ account: auth.createCoordinator(req.body || {}) }); } catch (err) { fail(res, err); }
});

/* ------------------------------------------------------------------ the helper's and household's own views */

function me(req, res, role) {
  const a = req.account;
  if (!a) { res.status(404).json({ error: 'No signed-in account.', code: 'NOT_FOUND' }); return null; }
  if (role && a.role !== role) { res.status(403).json({ error: 'This view is for ' + role + ' accounts.', code: 'FORBIDDEN' }); return null; }
  return a;
}

function helperName(id) {
  const h = id ? db.prepare('SELECT name FROM helpers WHERE id = ?').get(id) : null;
  return h ? h.name : null;
}

router.get('/api/me', (req, res) => {
  const a = me(req, res);
  if (!a) return;
  let person = null;
  if (a.role === 'helper') person = db.prepare('SELECT id, name, location, availability, experience_years FROM helpers WHERE id = ?').get(a.person_id) || null;
  if (a.role === 'household') person = db.prepare('SELECT id, name, location, need, schedule FROM households WHERE id = ?').get(a.person_id) || null;
  res.json({ account: auth.publicAccount(a), person });
});

/** Her promises, recent calls in plain words and where she works. No trust or churn scores. */
router.get('/api/me/helper', (req, res) => {
  const a = me(req, res, 'helper');
  if (!a) return;
  const id = a.person_id;
  const h = db.prepare('SELECT id, name, location, availability, experience_years, skills FROM helpers WHERE id = ?').get(id);
  if (!h) return res.status(404).json({ error: 'Your helper profile was not found.', code: 'NOT_FOUND' });
  let skills = [];
  try { skills = JSON.parse(h.skills || '[]'); } catch { skills = []; }
  const promises = db.prepare("SELECT text, made_at, due_date FROM commitments WHERE helper_id = ? AND status = 'open' ORDER BY made_at DESC").all(id);
  const kept = db.prepare("SELECT text, status, resolved_at FROM commitments WHERE helper_id = ? AND status IN ('kept', 'broken') ORDER BY resolved_at DESC LIMIT 5").all(id);
  const calls = db.prepare("SELECT created_at, outcome_json FROM calls WHERE helper_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 5").all(id).map(c => {
    let o = {};
    try { o = JSON.parse(c.outcome_json || '{}'); } catch { o = {}; }
    return { date: String(c.created_at || '').slice(0, 10), summary: o.coordinator_note || 'Call with the agency.', agreed: o.specific_commitment || null, next_check_in: o.follow_up_date || null };
  });
  const placement = db.prepare("SELECT p.started_at, hh.name FROM placements p JOIN households hh ON hh.id = p.household_id WHERE p.helper_id = ? AND p.status = 'active' LIMIT 1").get(id);
  res.json({
    helper: { id: h.id, name: h.name, location: h.location, availability: h.availability, experience_years: h.experience_years, skills },
    working_at: placement ? { household: placement.name, since: placement.started_at } : null,
    promises,
    resolved: kept,
    calls,
  });
});

router.get('/api/me/household', (req, res) => {
  const a = me(req, res, 'household');
  if (!a) return;
  const id = a.person_id;
  const hh = db.prepare('SELECT id, name, location, need, schedule, notes FROM households WHERE id = ?').get(id);
  if (!hh) return res.status(404).json({ error: 'Your household profile was not found.', code: 'NOT_FOUND' });
  const placements = db.prepare('SELECT helper_id, status, started_at, ended_at FROM placements WHERE household_id = ? ORDER BY (status = \'active\') DESC, started_at DESC').all(id)
    .map(p => ({ helper_id: p.helper_id, helper_name: helperName(p.helper_id), active: p.status === 'active', started_at: p.started_at, ended_at: p.ended_at }));
  const current = placements.filter(p => p.active);
  const due = current.length
    ? db.prepare(`SELECT MIN(due_date) AS d FROM commitments WHERE status = 'open' AND due_date IS NOT NULL AND helper_id IN (${current.map(() => '?').join(',')})`).get(...current.map(p => p.helper_id)).d
    : null;
  const lastCall = db.prepare("SELECT outcome_json FROM calls WHERE status = 'completed' AND json_extract(outcome_json, '$.household_id') = ? ORDER BY created_at DESC LIMIT 1").get(id);
  let followUp = null;
  try { followUp = lastCall ? JSON.parse(lastCall.outcome_json || '{}').follow_up_date || null : null; } catch { followUp = null; }
  const feedback = db.prepare('SELECT helper_id, rating, text, created_at FROM household_feedback WHERE household_id = ? ORDER BY created_at DESC LIMIT 5').all(id)
    .map(f => Object.assign(f, { helper_name: helperName(f.helper_id) }));
  res.json({ household: hh, current, placements, next_check_in: due || followUp || null, feedback });
});

db.exec(`CREATE TABLE IF NOT EXISTS household_feedback (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  helper_id TEXT,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

/** The household's own feedback: stored, shown to the coordinator and retained to Hindsight. */
router.post('/api/me/feedback', (req, res) => {
  const a = me(req, res, 'household');
  if (!a) return;
  const { rating, text, helper_id } = req.body || {};
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.', code: 'VALIDATION' });
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 1000) return res.status(400).json({ error: 'Feedback must be 3 to 1000 characters.', code: 'VALIDATION' });
  const hh = db.prepare('SELECT id, name FROM households WHERE id = ?').get(a.person_id);
  if (!hh) return res.status(404).json({ error: 'Your household profile was not found.', code: 'NOT_FOUND' });

  // Feedback is about a helper who has worked here (the active one by default), or the agency in general.
  const worked = db.prepare('SELECT helper_id FROM placements WHERE household_id = ? ORDER BY (status = \'active\') DESC, started_at DESC').all(hh.id).map(p => p.helper_id);
  let helperId = helper_id ? String(helper_id) : (worked[0] || null);
  if (helperId && !worked.includes(helperId)) return res.status(400).json({ error: 'Choose a helper who has worked with your household.', code: 'VALIDATION' });
  const hName = helperName(helperId);

  const now = new Date();
  const date = istDate(now);
  const id = 'fb_' + now.getTime().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  db.prepare('INSERT INTO household_feedback (id, household_id, helper_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, hh.id, helperId, r, t, nowSql());
  const content = `On ${date}, the ${hh.name} rated ${hName || 'the agency'} ${r} out of 5 and said: "${t}"`;
  db.prepare("INSERT INTO memories (id, helper_id, household_id, network, content, created_at) VALUES (?, ?, ?, 'opinion', ?, ?)")
    .run('mem_' + id, helperId, hh.id, content, nowSql());
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)")
    .run('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), `MEMORY AGENT — ${hh.name} left ${r}/5 feedback${hName ? ' about ' + hName : ''}; retained to Hindsight.`, nowSql());

  let retained = 'local_only';
  if (hindsight.isConfigured()) {
    const item = {
      content,
      context: 'Feedback written by the household itself in the household view of the agency app.',
      documentId: 'feedback:' + hh.id + ':' + id,
      timestamp: now.toISOString(),
      metadata: { household_id: hh.id, helper_id: helperId || '', kind: 'household_feedback', rating: String(r) },
      tags: ['household:' + hh.id, 'source:household_feedback'].concat(helperId ? ['helper:' + helperId] : []),
    };
    hindsight.retain([item]).catch(err => retainQueue.enqueue([item], { helperId, callId: 'feedback', error: err.message }));
    retained = 'sent';
  }
  res.status(201).json({ ok: true, feedback: { id, helper_id: helperId, helper_name: hName, rating: r, text: t, created_at: nowSql() }, retained });
});

module.exports = { router, accessControl };
