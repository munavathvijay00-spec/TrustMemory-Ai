const { startServer } = require('./support');
// Hindsight "configured" (the fetch stub still refuses the network), so retains fail and land in the queue.
process.env.HINDSIGHT_API_KEY = 'test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const auth = require('../server/auth');
const db = require('../server/db');
const retainQueue = require('../server/retain-queue');

const PASS = { coordinator: 'Coordinator2026', helper: 'RadhaLine2026', household: 'GuptaHome2026' };
let srv;

test.before(async () => {
  auth.seedDemoAccounts({ DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper, DEMO_HOUSEHOLD_PASSWORD: PASS.household });
  srv = await startServer(createApp({ port: 0, auth: true, seedDemo: false }));
});
test.after(() => srv.close());

function cookieFrom(r) {
  const set = [].concat(r.headers['set-cookie'] || []).find(c => c.startsWith(auth.COOKIE + '='));
  return set ? set.split(';')[0] : '';
}

async function login(email, password) {
  const r = await srv.request('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, 'login ' + email + ': ' + r.text);
  return cookieFrom(r);
}

const as = (cookie) => ({ headers: { Cookie: cookie } });

const NEW_HELPER = {
  role: 'helper', email: 'Saroja.Devi@Example.com', password: 'saroja2026', confirm: 'saroja2026',
  name: 'Saroja Devi', location: 'Ameerpet', experience_years: 4, skills: ['cooking'], availability: 'Part-time',
};

test('auth: without a session only health, sign-in and the static app are reachable', async () => {
  assert.equal((await srv.request('GET', '/api/dashboard')).status, 401);
  assert.equal((await srv.request('GET', '/api/helpers')).status, 401);
  assert.equal((await srv.request('GET', '/api/health')).status, 200);
  const me = await srv.request('GET', '/api/auth/me');
  assert.equal(me.body.authenticated, false);
  assert.equal((await srv.request('GET', '/')).status, 200);
});

test('auth: sign-up validates email, password and profile before creating anything', async () => {
  const helpersBefore = db.prepare('SELECT COUNT(*) AS n FROM helpers').get().n;
  const cases = [
    [{ ...NEW_HELPER, email: 'not-an-email' }, 400, /valid email/],
    [{ ...NEW_HELPER, password: 'short1', confirm: 'short1' }, 400, /8 to 72/],
    [{ ...NEW_HELPER, password: 'onlyletters', confirm: 'onlyletters' }, 400, /letter and one number/],
    [{ ...NEW_HELPER, confirm: 'different2026' }, 400, /do not match/],
    [{ ...NEW_HELPER, skills: [] }, 400, /skill/],
    [{ ...NEW_HELPER, role: 'coordinator' }, 403, /created by the agency/],
  ];
  for (const [body, status, re] of cases) {
    const r = await srv.request('POST', '/api/auth/signup', { body });
    assert.equal(r.status, status, JSON.stringify(r.body));
    assert.match(r.body.error, re);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM helpers').get().n, helpersBefore, 'no helper is created by a rejected sign-up');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE email = ?').get('saroja.devi@example.com').n, 0);
});

test('auth: a new helper signs up pending, the coordinator approves, then she sees only her own view', async () => {
  const r = await srv.request('POST', '/api/auth/signup', { body: NEW_HELPER });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.account.status, 'pending');
  assert.equal(r.body.account.email, 'saroja.devi@example.com');
  const row = db.prepare('SELECT * FROM accounts WHERE email = ?').get('saroja.devi@example.com');
  assert.ok(row.password_hash && !row.password_hash.includes('saroja2026') && row.salt, 'password is stored hashed with a salt');
  assert.notEqual(row.password_hash, auth.hashPassword('saroja2026', 'other-salt'));

  const pendingCookie = cookieFrom(r);
  assert.ok(pendingCookie, 'sign-up signs the account in');
  assert.equal((await srv.request('GET', '/api/auth/me', as(pendingCookie))).body.account.status, 'pending');
  const blocked = await srv.request('GET', '/api/me/helper', as(pendingCookie));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PENDING');

  assert.equal((await srv.request('POST', '/api/auth/signup', { body: NEW_HELPER })).status, 409, 'an email can only sign up once');

  const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
  const pending = await srv.request('GET', '/api/auth/pending', as(coord));
  const mine = pending.body.find(a => a.email === 'saroja.devi@example.com');
  assert.ok(mine, 'the coordinator sees the pending account');
  assert.equal((await srv.request('POST', '/api/auth/approve/' + mine.id, as(coord))).status, 200);

  const view = await srv.request('GET', '/api/me/helper', as(pendingCookie));
  assert.equal(view.status, 200);
  assert.equal(view.body.helper.name, 'Saroja Devi');
  assert.doesNotMatch(view.text, /trust|churn/i, 'the helper view carries no scores');
  assert.equal((await srv.request('GET', '/api/dashboard', as(pendingCookie))).status, 403);
  assert.equal((await srv.request('GET', '/api/auth/pending', as(pendingCookie))).status, 403);
});

