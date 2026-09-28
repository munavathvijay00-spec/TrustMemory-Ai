require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const commitments = require('../server/commitments');
const { recalculateChurn } = require('../server/decision');
const db = require('../server/db');

test('commitments: the ledger is seeded to match the seeded memory history', () => {
  const radha = commitments.whatWorks('radha');
  assert.equal(radha.best.approach, 'reassure_first');
  assert.equal(radha.best.kept, 1);
  const sunita = commitments.whatWorks('sunita');
  assert.equal(sunita.best, null);
  assert.deepEqual(sunita.avoid.map(a => a.approach), ['firm_reminder']);
});

test('commitments: a promise opens, resolves once, and teaches which approach works', () => {
  const id = commitments.add({ helperId: 'meena', text: 'Leave twenty minutes earlier on Mondays', approach: 'listen_first', callId: 'c1' });
  assert.equal(commitments.openFor('meena').length, 1);
  assert.equal(commitments.resolve(id, 'kept', { evidence: 'I was on time all week', callId: 'c2' }), true);
  assert.equal(commitments.resolve(id, 'broken'), false, 'an already resolved promise cannot be resolved again');
  assert.equal(commitments.openFor('meena').length, 0);
  const s = commitments.stats('meena');
  assert.equal(s.kept, 1);
  assert.equal(s.kept_rate, 100);
  assert.equal(commitments.whatWorks('meena').best.approach, 'listen_first');
});

test('commitments: unknown approaches are not stored and invalid statuses are refused', () => {
  const id = commitments.add({ helperId: 'lakshmi', text: 'Call if running late', approach: 'shouting' });
  assert.equal(db.prepare('SELECT approach FROM commitments WHERE id = ?').get(id).approach, null);
  assert.equal(commitments.resolve(id, 'maybe'), false);
});

test('decision: kept and broken promises move churn with named reasons', () => {
  const r = recalculateChurn('priya', 'followup_call', 'Follow-up', 0, {
    call_completed: true,
    commitment_checks: [{ status: 'kept' }, { status: 'broken' }],
  });
  assert.ok(r.reasons.includes('kept an earlier commitment (-6)'));
  assert.ok(r.reasons.includes('earlier commitment not kept (+6)'));
  assert.equal(r.delta, 0);
});
