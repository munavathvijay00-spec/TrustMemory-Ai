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

test('commitments: a promise gets a check-in date two weeks out and shows up when due', () => {
  const past = new Date(Date.now() - 20 * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  const id = commitments.add({ helperId: 'fatima', text: 'Arrive by 9 on weekdays', madeAt: past });
  const row = db.prepare('SELECT due_date FROM commitments WHERE id = ?').get(id);
  assert.equal(row.due_date, new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const due = commitments.due().find(d => d.id === id);
  assert.ok(due, 'an open promise past its check-in date is listed as due');
  assert.equal(due.overdue, true);
  commitments.resolve(id, 'kept', { evidence: 'on time' });
  assert.equal(commitments.due().some(d => d.id === id), false, 'resolved promises are no longer due');
});

test('commitments: a second broken promise within 60 days escalates once to the coordinator', () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE text LIKE '%Escalation:%'").get().n;
  const a = commitments.add({ helperId: 'kavita', text: 'Check in with the household each morning' });
  commitments.resolve(a, 'broken', { evidence: 'forgot' });
  assert.ok(commitments.escalations().some(e => e.helper_id === 'kavita' && e.broken >= 2));
  const after = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE text LIKE '%Escalation:%'").get().n;
  assert.equal(after, before + 1);
});

test('commitments: problem types are validated, and the older agency history seeds once', () => {
  const id = commitments.add({ helperId: 'priya', text: 'Rest on Sundays', problemType: 'health' });
  assert.equal(db.prepare('SELECT problem_type FROM commitments WHERE id = ?').get(id).problem_type, 'health');
  assert.equal(commitments.setProblemType(id, 'astrology'), false);
  assert.equal(commitments.setProblemType(id, 'workload'), true);
  assert.equal(commitments.add({ helperId: 'priya', text: 'x', problemType: 'nonsense' }) && db.prepare("SELECT problem_type FROM commitments WHERE text = 'x'").get().problem_type, null);
  assert.equal(commitments.seedHistory(), 0, 're-seeding adds nothing');
  assert.equal(db.prepare("SELECT problem_type FROM commitments WHERE helper_id = 'radha' AND source = 'agency records'").get().problem_type, 'family');
});
