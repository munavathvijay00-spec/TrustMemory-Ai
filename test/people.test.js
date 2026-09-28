const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());

test('people: a new helper is saved and comes back in the roster', async () => {
  const r = await srv.request('POST', '/api/helpers', { body: {
    name: 'Saroja Devi', location: 'Ameerpet', experience_years: 4, skills: ['cooking', 'cleaning'], availability: 'Part-time',
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.id, 'sarojadevi');
  assert.deepEqual(r.body.skills, ['cooking', 'cleaning']);
  const list = await srv.request('GET', '/api/helpers');
  assert.ok(list.body.some(h => h.id === 'sarojadevi' && h.location === 'Ameerpet'));
  const dup = await srv.request('POST', '/api/helpers', { body: { name: 'saroja devi', location: 'X Y', experience_years: 1, skills: ['cooking'] } });
  assert.equal(dup.status, 400, 'names are unique regardless of case');
});

test('people: invalid helper input is refused with a readable reason', async () => {
  const bad = [
    { name: 'A', location: 'Ameerpet', experience_years: 2, skills: ['cooking'] },
    { name: 'R2D2', location: 'Ameerpet', experience_years: 2, skills: ['cooking'] },
    { name: 'Valid Name', location: 'Ameerpet', experience_years: 99, skills: ['cooking'] },
    { name: 'Valid Name', location: 'Ameerpet', experience_years: 2, skills: ['gardening'] },
  ];
  for (const body of bad) {
    const r = await srv.request('POST', '/api/helpers', { body });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'VALIDATION');
    assert.ok(r.body.error.length > 5);
  }
});

test('people: a new household is saved with its need and schedule', async () => {
  const r = await srv.request('POST', '/api/households', { body: {
    name: 'Menon Residence', location: 'Tarnaka', requirement: 'elder_care', schedule: 'Weekdays 8am-4pm',
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.need, 'elder_care');
  const list = await srv.request('GET', '/api/households');
  assert.ok(list.body.some(h => h.id === r.body.id && h.schedule === 'Weekdays 8am-4pm'));
  const bad = await srv.request('POST', '/api/households', { body: { name: 'Other Home', location: 'Tarnaka', requirement: 'driving', schedule: 'Any' } });
  assert.equal(bad.status, 400);
});
