require('./support');
const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { createRateLimiter } = require('../server/rate-limit');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(async () => { await srv.close(); });

test('health: reports unconfigured integrations and database counts, without secrets', async () => {
  const r = await srv.request('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(typeof r.body.uptime_s, 'number');
  assert.deepEqual(r.body.groq, { configured: false, keys: 0 });
  assert.deepEqual(r.body.hindsight, { configured: false, bank: 'trustmemory-agency' });
  assert.deepEqual(r.body.db, { helpers: 8, calls: 0 });
  assert.equal(r.body.retains_waiting, 0);
  assert.match(r.headers['x-request-id'], /^[0-9a-f]{8}$/);
});

test('validation: voice session rejects unknown helpers, scenarios and late counts', async () => {
  let r = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'nobody' } });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'NOT_FOUND');
  r = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'anita', scenario: 'sales_pitch' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'VALIDATION');
  for (const late_count of [21, -1, 2.5, 'two']) {
    r = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'anita', late_count } });
    assert.equal(r.status, 400, 'late_count ' + late_count);
  }
  // A valid request passes validation and reaches the agent, which reports Groq is not configured.
  r = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'anita', scenario: 'followup_call', late_count: '3' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'GROQ_NOT_CONFIGURED');
});

test('validation: voice turn, memory feedback and recall reject malformed input', async () => {
  const bad = [
    ['POST', '/api/voice/turn', { session_id: 'vs_123', text: 'hi' }],
    ['POST', '/api/voice/turn', { session_id: 'vs_0123456789ab', text: '   ' }],
    ['POST', '/api/voice/turn', { session_id: 'vs_0123456789ab', text: 'x'.repeat(2001) }],
    ['POST', '/api/memory/feedback', { helper_id: 'anita', verdict: 'maybe' }],
    ['POST', '/api/memory/feedback', { helper_id: 'anita', verdict: 'correct', note: 'x'.repeat(501) }],
    ['GET', '/api/memory/recall?q=', undefined],
    ['GET', '/api/memory/recall?q=' + 'a'.repeat(301), undefined],
  ];
  for (const [method, path, body] of bad) {
    const r = await srv.request(method, path, { body });
    assert.equal(r.status, 400, method + ' ' + path.slice(0, 40));
    assert.equal(r.body.code, 'VALIDATION');
    assert.equal(typeof r.body.error, 'string');
  }
  // Well-formed but unknown session: validation passes, the route answers 404.
  const r = await srv.request('POST', '/api/voice/turn', { body: { session_id: 'vs_0123456789ab', text: 'Hello' } });
  assert.equal(r.status, 404);
});

test('errors: unknown /api routes and malformed JSON answer with JSON, not HTML', async () => {
  let r = await srv.request('GET', '/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'Not found.', code: 'NOT_FOUND' });
  r = await srv.request('POST', '/api/voice/turn', { raw: '{"session_id": "vs_', headers: {} });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'BAD_JSON');
  r = await srv.request('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.text, /TrustMemory AI/);
});

test('rate limit: 31st voice request in a minute gets 429 with Retry-After; status polls are exempt', async () => {
  const own = await startServer(createApp({ port: 0 }));
  try {
    for (let i = 0; i < 30; i++) {
      const r = await own.request('POST', '/api/voice/turn', { body: {} });
      assert.equal(r.status, 400);
    }
    const limited = await own.request('POST', '/api/voice/turn', { body: {} });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, 'RATE_LIMITED');
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    for (let i = 0; i < 5; i++) {
      assert.equal((await own.request('GET', '/api/voice/incoming?helper=anita')).status, 200);
      assert.equal((await own.request('GET', '/api/memory/status')).status, 200);
    }
    assert.equal((await own.request('GET', '/api/health')).status, 200, 'other routes are not limited');
  } finally { await own.close(); }
});

test('rate limit: tokens refill over time (fake clock)', () => {
  let t = 0;
  const limiter = createRateLimiter({ groups: [{ name: 'g', prefix: '/api/g/', limit: 2, windowMs: 1000 }], now: () => t });
  const run = () => {
    let status = 200; const headers = {};
    const res = { set: (k, v) => { headers[k] = v; }, status: (s) => { status = s; return { json: () => {} }; } };
    let passed = false;
    limiter({ method: 'POST', path: '/api/g/x', ip: '1.2.3.4' }, res, () => { passed = true; });
    return { passed, status, headers };
  };
  assert.equal(run().passed, true);
  assert.equal(run().passed, true);
  const third = run();
  assert.equal(third.passed, false);
  assert.equal(third.status, 429);
  assert.equal(third.headers['Retry-After'], '1');
  t = 500; // half a window refills one token
  assert.equal(run().passed, true);
  assert.equal(run().passed, false);
});
