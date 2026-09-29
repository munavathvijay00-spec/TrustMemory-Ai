require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, normPath } = require('../server/rate-limit');
const { validate } = require('../server/validate');
const { istDate, isRealDate } = require('../server/dates');

function run(mw, req) {
  let status = 200;
  const res = { set() {}, status(s) { status = s; return this; }, json() { return this; } };
  let passed = false;
  mw(Object.assign({ ip: '1.1.1.1', query: {}, body: {} }, req), res, () => { passed = true; });
  return passed ? 'next' : status;
}

test('hardening: mixed case and trailing slashes share the same rate limit', () => {
  assert.equal(normPath('/api/Memory/Stats/'), '/api/memory/stats');
  const rl = createRateLimiter({ groups: [{ name: 'memory', prefix: '/api/memory/', limit: 1, windowMs: 60_000 }], now: () => 0 });
  assert.equal(run(rl, { method: 'GET', path: '/api/memory/stats' }), 'next');
  assert.equal(run(rl, { method: 'GET', path: '/api/Memory/stats' }), 429);
  assert.equal(run(rl, { method: 'GET', path: '/api/memory/stats/' }), 429);
});

test('hardening: sign-in is rate limited, but reading who is signed in is not', () => {
  const rl = createRateLimiter({ now: () => 0 });
  for (let i = 0; i < 20; i++) assert.equal(run(rl, { method: 'POST', path: '/api/auth/login', ip: '9.9.9.9' }), 'next');
  assert.equal(run(rl, { method: 'POST', path: '/api/auth/login', ip: '9.9.9.9' }), 429);
  assert.equal(run(rl, { method: 'GET', path: '/api/auth/me', ip: '9.9.9.9' }), 'next');
  assert.equal(run(rl, { method: 'POST', path: '/api/auth/logout', ip: '9.9.9.9' }), 'next');
});

test('hardening: validation applies with a trailing slash or odd case', () => {
  const long = 'x'.repeat(5000);
  for (const path of ['/api/voice/turn', '/api/voice/turn/', '/api/voice/Turn']) {
    assert.equal(run(validate, { method: 'POST', path, body: { session_id: 'browser_vs_1', text: long } }), 400, path);
  }
});

test('hardening: real calendar dates only, and today in India', () => {
  assert.equal(isRealDate('2026-02-28'), true);
  assert.equal(isRealDate('2026-02-30'), false);
  assert.equal(isRealDate('2026-13-01'), false);
  assert.equal(isRealDate('26-1-1'), false);
  // 20:00 UTC on 29 Sep is already 30 Sep in India.
  assert.equal(istDate(new Date('2026-09-29T20:00:00Z')), '2026-09-30');
  assert.equal(istDate(new Date('2026-09-29T10:00:00Z')), '2026-09-29');
});
