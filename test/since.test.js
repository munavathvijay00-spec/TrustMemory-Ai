require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const hindsight = require('../server/hindsight');
// Load the modules that create the tables "since" reads from.
require('../server/commitments');
require('../server/requests');
require('../server/record');
require('../server/care');
require('../server/auth-routes');
const { since, MAX_ITEMS } = require('../server/since');
const { startServer } = require('./support');
const { createApp } = require('../server/app');

const sql = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
const daysAgo = n => Date.now() - n * 86400000;
let seq = 0;
const id = p => p + (++seq);

function addCall(helperId, when, callId = id('browser_vs_')) {
  db.prepare("INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at) VALUES (?, ?, ?, 'coaching_call', 'completed', '[]', '{}', ?)")
    .run(id('call_'), helperId, callId, sql(when));
  return callId;
}
function addRequest(helperId, text, when) {
  db.prepare("INSERT INTO requests (id, role, person_id, kind, text, status, created_at) VALUES (?, 'helper', ?, 'leave', ?, 'open', ?)").run(id('req_'), helperId, text, sql(when));
}
function stubMemory(results) {
  const orig = { isConfigured: hindsight.isConfigured, recall: hindsight.recall };
  hindsight.isConfigured = () => true;
  hindsight.recall = async () => results;
  return () => Object.assign(hindsight, orig);
}

test('since: with no earlier call it says so and lists the latest things on record', async () => {
  addRequest('kavita', 'Going home for Bathukamma from the 9th', daysAgo(3));
  const r = await since('kavita');
  assert.equal(r.last_call, null);
  assert.match(r.summary, /No call with Kavita on record yet/);
  assert.ok(r.items.length >= 1 && r.items.length <= 5);
  assert.ok(r.items.some(i => /Bathukamma/.test(i.what)));
});

test('since: only things after the last call count, and the summary says how many', async () => {
  addRequest('meena', 'Old request before the call', daysAgo(20));
  addCall('meena', daysAgo(10));
  addRequest('meena', 'Need two days off for my son\'s exam', daysAgo(2));
  db.prepare('INSERT INTO record_corrections (id, helper_id, fact, correction, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id('cor_'), 'meena', 'She lives in Gachibowli', 'I moved to Kondapur last month', sql(daysAgo(1)));
  const restore = stubMemory([
    { text: 'Meena said her husband found a new job in Kondapur', type: 'world', mentionedAt: new Date(daysAgo(1)).toISOString(), documentId: 'request:x', tags: ['helper:meena'] },
    { text: 'Meena prefers cooking without onion for the Nair family', type: 'world', mentionedAt: new Date(daysAgo(30)).toISOString(), documentId: 'seed:helper:meena:3', tags: ['helper:meena'] },
    { text: 'Meena is reliable', type: 'observation', mentionedAt: new Date(daysAgo(1)).toISOString(), documentId: '', tags: ['helper:meena'] },
  ]);
  try {
    const r = await since('meena');
    assert.ok(r.last_call);
    const text = r.items.map(i => i.what).join(' | ');
    assert.match(text, /two days off/);
    assert.match(text, /moved to Kondapur/);
    assert.match(text, /new job in Kondapur/);
    assert.doesNotMatch(text, /Old request before the call/);
    assert.doesNotMatch(text, /without onion/, 'memories from before the last call are left out');
    assert.doesNotMatch(text, /is reliable/, 'observations are not "new things said"');
    assert.match(r.summary, new RegExp(`Since the last call on .+: ${r.items.length} new thing`));
    assert.equal(r.memory_source, 'hindsight');
    // Newest first.
    const times = r.items.map(i => Date.parse(i.when));
    assert.deepEqual(times, times.slice().sort((a, b) => b - a));
  } finally { restore(); }
});

test('since: safety notes are counted, never shown', async () => {
  addCall('sunita', daysAgo(15));
  db.prepare("INSERT INTO safety_signals (id, helper_id, household_id, call_id, kind, evidence, said_at, source, created_at) VALUES (?, 'sunita', NULL, 'c1', 'unpaid_pay', 'My salary is late again', ?, 'call', ?)")
    .run(id('sig_'), sql(daysAgo(1)).slice(0, 10), sql(daysAgo(1)));
  const restore = stubMemory([
    { text: 'On 2026-09-28 the agency raised a private safety check for Sunita. Her words: salary late', type: 'world', mentionedAt: new Date(daysAgo(1)).toISOString(), documentId: 'safety:flag_1', tags: ['helper:sunita', 'source:safety'] },
  ]);
  try {
    const r = await since('sunita');
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /salary/i, 'no safety content anywhere in the response');
    const note = r.items.find(i => i.private);
    assert.ok(note, 'a private safety note is counted');
    assert.match(note.what, /1 private safety note/);
  } finally { restore(); }
});

test('since: duplicates are merged and the list is capped', async () => {
  const last = addCall('fatima', daysAgo(40));
  for (let i = 0; i < 12; i++) addRequest('fatima', `Request number ${i} about the weekend schedule change`, daysAgo(30 - i));
  const restore = stubMemory([
    { text: 'Request number 11 about the weekend schedule change', type: 'world', mentionedAt: new Date(daysAgo(19)).toISOString(), documentId: 'request:dup', tags: ['helper:fatima'] },
    { text: 'Fatima said the last call went well', type: 'world', mentionedAt: new Date(daysAgo(40)).toISOString(), documentId: 'call:' + last + ':summary', tags: ['helper:fatima'] },
  ]);
  try {
    const r = await since('fatima');
    assert.equal(r.items.length, MAX_ITEMS);
    const texts = r.items.map(i => i.what);
    assert.equal(texts.filter(t => /Request number 11\b/.test(t)).length, 1, 'the same thing from memory and SQLite appears once');
    assert.ok(!texts.some(t => /last call went well/.test(t)), 'the last call\'s own documents are not "new"');
  } finally { restore(); }
});

test('since: the route validates the helper', async () => {
  const srv = await startServer(createApp({ port: 0 }));
  try {
    assert.equal((await srv.request('GET', '/api/since')).status, 400);
    assert.equal((await srv.request('GET', '/api/since?helper=nobody')).status, 404);
    const ok = await srv.request('GET', '/api/since?helper=radha');
    assert.equal(ok.status, 200);
    assert.ok(typeof ok.body.summary === 'string' && Array.isArray(ok.body.items));
  } finally { await srv.close(); }
});
