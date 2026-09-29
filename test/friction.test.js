const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const friction = require('../server/friction');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());
test.beforeEach(() => friction.clearCache());

test('friction: helper and household are required and must exist', async () => {
  assert.equal((await srv.request('GET', '/api/friction?helper=radha')).status, 400);
  assert.equal((await srv.request('GET', '/api/friction?helper=nobody&household=h105')).status, 404);
  assert.equal((await srv.request('GET', '/api/friction?helper=radha&household=h999')).status, 404);
});

test('friction: without Hindsight the check compares the local profiles and says so', async () => {
  const r = await srv.request('GET', '/api/friction?helper=lakshmi&household=h104');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'local');
  assert.match(r.body.note, /local records/);
  // Lakshmi lists cleaning only; the Iyer Residence needs child care.
  assert.ok(r.body.points.some(p => /child care/.test(p.household_fact)), JSON.stringify(r.body.points));
  assert.deepEqual(r.body.based_on, []);
});

test('friction: reflect output is mapped to dated points and used memories, and cached', async () => {
  let reflectCalls = 0;
  let reflectOpts = null;
  const hs = {
    isConfigured: () => true,
    recall: async (q, { tags }) => (tags[0].startsWith('helper:')
      ? [{ text: 'Radha must leave home after 8:00 for the school run.', mentionedAt: '2026-08-25T04:30:00Z', tags }]
      : [{ text: 'The Guptas expect the helper at 7:45 on weekdays.', mentionedAt: '2026-09-10T04:30:00Z', tags }]),
    reflect: async (query, opts) => {
      reflectCalls += 1;
      reflectOpts = opts;
      return {
        text: '',
        structured: {
          summary: 'One clash about the start time.',
          points: [
            { helper_fact: 'She leaves after 8:00 for the school run.', helper_date: '2026-08-25', household_fact: 'They expect her at 7:45.', household_date: '2026-09-10', clash: 'The start time is earlier than she can arrive.', fix: 'Agree an 8:15 start before day one.' },
            { helper_fact: '', household_fact: 'x', clash: 'incomplete point is dropped' },
          ],
        },
        basedOn: { memories: [{ text: 'Radha must leave home after 8:00 | extra', mentionedAt: '2026-08-25T04:30:00Z', tags: ['helper:radha'] }] },
      };
    },
  };
  const a = await friction.check('radha', 'h105', { hs });
  assert.equal(a.source, 'hindsight');
  assert.equal(a.cached, false);
  assert.equal(a.points.length, 1);
  assert.equal(a.points[0].helper_date, '2026-08-25');
  assert.match(a.points[0].fix, /8:15/);
  assert.deepEqual(a.based_on, [{ text: 'Radha must leave home after 8:00', when: '2026-08-25', tags: ['helper:radha'] }]);
  assert.deepEqual(reflectOpts.tags, ['helper:radha', 'household:h105']);
  assert.equal(reflectOpts.tagsMatch, 'any');
  assert.match(reflectOpts.context, /2026-09-10\) The Guptas expect/);
  const b = await friction.check('radha', 'h105', { hs });
  assert.equal(b.cached, true);
  assert.equal(reflectCalls, 1, 'the second check is served from the cache');
});

test('friction: a Hindsight failure falls back to local records with the reason', async () => {
  const hs = { isConfigured: () => true, recall: async () => { throw new Error('gateway timeout'); }, reflect: async () => ({}) };
  const r = await friction.check('radha', 'h105', { hs });
  assert.equal(r.source, 'local');
  assert.match(r.note, /could not be reached \(gateway timeout\)/);
  const again = await friction.check('radha', 'h105', { hs });
  assert.equal(again.cached, false, 'a failure is not cached, so the next check tries Hindsight again');
});

test('friction: when reflect names no memories, the recalled facts from both records are shown', async () => {
  const hs = {
    isConfigured: () => true,
    recall: async (q, { tags }) => [{ text: tags[0] + ' fact', mentionedAt: '2026-09-01T00:00:00Z', tags }],
    reflect: async () => ({ structured: { summary: 'No clear friction on record.', points: [] }, basedOn: { memories: [] } }),
  };
  const r = await friction.check('anita', 'h107', { hs });
  assert.equal(r.points.length, 0);
  assert.deepEqual(r.based_on.map(b => b.text), ['helper:anita fact', 'household:h107 fact']);
});
