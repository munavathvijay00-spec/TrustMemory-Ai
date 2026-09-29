const { startServer } = require('./support');
process.env.HINDSIGHT_API_KEY = 'test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

const OBS = 'aaaaaaaa-2222-4333-8444-555555555555';
const FACT = 'bbbbbbbb-2222-4333-8444-555555555555';

test('observation history: earlier versions oldest first, with only the new facts that revised each', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.endsWith('/memories/' + OBS)) return new Response(JSON.stringify({ id: OBS, fact_type: 'observation', text: 'Salary is late repeatedly. | Involving: Lakshmi', proof_count: 3, mentioned_at: '2026-07-16' }), { status: 200 });
    if (url.endsWith('/memories/' + OBS + '/history')) {
      return new Response(JSON.stringify([
        { previous_text: 'Salary was late twice.', previous_mentioned_at: '2026-08-30', changed_at: '2026-09-28T10:00:00Z', source_facts: [{ text: 'Salary late again. | When: 2026-09-28', is_new: true }, { text: 'Old fact', is_new: false }] },
        { previous_text: 'Salary was late once.', previous_mentioned_at: '2026-07-16', changed_at: '2026-08-30T10:00:00Z', source_facts: [{ text: 'Salary late this month.', is_new: true }] },
      ]), { status: 200 });
    }
    if (url.endsWith('/memories/' + FACT)) return new Response(JSON.stringify({ id: FACT, fact_type: 'world', text: 'x' }), { status: 200 });
    throw new Error('unexpected ' + url);
  };
  const srv = await startServer(createApp({ port: 0 }));
  try {
    const r = await srv.request('GET', `/api/memory/observations/${OBS}/history`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.current.text, 'Salary is late repeatedly.');
    assert.equal(r.body.current.proof_count, 3);
    assert.deepEqual(r.body.steps.map(s => s.text), ['Salary was late once.', 'Salary was late twice.']);
    assert.deepEqual(r.body.steps[1].added, ['Salary late again.']);
    assert.equal((await srv.request('GET', `/api/memory/observations/${FACT}/history`)).status, 400, 'raw facts have no history');
    assert.equal((await srv.request('GET', '/api/memory/observations/not-an-id/history')).status, 400);
  } finally {
    global.fetch = realFetch;
    await srv.close();
  }
});
