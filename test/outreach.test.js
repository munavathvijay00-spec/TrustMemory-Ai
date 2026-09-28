const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const commitments = require('../server/commitments');
const hindsight = require('../server/hindsight');
const outreach = require('../server/outreach');
const hooks = require('../server/voice/hooks');
const { createApp } = require('../server/app');

const NOW = new Date('2026-09-29T08:00:00Z');
const find = (r, id) => r.calls.find(c => c.helper_id === id);

test('outreach: a coming festival plus a late return last year puts the helper at the top, with the record cited', async () => {
  const r = await outreach.today({ now: NOW, useMemory: false });
  assert.deepEqual(r.upcoming_festivals.map(f => f.name), ['Bathukamma', 'Dussehra', 'Diwali']);
  const radha = find(r, 'radha');
  const fest = radha.reasons.find(x => x.kind === 'festival_risk');
  assert.equal(fest.festival.name, 'Dussehra');
  assert.equal(fest.festival.days_away, 21);
  assert.equal(fest.source, 'agency records');
  assert.equal(fest.when, '2025-09-29');
  assert.match(fest.text, /came back 9 days late/);
  assert.match(radha.purpose, /Dussehra is on 20 October/);
  assert.ok(radha.purpose.length <= 300);
  assert.equal(radha.priority, 'high');
  assert.equal(r.calls[0].helper_id, 'radha', 'the late festival return ranks first');
  const meena = find(r, 'meena');
  assert.match(meena.reasons.find(x => x.kind === 'festival_risk').text, /no cover arranged/);
});

test('outreach: repeated salary advances within 30 days are a reason, older ones are not', async () => {
  const r = await outreach.today({ useMemory: false });
  const sunita = find(r, 'sunita');
  const adv = sunita.reasons.find(x => x.kind === 'advance_requests');
  assert.match(adv.text, /2 times in 30 days/);
  assert.match(adv.evidence, /evening-class fees/);
  // Far in the future the requests fall outside the 30-day window.
  const later = await outreach.today({ now: new Date(Date.now() + 60 * 86400000), useMemory: false });
  const s2 = find(later, 'sunita');
  assert.ok(!s2 || !s2.reasons.some(x => x.kind === 'advance_requests'));
});

