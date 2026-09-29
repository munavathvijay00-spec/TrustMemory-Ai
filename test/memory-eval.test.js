const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, leaks, rankOf, markdown } = require('../server/eval-memory');

test('memory eval: rank is the first matching result, a leak names another helper and not her', () => {
  const results = [{ text: 'Radha Kumari takes the bus.' }, { text: 'Anita Verma prefers mornings.' }, { text: 'Radha Kumari and Anita Verma met.' }];
  assert.equal(rankOf(results, /mornings/), 2);
  assert.equal(rankOf(results, /salary/), null);
  assert.equal(leaks('radha', results).length, 1);
  assert.ok(CASES.length >= 10 && CASES.every(c => c.helper && c.q && c.expect instanceof RegExp));
});

test('memory eval: the report states pass rate and leaks', () => {
  const md = markdown({ rows: [{ helper: 'radha', kind: 'time', q: 'When?', scopedRank: 1, openRank: null }], summary: { cases: 1, pass: 1, top1: 1, openPass: 0, leakCount: 0, openOthers: 2, medianMs: 400 } }, '2026-09-29');
  assert.match(md, /\*\*1 of 1\*\*/);
  assert.match(md, /Results about a different helper \| \*\*0\*\* \| 2/);
});
