const { startServer } = require('./support');
// Hindsight "configured" (the fetch stub still refuses the network), so retains land in the queue
// and forget has to go through the memory bank first.
process.env.HINDSIGHT_API_KEY = 'test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const auth = require('../server/auth');
const db = require('../server/db');
const record = require('../server/record');
const retainQueue = require('../server/retain-queue');
const { recallForHelper } = require('../server/voice/recall');
const { buildSystemPrompt } = require('../server/voice/prompt');

const PASS = { coordinator: 'Coordinator2026', helper: 'RadhaLine2026', household: 'GuptaHome2026' };
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().replace('T', ' ').slice(0, 19);

test('record: only memories from her own words are shown to her', () => {
  const keep = [
    { documentId: 'call:browser_vs_1:transcript', type: 'world', tags: ['helper:radha'] },
    { documentId: 'seed:helper:radha:3', type: 'world', metadata: { kind: 'helperSaid' } },
    { documentId: 'request:req_1', type: 'world', tags: ['helper:radha', 'source:self_report'] },
    { documentId: 'correction:corr_1', type: 'world', tags: ['helper:radha', 'source:helper_correction'] },
  ];
  const drop = [
    { documentId: 'call:browser_vs_1:summary', type: 'world' },
    { documentId: 'seed:helper:radha:4', type: 'world', metadata: { kind: 'callNote' } },
    { documentId: 'seed:helper:radha:7', type: 'world', metadata: { kind: 'household' } },
    { documentId: 'safety:flag_1', type: 'world', tags: ['helper:radha', 'source:safety'] },
    { documentId: 'feedback:fb_1', type: 'world' },
    { documentId: 'note:n_1', type: 'world' },
    { documentId: '', type: 'observation', tags: ['helper:radha'] },
  ];
  for (const f of keep) assert.equal(record.isHerWords(f), true, f.documentId);
  for (const f of drop) assert.equal(record.isHerWords(f), false, f.documentId || f.type);
});

test('record: temporary circumstances older than 30 days are marked outdated, lasting facts are not', () => {
  const facts = record.markExpired([
    { text: 'On 2026-08-01 Anita said she was unwell with fever.', mentionedAt: daysAgo(40) },
    { text: 'Radha said she went home to her village for the festival.', mentionedAt: daysAgo(45) },
    { text: "Radha's daughter's school starts at 8:00.", mentionedAt: daysAgo(40) },
    { text: 'She said she was unwell this week.', mentionedAt: daysAgo(5) },
  ]);
  assert.deepEqual(facts.map(f => Boolean(f.outdated)), [true, true, false, false]);
});

test('record: a correction is validated, stored, queued for Hindsight and put first in recall', async () => {
  assert.throws(() => record.correct('radha', { correction: 'no' }), /3 to 400/);
  assert.throws(() => record.correct('nobody', { correction: 'That is not right.' }), /Unknown helper/);
  const queued = retainQueue.pendingCount();
  const row = record.correct('radha', { fact: 'Radha takes the 7:40 bus.', correction: 'I take the 7:20 bus now, not the 7:40 one.' });
  assert.equal(db.prepare('SELECT correction FROM record_corrections WHERE id = ?').get(row.id).correction, 'I take the 7:20 bus now, not the 7:40 one.');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(retainQueue.pendingCount(), queued + 1, 'the retain failed on the stubbed network and was queued');
  const job = JSON.parse(db.prepare("SELECT payload FROM retain_jobs WHERE call_id = 'correction' ORDER BY rowid DESC LIMIT 1").get().payload)[0];
  assert.deepEqual(job.tags.sort(), ['helper:radha', 'source:helper_correction']);

  const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get('radha');
  const mem = await recallForHelper(helper);
  assert.equal(mem.facts[0].origin, 'correction');
  assert.match(mem.facts[0].text, /7:20 bus/);

  const prompt = buildSystemPrompt({
    helper: Object.assign({ role: 'child_care', experience_years: 7 }, helper), household: null, scenario: 'coaching_call', lateCount: 1,
    memory: { source: 'local', facts: [mem.facts[0], { text: 'She said she was unwell.', mentionedAt: daysAgo(40), outdated: true }] },
    priorCalls: [], ledger: null,
  });
  assert.match(prompt, /\(her correction\)/);
  assert.match(prompt, /may be outdated/);
});