test('auth: wrong password is a generic error; logout ends the session', async () => {
  const bad = await srv.request('POST', '/api/auth/login', { body: { email: 'radha@trustmemory.demo', password: 'Wrong2026x' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'Email or password is incorrect.');
  const unknown = await srv.request('POST', '/api/auth/login', { body: { email: 'nobody@trustmemory.demo', password: 'Wrong2026x' } });
  assert.equal(unknown.body.error, 'Email or password is incorrect.', 'unknown emails get the same message');

  const cookie = await login('radha@trustmemory.demo', PASS.helper);
  assert.equal((await srv.request('GET', '/api/auth/me', as(cookie))).body.account.role, 'helper');
  await srv.request('POST', '/api/auth/logout', as(cookie));
  assert.equal((await srv.request('GET', '/api/auth/me', as(cookie))).body.authenticated, false);
});

test('auth: helpers reach the phone-screen relay only for their own calls; the coordinator reaches all', async () => {
  const radha = await login('radha@trustmemory.demo', PASS.helper);
  assert.equal((await srv.request('GET', '/api/voice/incoming?helper=radha', as(radha))).status, 200);
  assert.equal((await srv.request('GET', '/api/voice/incoming?helper=anita', as(radha))).status, 403);
  assert.equal((await srv.request('POST', '/api/voice/answer', { body: { session_id: 'vs_000000000000' }, ...as(radha) })).status, 403);
  const list = await srv.request('GET', '/api/helpers', as(radha));
  assert.deepEqual(list.body, [{ id: 'radha', name: 'Radha Kumari' }], 'the phone screen gets her name only');

  const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
  assert.equal((await srv.request('GET', '/api/voice/incoming?helper=anita', as(coord))).status, 200);
  assert.equal((await srv.request('GET', '/api/dashboard', as(coord))).status, 200);
});

test('auth: household feedback is validated, stored and retained with household and helper tags', async () => {
  const gupta = await login('gupta@trustmemory.demo', PASS.household);
  assert.equal((await srv.request('GET', '/api/helpers', as(gupta))).status, 403);
  assert.equal((await srv.request('POST', '/api/me/feedback', { body: { rating: 6, text: 'Great' }, ...as(gupta) })).status, 400);
  assert.equal((await srv.request('POST', '/api/me/feedback', { body: { rating: 4, text: 'Fine', helper_id: 'anita' }, ...as(gupta) })).status, 400, 'only helpers who worked there');

  const queued = retainQueue.pendingCount();
  const r = await srv.request('POST', '/api/me/feedback', { body: { rating: 4, text: 'Very patient with our son, but often ten minutes late.' }, ...as(gupta) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.feedback.helper_id, 'radha', 'defaults to the helper placed there now');
  assert.equal(r.body.retained, 'sent');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(retainQueue.pendingCount(), queued + 1, 'the failed retain is queued for retry');
  const job = db.prepare("SELECT payload FROM retain_jobs WHERE call_id = 'feedback' ORDER BY rowid DESC LIMIT 1").get();
  const item = JSON.parse(job.payload)[0];
  assert.deepEqual(item.tags.sort(), ['helper:radha', 'household:h105', 'source:household_feedback']);

  const view = await srv.request('GET', '/api/me/household', as(gupta));
  assert.equal(view.body.household.name, 'Gupta Residence');
  assert.equal(view.body.feedback[0].rating, 4);
  assert.doesNotMatch(view.text, /difficulty/, 'no difficulty score in the household view');
});

test('auth: repeated wrong passwords for one email are locked out for a while', async () => {
  for (let i = 0; i < 5; i += 1) {
    await srv.request('POST', '/api/auth/login', { body: { email: 'gupta@trustmemory.demo', password: 'Nope' + i + 'abc' } });
  }
  const r = await srv.request('POST', '/api/auth/login', { body: { email: 'gupta@trustmemory.demo', password: PASS.household } });
  assert.equal(r.status, 429);
});

test('auth: demo accounts are seeded once and a password from the environment resets them', () => {
  const again = auth.seedDemoAccounts({ DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper, DEMO_HOUSEHOLD_PASSWORD: PASS.household });
  assert.deepEqual(again, []);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE email LIKE '%@trustmemory.demo'").get().n, 3);
  auth.seedDemoAccounts({ DEMO_HELPER_PASSWORD: 'NewRadha2026' });
  assert.equal(auth.login('radha@trustmemory.demo', 'NewRadha2026').account.role, 'helper');
});

test('auth: upper-case /API paths cannot slip past sign-in', async () => {
  for (const p of ['/API/dashboard', '/Api/helpers', '/API/care/safety']) {
    const r = await srv.request('GET', p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await srv.request('POST', '/API/helpers', { body: { name: 'Mallory Bypass' } })).status, 404);
});

test('auth: a pending sign-up stays out of the roster and memory until it is approved', async () => {
  const body = { role: 'household', email: 'menon@example.com', password: 'menon2026', confirm: 'menon2026', name: 'Menon Residence', location: 'Tarnaka', requirement: 'elder_care', schedule: 'Weekdays' };
  const r = await srv.request('POST', '/api/auth/signup', { body });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.person, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM households WHERE name = 'Menon Residence'").get().n, 0, 'not in the roster yet');
  const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
  const acc = (await srv.request('GET', '/api/auth/pending', as(coord))).body.find(a => a.email === 'menon@example.com');
  assert.equal((await srv.request('POST', '/api/auth/approve/' + acc.id, as(coord))).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM households WHERE name = 'Menon Residence'").get().n, 1, 'created on approval');
  const bad = await srv.request('POST', '/api/auth/signup', { body: { ...body, email: 'x@example.com', name: '<img src=x onerror=alert(1)>' } });
  assert.equal(bad.status, 400, 'markup is refused in household names');
});

test('auth: a malformed session cookie is ignored, not a 500', async () => {
  const r = await srv.request('GET', '/api/health', { headers: { Cookie: auth.COOKIE + '=%E0%A4%A' } });
  assert.equal(r.status, 200);
});

test('auth: one-click demo sign-in is offered only for demo accounts whose password comes from the environment', async () => {
  auth.seedDemoAccounts({ DEMO_HELPER_PASSWORD: PASS.helper });   // an earlier test changed it
  const env = { DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper };
  assert.deepEqual(auth.demoRoles(env), ['coordinator', 'helper']);
  assert.deepEqual(auth.demoRoles(Object.assign({ DEMO_ONE_CLICK: '0' }, env)), [], 'DEMO_ONE_CLICK=0 turns it off');
  assert.equal(auth.demoLogin('helper', '1.2.3.4', env).account.email, 'radha@trustmemory.demo');
  assert.throws(() => auth.demoLogin('household', '1.2.3.4', env), /not available/);
  assert.throws(() => auth.demoLogin('admin', '1.2.3.4', env), /not available/);

  // Over HTTP: with no demo passwords in this process's environment, nothing is offered.
  const saved = {};
  for (const k of ['DEMO_COORDINATOR_PASSWORD', 'DEMO_HELPER_PASSWORD', 'DEMO_HOUSEHOLD_PASSWORD']) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    assert.deepEqual((await srv.request('GET', '/api/auth/demo')).body.roles, []);
    assert.equal((await srv.request('POST', '/api/auth/demo', { body: { role: 'coordinator' } })).status, 404);
    process.env.DEMO_COORDINATOR_PASSWORD = PASS.coordinator;
    assert.deepEqual((await srv.request('GET', '/api/auth/demo')).body.roles, ['coordinator']);
    const r = await srv.request('POST', '/api/auth/demo', { body: { role: 'coordinator' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.account.role, 'coordinator');
    assert.ok(cookieFrom(r), 'a session cookie is set');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
