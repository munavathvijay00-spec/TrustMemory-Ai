const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const sides = require('../server/sides');
const hindsight = require('../server/hindsight');
const db = require('../server/db');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());
test.beforeEach(() => sides.clearCache());

const nowSql = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

test('sides: validates the household and the helper', async () => {
  assert.equal((await srv.request('GET', '/api/sides')).status, 400);
  assert.equal((await srv.request('GET', '/api/sides?household=h999')).status, 404);
  assert.equal((await srv.request('GET', '/api/sides?household=h105&helper=nobody')).status, 404);
  const notPlaced = await srv.request('GET', '/api/sides?household=h105&helper=meena');
  assert.equal(notPlaced.status, 400, 'only helpers placed at this household can be compared');
  assert.equal(notPlaced.body.code, 'VALIDATION');
});

test('sides: defaults to the current helper, then the most recent one', async () => {
  const current = await srv.request('GET', '/api/sides?household=h105');
  assert.equal(current.status, 200, current.text);
  assert.equal(current.body.helper_id, 'radha', 'Radha is placed with the Gupta family now');
  assert.deepEqual(current.body.helpers.map(h => h.id), ['radha', 'priya']);
  const recent = await srv.request('GET', '/api/sides?household=h104');
  assert.equal(recent.body.helper_id, 'fatima', 'the most recent of three ended placements');
});

test('sides: without Hindsight it compares local records, labelled, and leaves private data out', async () => {
  db.prepare('INSERT INTO household_feedback (id, household_id, helper_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('fb_sides_1', 'h105', 'radha', 3, 'She arrives at 8:20 most mornings, but we need her by 8.', nowSql());
  db.prepare('INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('call_sides_1', 'radha', 'c_sides_1', 'coaching_call', 'completed', '[]',
      JSON.stringify({ household_id: 'h105', memory_facts: ['On 2026-09-20 Radha said she can only leave home at 8:00 after the school drop.'] }), nowSql());
  db.prepare("INSERT INTO requests (id, role, person_id, kind, text, status, created_at) VALUES (?, 'helper', 'radha', 'pay_issue', ?, 'open', ?)")
    .run('req_sides_pay', 'My salary is late again this month.', nowSql());
  db.prepare("INSERT INTO safety_signals (id, helper_id, household_id, call_id, kind, evidence, said_at, source, created_at) VALUES (?, 'radha', 'h105', 'c_x', 'unpaid_pay', ?, '2026-09-21', 'call', ?)")
    .run('sig_sides_1', 'They shouted at me about the salary.', nowSql());

  const r = await srv.request('GET', '/api/sides?household=h105&helper=radha');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'local');
  assert.match(r.body.note, /local records/);
  const schedule = r.body.topics.find(t => t.topic === 'Schedule');
  assert.ok(schedule, 'both sides spoke about timings');
  assert.match(schedule.household.says, /8:20/);
  assert.match(schedule.helper.says, /school drop/);
  assert.equal(schedule.status, 'both');
  assert.ok(r.body.questions.length >= 1);
  const all = JSON.stringify(r.body);
  assert.doesNotMatch(all, /salary is late|shouted at me/, 'pay-issue reports and safety signals are never included');
});