test('record: forget needs her exact name, deletes her memory documents and local rows, and anonymises her', async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    calls.push((opts.method || 'GET') + ' ' + url);
    if (/\/documents\?/.test(url)) {
      return new Response(JSON.stringify({ items: [
        { id: 'call:x:transcript', tags: ['helper:kavita', 'source:voice-call'] },
        { id: 'request:r1', tags: ['helper:kavita', 'source:self_report'] },
        { id: 'seed:helper:anita:1', tags: ['helper:anita'] },
      ] }), { status: 200 });
    }
    if (opts.method === 'DELETE') return new Response('{}', { status: 200 });
    throw new Error('unexpected ' + url);
  };
  try {
    record.correct('kavita', { correction: 'I work mornings only now.' });
    db.prepare("INSERT INTO memories (id, helper_id, household_id, network, content, created_at) VALUES ('mk1', 'kavita', NULL, 'world', 'Kavita said X', '2026-09-01 10:00:00')").run();
    await assert.rejects(record.forget('kavita', 'Kavita'), /full name/);
    const out = await record.forget('kavita', '  kavita   REDDY ');
    assert.equal(out.documents, 2, 'only her two documents are deleted, not another helper\'s');
    assert.ok(calls.some(c => c.startsWith('DELETE') && c.includes('call%3Ax%3Atranscript')));
    assert.ok(!calls.some(c => c.startsWith('DELETE') && c.includes('anita')));
    assert.ok(calls.some(c => c.startsWith('DELETE') && c.includes('/mental-models/coach-kavita')));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories WHERE helper_id = 'kavita'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM record_corrections WHERE helper_id = 'kavita'").get().n, 0);
    assert.equal(db.prepare("SELECT name FROM helpers WHERE id = 'kavita'").get().name, 'Forgotten helper');
  } finally {
    global.fetch = realFetch;
  }
  // Memory bank unreachable: nothing is deleted, and the coordinator is told to retry.
  const before = db.prepare("SELECT COUNT(*) AS n FROM commitments WHERE helper_id = 'fatima'").get().n;
  await assert.rejects(record.forget('fatima', 'Fatima Sheikh'), /nothing was deleted/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commitments WHERE helper_id = 'fatima'").get().n, before);
  assert.notEqual(db.prepare("SELECT name FROM helpers WHERE id = 'fatima'").get().name, 'Forgotten helper');
});

test('record: a helper sees her own record but cannot forget anyone', async () => {
  auth.seedDemoAccounts({ DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper, DEMO_HOUSEHOLD_PASSWORD: PASS.household });
  const srv = await startServer(createApp({ port: 0, auth: true, seedDemo: false }));
  try {
    const login = async (email, password) => {
      const r = await srv.request('POST', '/api/auth/login', { body: { email, password } });
      assert.equal(r.status, 200, r.text);
      return { headers: { Cookie: [].concat(r.headers['set-cookie'])[0].split(';')[0] } };
    };
    const radha = await login('radha@trustmemory.demo', PASS.helper);
    const mine = await srv.request('GET', '/api/me/record', radha);
    assert.equal(mine.status, 200, mine.text);
    assert.equal(mine.body.helper.id, 'radha');
    assert.equal((await srv.request('POST', '/api/me/record/correction', { body: { correction: 'x' }, ...radha })).status, 400);
    assert.equal((await srv.request('POST', '/api/record/radha/forget', { body: { confirm_name: 'Radha Kumari' }, ...radha })).status, 403);
    const gupta = await login('gupta@trustmemory.demo', PASS.household);
    assert.equal((await srv.request('GET', '/api/me/record', gupta)).status, 403, 'households have no helper record');
  } finally {
    await srv.close();
  }
});

