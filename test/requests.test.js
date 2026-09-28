/**
 * Requests and preferences from helpers and households: validation per role and kind, storage,
 * the coordinator's acknowledgement, pay issues feeding the safety check, call preferences used
 * as the default call language, and household notes. Groq is mocked at the network edge.
 */
const { startServer } = require('./support');

process.env.GROQ_API_KEYS = 'gsk_test_key_0001';
global.fetch = async (url) => {
  if (String(url).startsWith('https://api.groq.com/')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Namaskaram, is this a good time to talk?' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('Network disabled in tests: ' + url);
};

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const auth = require('../server/auth');
const db = require('../server/db');
const requests = require('../server/requests');

const PASS = { coordinator: 'Coordinator2026', helper: 'RadhaLine2026', household: 'GuptaHome2026' };
let srv;
let open;

test.before(async () => {
  auth.seedDemoAccounts({ DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper, DEMO_HOUSEHOLD_PASSWORD: PASS.household });
  srv = await startServer(createApp({ port: 0, auth: true, seedDemo: false }));
  open = await startServer(createApp({ port: 0 }));
});
test.after(async () => { await srv.close(); await open.close(); });

async function login(email, password) {
  const r = await srv.request('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, r.text);
  return [].concat(r.headers['set-cookie'] || []).find(c => c.startsWith(auth.COOKIE + '=')).split(';')[0];
}
const as = cookie => ({ headers: { Cookie: cookie } });
const inDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('requests: kinds are checked per role, leave needs sensible dates, text is required', () => {
  assert.throws(() => requests.createRequest('helper', 'radha', { kind: 'praise', text: 'Hello there' }), /Choose what this is about/);
  assert.throws(() => requests.createRequest('household', 'h105', { kind: 'pay_issue', text: 'Hello there' }), /Choose what this is about/);
  assert.throws(() => requests.createRequest('helper', 'radha', { kind: 'leave', text: 'Going home' }), /date/);
  assert.throws(() => requests.createRequest('helper', 'radha', { kind: 'leave', text: 'Going home', date_from: inDays(5), date_to: inDays(2) }), /on or after/);
  assert.throws(() => requests.createRequest('helper', 'radha', { kind: 'leave', text: 'Going home', date_from: inDays(200) }), /120 days/);
  assert.throws(() => requests.createRequest('helper', 'radha', { kind: 'other', text: 'x' }), /3 to 500/);
  const ok = requests.createRequest('helper', 'radha', { kind: 'leave', text: 'Going home for Dussehra', date_from: inDays(10), date_to: inDays(14) });
  assert.equal(ok.request.status, 'open');
  assert.equal(ok.request.person_name, 'Radha Kumari');
  assert.equal(requests.listFor('helper', 'radha')[0].id, ok.request.id);
});

test('requests: a helper and a household send requests from their own views; the coordinator acknowledges', async () => {
  const radha = await login('radha@trustmemory.demo', PASS.helper);
  const bad = await srv.request('POST', '/api/me/requests', { body: { kind: 'concern', text: 'Not a helper kind' }, ...as(radha) });
  assert.equal(bad.status, 400);
  const sent = await srv.request('POST', '/api/me/requests', { body: { kind: 'running_late', text: 'The bus is late, I will reach by 9:30.' }, ...as(radha) });
  assert.equal(sent.status, 201, sent.text);
  assert.equal((await srv.request('GET', '/api/requests', as(radha))).status, 403, 'helpers cannot read everyone\'s requests');

  const gupta = await login('gupta@trustmemory.demo', PASS.household);
  const cover = await srv.request('POST', '/api/me/requests', { body: { kind: 'cover_needed', text: 'Radha is away for Diwali; we need mornings covered.', date_from: inDays(20), date_to: inDays(24) }, ...as(gupta) });
  assert.equal(cover.status, 201, cover.text);
  const mine = await srv.request('GET', '/api/me/requests', as(gupta));
  assert.ok(mine.body.requests.some(r => r.kind === 'cover_needed'));

  const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
  const list = await srv.request('GET', '/api/requests?status=open', as(coord));
  const ids = list.body.requests.map(r => r.id);
  assert.ok(ids.includes(sent.body.request.id) && ids.includes(cover.body.request.id));
  const ack = await srv.request('POST', '/api/requests/' + sent.body.request.id + '/ack', { body: { note: 'Thanks for telling us.' }, ...as(coord) });
  assert.equal(ack.body.request.status, 'acknowledged');
  const hers = await srv.request('GET', '/api/me/requests', as(radha));
  assert.equal(hers.body.requests.find(r => r.id === sent.body.request.id).coordinator_note, 'Thanks for telling us.');
  assert.equal((await srv.request('POST', '/api/requests/nope/ack', { body: {}, ...as(coord) })).status, 404);
});

test('requests: a helper\'s pay issue is a safety signal, and a second one raises the private check', () => {
  // Lakshmi's seeded history already has one late-salary mention inside the 60-day window.
  const r = requests.createRequest('helper', 'lakshmi', { kind: 'pay_issue', text: 'My salary for this month has not come yet.' });
  const signal = db.prepare("SELECT * FROM safety_signals WHERE call_id = ?").get('request_' + r.request.id);
  assert.equal(signal.kind, 'unpaid_pay');
  assert.ok(r.safety_flag, 'the private safety check is raised');
  assert.ok(db.prepare("SELECT 1 FROM safety_flags WHERE helper_id = 'lakshmi' AND status = 'open'").get());
});

test('preferences: a helper sets how to be called; calls default to her language', async () => {
  const radha = await login('radha@trustmemory.demo', PASS.helper);
  assert.equal((await srv.request('PUT', '/api/me/preferences', { body: { language: 'fr', call_window: 'after 10 AM' }, ...as(radha) })).status, 400);
  const saved = await srv.request('PUT', '/api/me/preferences', { body: { language: 'te', call_window: 'after 10 AM' }, ...as(radha) });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(requests.preferredLanguage('radha'), 'te');
  const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
  assert.equal((await srv.request('GET', '/api/helper-preferences', as(coord))).body.preferences.radha.call_window, 'after 10 AM');

  const call = await open.request('POST', '/api/voice/session', { body: { helper_id: 'radha', scenario: 'coaching_call', late_count: 1 } });
  assert.equal(call.status, 200, call.text);
  assert.equal(call.body.language, 'te', 'no language given: her saved one is used');
  const english = await open.request('POST', '/api/voice/session', { body: { helper_id: 'radha', scenario: 'coaching_call', late_count: 1, language: 'en' } });
  assert.equal(english.body.language, 'en', 'an explicit choice still wins');
  for (const s of [call.body.session_id, english.body.session_id]) await open.request('POST', '/api/voice/cancel', { body: { session_id: s } });
});

test('household notes: saved for the next helper and kept in the household notes summary', async () => {
  const gupta = await login('gupta@trustmemory.demo', PASS.household);
  assert.equal((await srv.request('PUT', '/api/me/household-notes', { body: {}, ...as(gupta) })).status, 400);
  const r = await srv.request('PUT', '/api/me/household-notes', { body: { routine: 'School drop at 8:15.', health: 'Grandmother is diabetic.', preferences: '' }, ...as(gupta) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.health, 'Grandmother is diabetic.');
  assert.match(db.prepare("SELECT notes FROM households WHERE id = 'h105'").get().notes, /diabetic/);
  const radha = await login('radha@trustmemory.demo', PASS.helper);
  assert.equal((await srv.request('PUT', '/api/me/household-notes', { body: { routine: 'x y z' }, ...as(radha) })).status, 403);
  const fest = await srv.request('GET', '/api/me/festivals', as(radha));
  assert.ok(Array.isArray(fest.body.festivals));
});