test('outreach: an overdue promise is cited from the ledger and outranks quiet check-ins', async () => {
  const past = new Date(Date.now() - 20 * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  const id = commitments.add({ helperId: 'lakshmi', text: 'Tell the family a day ahead before any leave', madeAt: past });
  const r = await outreach.today({ useMemory: false, limit: 50 });
  const lakshmi = find(r, 'lakshmi');
  const due = lakshmi.reasons.find(x => x.kind === 'promise_due');
  assert.equal(due.source, 'commitment ledger');
  assert.equal(due.ref, id);
  assert.match(due.text, /overdue by 6 days/);
  assert.equal(lakshmi.reasons[0].kind, 'promise_due', 'strongest reason first');
  const quiet = r.calls.filter(c => c.reasons.length === 1 && c.reasons[0].kind === 'no_recent_call');
  for (const q of quiet) assert.ok(r.calls.indexOf(q) > r.calls.indexOf(lakshmi));
  commitments.resolve(id, 'kept', { evidence: 'she did' });
});

test('outreach: festival travel remembered only in Hindsight still becomes a reason, and a Hindsight failure never breaks the list', async () => {
  const orig = { isConfigured: hindsight.isConfigured, recall: hindsight.recall };
  try {
    hindsight.isConfigured = () => true;
    hindsight.recall = async (q, opts) => (opts.tags[0] === 'helper:kavita'
      ? [{ id: 'm1', text: 'Kavita said she goes home to Karimnagar every Dasara and came back a week late last year.', mentionedAt: '2025-10-12T10:00:00Z' }]
      : opts.tags[0] === 'helper:meena'
        ? [{ id: 'm2', text: 'Meena asked about the advanced elder-care training course.', mentionedAt: '2026-09-20T10:00:00Z' },
          { id: 'm3', text: 'Meena asked for the roster in advance.', mentionedAt: '2026-09-21T10:00:00Z' }]
        : []);
    outreach.clearMemoryCache();
    const r = await outreach.today({ now: NOW });
    assert.equal(r.memory_source, 'hindsight');
    const fest = find(r, 'kavita').reasons.find(x => x.kind === 'festival_risk');
    assert.equal(fest.source, 'Hindsight memory');
    assert.equal(fest.when, '2025-10-12');
    assert.equal(fest.festival.name, 'Dussehra');
    assert.ok(!find(r, 'meena').reasons.some(x => x.kind === 'advance_requests'), '"advanced training" is not a salary advance');

    hindsight.recall = async () => { throw new Error('boom'); };
    outreach.clearMemoryCache();
    const r2 = await outreach.today({ now: NOW });
    assert.equal(r2.memory_source, 'unavailable');
    assert.equal(r2.calls[0].helper_id, 'radha', 'local records still rank the list');
  } finally {
    Object.assign(hindsight, orig);
    outreach.clearMemoryCache();
  }
});

test('learning: what works is aggregated across helpers by problem type, with a prior for helpers without history', () => {
  const transport = commitments.whatWorksAgency({ problemType: 'transport' });
  assert.equal(transport[0].approach, 'listen_first');
  assert.equal(transport[0].kept, 2);
  assert.equal(transport[0].helpers, 2);
  const table = commitments.agencyLearning();
  const t = table.by_problem.find(p => p.problem_type === 'transport');
  assert.match(t.takeaway, /For transport problems, listening first led to kept promises 2 of 2 times across 2 helpers/);
  assert.match(table.by_problem.find(p => p.problem_type === 'household_conflict').takeaway, /no approach has led to a kept promise yet/);

  // Fatima has no approach history; with an open transport promise the prior is the transport winner.
  const id = commitments.add({ helperId: 'fatima', text: 'Catch the 8:05 bus', problemType: 'transport' });
  const w = commitments.whatWorks('fatima');
  assert.equal(w.best, null);
  assert.deepEqual({ type: w.prior.problem_type, approach: w.prior.approach }, { type: 'transport', approach: 'listen_first' });
  commitments.resolve(id, 'replaced');
  // With no typed open promise, the prior falls back to the best approach overall.
  assert.equal(commitments.whatWorks('fatima').prior.problem_type, null);
});

test('learning: a finished call labels the new promise with its problem type and records the changed learning', async () => {
  const newId = commitments.add({ helperId: 'meena', text: 'Take the earlier metro on Mondays', approach: 'listen_first' });
  const old = commitments.add({ helperId: 'meena', text: 'Leave ten minutes earlier', approach: 'listen_first', problemType: 'transport' });
  commitments.resolve(old, 'kept', { evidence: 'on time all week' });
  hooks.emitCallSaved({ helper: { id: 'meena', name: 'Meena Joshi' }, transcript: [] }, {
    call_id: 'browser_test',
    outcome: { problem_type: 'transport', new_commitment_id: newId, commitment_checks: [{ id: old, status: 'kept' }] },
  });
  await new Promise(r => setImmediate(r));
  assert.equal(db.prepare('SELECT problem_type FROM commitments WHERE id = ?').get(newId).problem_type, 'transport');
  const state = db.prepare("SELECT kept, total FROM agency_learning_state WHERE key = 'transport:listen_first'").get();
  assert.deepEqual({ ...state }, { kept: 3, total: 3 });
  assert.match(outreach.learningFact('transport', { approach: 'listen_first', kept: 3, total: 3, helpers: 3 }, NOW), /^As of 2026-09-29, across the agency/);
  // Nothing changed, so nothing new to retain.
  assert.equal(outreach.retainLearning(['transport']).length, 0);
  // Unknown problem types are ignored.
  assert.equal(outreach.onCallSaved({ outcome: { problem_type: 'weather', new_commitment_id: newId, commitment_checks: [] } }).labelled, false);
});

test('outreach routes: today and learning answer, bad limits are refused', async () => {
  const srv = await startServer(createApp({ port: 0 }));
  try {
    const t = await srv.request('GET', '/api/outreach/today?memory=off');
    assert.equal(t.status, 200);
    assert.ok(Array.isArray(t.body.calls) && t.body.calls.length > 0);
    assert.ok(t.body.calls.every(c => c.reasons.every(r => r.source && r.text)));
    const bad = await srv.request('GET', '/api/outreach/today?limit=0');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'VALIDATION');
    const l = await srv.request('GET', '/api/outreach/learning');
    assert.equal(l.status, 200);
    assert.ok(l.body.by_problem.some(p => p.problem_type === 'family'));
  } finally { await srv.close(); }
});