test('record: the coordinator can retire the fact she corrected, restore it, or keep both', async () => {
  const MID = '11111111-2222-4333-8444-555555555555';
  const OTHER = '99999999-2222-4333-8444-555555555555';
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ method, url, body: opts.body ? JSON.parse(opts.body) : null });
    if (method === 'GET' && url.endsWith('/memories/' + MID)) return new Response(JSON.stringify({ id: MID, fact_type: 'world', tags: ['helper:meena'] }), { status: 200 });
    if (method === 'GET' && url.endsWith('/memories/' + OTHER)) return new Response(JSON.stringify({ id: OTHER, fact_type: 'world', tags: ['helper:anita'] }), { status: 200 });
    if (method === 'PATCH') return new Response('{}', { status: 200 });
    if (method === 'POST' && url.endsWith('/memories')) return new Response('{}', { status: 200 });
    throw new Error('unexpected ' + method + ' ' + url);
  };
  try {
    const c = record.correct('meena', { fact: 'Meena wants to leave the Nair home.', correction: 'I want to stay with the Nairs.', memory_id: MID });
    assert.equal(c.memory_id, MID);
    assert.equal(c.status, 'pending');
    assert.equal(record.correct('meena', { correction: 'Something else.', memory_id: 'not-an-id' }).memory_id, null, 'junk ids are not stored');

    const retired = await record.retire(c.id);
    assert.equal(retired.status, 'retired');
    const patch = calls.find(x => x.method === 'PATCH');
    assert.ok(patch.url.endsWith('/memories/' + MID));
    assert.equal(patch.body.state, 'invalidated');
    assert.match(patch.body.reason, /I want to stay with the Nairs/);
    await assert.rejects(Promise.resolve().then(() => record.keep(c.id)), /Restore the fact first/);

    const restored = await record.restore(c.id);
    assert.equal(restored.status, 'restored');
    assert.equal(calls.filter(x => x.method === 'PATCH').pop().body.state, 'valid');

    // Someone else's memory, or no memory at all, cannot be retired through her correction.
    const wrong = record.correct('meena', { correction: 'That is not mine.', memory_id: OTHER });
    await assert.rejects(record.retire(wrong.id), /not one of her own facts/);
    const unlinked = record.correct('meena', { correction: 'No link here.' });
    await assert.rejects(record.retire(unlinked.id), /not linked to a stored memory/);
    assert.equal(record.keep(unlinked.id).status, 'kept');
    assert.equal(calls.filter(x => x.method === 'PATCH').length, 2, 'only the two real curation calls reached Hindsight');
  } finally {
    global.fetch = realFetch;
  }
});

test('record: only the coordinator reviews corrections', async () => {
  auth.seedDemoAccounts({ DEMO_COORDINATOR_PASSWORD: PASS.coordinator, DEMO_HELPER_PASSWORD: PASS.helper, DEMO_HOUSEHOLD_PASSWORD: PASS.household });
  const srv = await startServer(createApp({ port: 0, auth: true, seedDemo: false }));
  try {
    const login = async (email, password) => {
      const r = await srv.request('POST', '/api/auth/login', { body: { email, password } });
      assert.equal(r.status, 200, r.text);
      return { headers: { Cookie: [].concat(r.headers['set-cookie'])[0].split(';')[0] } };
    };
    const radha = await login('radha@trustmemory.demo', PASS.helper);
    assert.equal((await srv.request('GET', '/api/record/radha/corrections', radha)).status, 403);
    assert.equal((await srv.request('POST', '/api/record/corrections/x/retire', radha)).status, 403);
    const coord = await login('coordinator@trustmemory.demo', PASS.coordinator);
    const list = await srv.request('GET', '/api/record/radha/corrections', coord);
    assert.equal(list.status, 200, list.text);
    assert.ok(Array.isArray(list.body.corrections));
    assert.equal((await srv.request('POST', '/api/record/corrections/nope/retire', coord)).status, 404);
    assert.equal((await srv.request('POST', '/api/record/corrections/nope/delete', coord)).status, 404);
  } finally {
    await srv.close();
  }
});