test('sides: Hindsight results are lined up by topic, normalised, and exclude coordinator-only memory', async () => {
  const saved = { isConfigured: hindsight.isConfigured, recall: hindsight.recall, reflect: hindsight.reflect };
  const calls = [];
  hindsight.isConfigured = () => true;
  hindsight.recall = async (query, opts) => {
    calls.push({ kind: 'recall', opts });
    if (opts.tags[0] === 'household:h105') {
      return [
        { text: 'The Gupta family said Radha arrives flustered some mornings.', context: 'Feedback from the Gupta Residence reported to the agency coordinator about their helper.', tags: ['household:h105', 'helper:radha'], metadata: { kind: 'household' }, mentionedAt: '2026-09-16T10:00:00Z' },
        { text: 'Safety check raised for Radha about late pay.', context: 'Coordinator-only safety note written by the agency after a helper call.', tags: ['helper:radha', 'source:safety'], mentionedAt: '2026-09-20T10:00:00Z' },
      ];
    }
    return [
      { text: 'Radha said the school drop means she leaves home at 8:00.', context: 'Radha Kumari, a home-care helper, speaking to the agency coordinator on a call.', tags: ['helper:radha'], metadata: { kind: 'helperSaid' }, mentionedAt: '2026-09-18T10:00:00Z' },
      { text: 'Coaching call summary: late arrivals discussed.', context: 'Coordinator summary written by the agency after a coaching call.', tags: ['helper:radha', 'source:voice-call'], mentionedAt: '2026-09-18T10:00:00Z' },
    ];
  };
  hindsight.reflect = async (query, opts) => {
    calls.push({ kind: 'reflect', query, opts });
    return {
      text: '',
      structured: {
        topics: [
          { topic: 'Schedule', household: { says: 'She arrives flustered some mornings.', when: '2026-09-16' }, helper: { says: 'The school drop means she leaves at 8:00.', when: '2026-09-18' }, status: 'differ' },
          { topic: 'Pay', household: { says: 'Paid on time.', when: '2026-09-01' }, helper: { says: '', when: '' }, status: 'agree' },
          { topic: 'Respect', household: {}, helper: {}, status: 'differ' },
        ],
        questions: ['What start time works for both of you on school days?', ' ', 'How can mornings feel less rushed?'],
      },
      basedOn: { memories: [
        { text: 'Radha said the school drop means she leaves home at 8:00.', mentionedAt: '2026-09-18T10:00:00Z', tags: ['helper:radha'] },
        { text: 'Safety check raised for Radha about late pay.', mentionedAt: '2026-09-20T10:00:00Z', tags: ['source:safety'] },
      ] },
    };
  };
  try {
    const r = await sides.compare('h105', 'radha');
    assert.equal(r.source, 'hindsight');
    assert.equal(r.topics.length, 2, 'a topic where neither side spoke is dropped');
    assert.equal(r.topics[0].status, 'differ');
    assert.equal(r.topics[1].status, 'one_side', 'a topic with only one side cannot be "agree"');
    assert.deepEqual(r.questions, ['What start time works for both of you on school days?', 'How can mornings feel less rushed?']);
    assert.equal(r.based_on.length, 1, 'safety memory is not shown as evidence');
    const reflect = calls.find(c => c.kind === 'reflect');
    assert.match(reflect.query, /never decide who is right/);
    assert.deepEqual(reflect.opts.tags, ['household:h105', 'helper:radha']);
    assert.match(reflect.opts.context, /\[HOUSEHOLD 2026-09-16\] The Gupta family said Radha arrives flustered/);
    assert.match(reflect.opts.context, /\[HELPER 2026-09-18\] Radha said the school drop/);
    assert.doesNotMatch(reflect.opts.context, /Safety check|Coaching call summary/, 'coordinator-only memory never reaches the model');
    // Cached for ten minutes per pair.
    const again = await sides.compare('h105', 'radha');
    assert.equal(again.cached, true);
    assert.equal(calls.filter(c => c.kind === 'reflect').length, 1);
  } finally {
    Object.assign(hindsight, saved);
  }
});

test('sides: when reflect fails it falls back to local records instead of erroring', async () => {
  const saved = { isConfigured: hindsight.isConfigured, recall: hindsight.recall, reflect: hindsight.reflect };
  hindsight.isConfigured = () => true;
  hindsight.recall = async () => [];
  hindsight.reflect = async () => { throw new Error('upstream 502'); };
  try {
    const r = await sides.compare('h104', 'sunita');
    assert.equal(r.source, 'local');
    assert.equal(r.helper_name, 'Sunita Devi');
  } finally {
    Object.assign(hindsight, saved);
  }
});
