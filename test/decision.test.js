require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { recalculateChurn } = require('../server/decision');

test('decision: structured outcome moves churn by the named deltas and records why', () => {
  const before = db.prepare('SELECT churn FROM helpers WHERE id = ?').get('anita').churn;
  const r = recalculateChurn('anita', 'coaching_call', 'Agreed to take the earlier bus.', 2, {
    call_completed: true, specific_commitment: 'Take the 7:10 bus', notification_commitment: true, sentiment: 'cooperative',
  });
  // +6 (2 late) -8 (commitment) -3 (will notify) -2 (cooperative) = -7
  assert.equal(r.delta, -7);
  assert.equal(r.old_churn, before);
  assert.equal(r.new_churn, before - 7);
  assert.deepEqual(r.reasons, [
    '2 recent late arrivals (+6)',
    'concrete commitment made (-8)',
    'agreed to notify household when late (-3)',
    'cooperative on call (-2)',
  ]);
  assert.equal(db.prepare('SELECT churn FROM helpers WHERE id = ?').get('anita').churn, before - 7);
  const op = db.prepare("SELECT content FROM memories WHERE helper_id = 'anita' AND network = 'opinion' ORDER BY rowid DESC LIMIT 1").get();
  assert.match(op.content, /Churn risk recalculated: \d+ → \d+ \(-7\)\. Because: 2 recent late arrivals/);
});

test('decision: churn is clamped to 0..100 and the legacy keyword path still works', () => {
  const up = recalculateChurn('sunita', 'escalation_call', 'x', 20, { sentiment: 'defensive', escalations_required: true, call_completed: false });
  assert.equal(up.new_churn, 100); // 42 + 60 + 5 + 10 + 2 would be 119
  const legacy = recalculateChurn('lakshmi', 'coaching_call', 'She agreed to message the family and it was escalated.', 0, null);
  assert.equal(legacy.delta, 2); // -8 commitment, +10 escalation
  assert.deepEqual(legacy.reasons, ['commitment in summary (-8)', 'escalation in summary (+10)']);
  assert.equal(recalculateChurn('nobody', 'coaching_call', 'x'), null);
});
