/**
 * End-to-end call flow over HTTP: session -> ring -> incoming -> answer -> turn -> hangup -> complete.
 * Groq and Hindsight are both mocked at the network edge (globalThis.fetch), so the real
 * server code runs unchanged: prompt building, citations, outcome extraction, the Decision
 * Agent, the background retain and the retry queue.
 */
require('./support');
const { startServer } = require('./support');

// Configure both integrations with fake keys BEFORE the server modules read the environment.
process.env.GROQ_API_KEYS = 'gsk_test_key_0001';
process.env.HINDSIGHT_API_KEY = 'hs_test_key';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const retainQueue = require('../server/retain-queue');
const { createApp } = require('../server/app');

/* ------------------------------------------------------------------ fetch mock */

const net = { groq: [], hindsight: [], retainFails: false };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const OUTCOME = {
  sentiment: 'cooperative',
  root_cause: 'Her daughter started a new school with an earlier bell.',
  specific_commitment: 'Leave home at 7:15 and ask her neighbour to do the school drop.',
  notification_commitment: true,
  follow_up_days: 14,
  escalation_required: false,
  call_completed: true,
  coordinator_note: 'Radha said the new school timing made her late and agreed to leave at 7:15.',
  memory_facts: ['Radha said her daughter moved to a school with an earlier bell.'],
};

global.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  if (u.startsWith('https://api.groq.com/')) {
    net.groq.push(body);
    if (body.response_format && body.response_format.type === 'json_object') {
      return json({ choices: [{ message: { content: JSON.stringify(OUTCOME) }, finish_reason: 'stop' }] });
    }
    const isOpening = body.messages.length === 2;
    const content = isOpening
      ? 'Namaste Radha, this is the agency calling. Last time you said the school bus leaves early, is now an okay time? [m1]'
      : 'Thank you for telling me about the new school. Could you message the household if you are more than ten minutes late?';
    return json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
  }
  if (u.includes('/v1/default/banks/')) {
    const path = u.split('/banks/')[1].split('/').slice(1).join('/');
    net.hindsight.push({ method: init.method || 'GET', path, body });
    if (path === 'memories/recall') {
      return json({ results: [
        { id: 'f1', text: 'Radha takes the school bus route past Secunderabad every morning | When: 2026-08-01', type: 'world', mentioned_at: '2026-08-01', document_id: 'seed:radha' },
        { id: 'f2', text: 'Radha agreed to message the household before any delay', type: 'experience', mentioned_at: '2026-09-01', document_id: 'call:browser_vs_old:summary' },
      ] });
    }
    if (path.startsWith('mental-models/')) return json({ name: 'Coaching profile', content: 'Responds well to practical plans.', updated_at: '2026-09-01' });
    if (path === 'memories') return net.retainFails ? json({ detail: 'upstream unavailable' }, 503) : json({ items_count: body.items.length });
    return json({}, 404);
  }
  throw new Error('Unexpected network call in test: ' + u);
};

/* ------------------------------------------------------------------ helpers */

let srv;
// No rate limiter here: the flow makes more voice requests than one client may in a minute.
test.before(async () => { srv = await startServer(createApp({ port: 0, rateLimit: (req, res, next) => next() })); });
test.after(async () => { await srv.close(); });

async function post(path, body) { return srv.request('POST', path, { body }); }

async function connectedCall(helperId = 'radha') {
  const start = await post('/api/voice/session', { helper_id: helperId, scenario: 'coaching_call', late_count: 2 });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const id = start.body.session_id;
  assert.equal((await post('/api/voice/ring', { session_id: id })).status, 200);
  const inc = await srv.request('GET', '/api/voice/incoming?helper=' + helperId);
  assert.equal(inc.body.call.session_id, id);
  const ans = await post('/api/voice/answer', { session_id: id, accept: true });
  assert.equal(ans.body.call_state, 'connected');
  return { id, start: start.body };
}

async function waitForRetain(id) {
  for (let i = 0; i < 100; i++) {
    const r = await srv.request('GET', '/api/voice/session/' + id);
    if (r.body.result && r.body.result.retain.status !== 'saving') return r.body.result.retain;
    await new Promise(res => setImmediate(res));
  }
  throw new Error('retain never settled');
}

/* ------------------------------------------------------------------ tests */

test('call flow: recall before the first word, cited opening, turn, hangup, one saved record, churn applied once', async () => {
  const churnBefore = db.prepare('SELECT churn FROM helpers WHERE id = ?').get('radha').churn;
  const { id, start } = await connectedCall('radha');

  // Memory was recalled from Hindsight, scoped by tag, before the opening line was generated.
  const firstRecall = net.hindsight.find(h => h.path === 'memories/recall');
  assert.deepEqual(firstRecall.body.tags, ['helper:radha']);
  assert.equal(start.memory.source, 'hindsight');
  assert.equal(start.memory.facts[0].tag, 'm1');
  assert.equal(start.memory.mental_model.content, 'Responds well to practical plans.');
  assert.match(net.groq[0].messages[0].content, /\[m1\] Radha takes the school bus route/);
  assert.doesNotMatch(start.greeting, /\[m1\]/, 'citation tags are stripped before the line is spoken');

  const recallsBefore = net.hindsight.filter(h => h.path === 'memories/recall').length;
  const t = await post('/api/voice/turn', { session_id: id, text: 'My daughter moved to a new school and the bell is earlier now' });
  assert.equal(t.status, 200);
  assert.match(t.body.reply, /new school/);
  const turnRecall = net.hindsight.filter(h => h.path === 'memories/recall')[recallsBefore];
  assert.ok(turnRecall, 'recall runs again on the turn');
  assert.equal(turnRecall.body.query, 'My daughter moved to a new school and the bell is earlier now', 'her latest sentence is the query');

  assert.equal((await post('/api/voice/hangup', { session_id: id, by: 'helper' })).body.call_state, 'ended');

  // Three completes at once (double-click, console and phone both saving) produce one record.
  const results = await Promise.all([1, 2, 3].map(() => post('/api/voice/complete', { session_id: id })));
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(new Set(results.map(r => r.body.call_id)).size, 1);
  const out = results[0].body;
  assert.equal(out.outcome.specific_commitment, OUTCOME.specific_commitment);
  assert.deepEqual(out.learned, OUTCOME.memory_facts);
  assert.equal(out.used[0].tag, 'm1', 'the fact cited in the opening is reported as used');
  assert.equal(out.profile_before.content, 'Responds well to practical plans.');

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calls WHERE helper_id = ?').get('radha').n, 1);
  const opinions = db.prepare("SELECT COUNT(*) AS n FROM memories WHERE helper_id = ? AND content LIKE 'Churn risk recalculated%'").get('radha').n;
  assert.equal(opinions, 1);
  const churnAfter = db.prepare('SELECT churn FROM helpers WHERE id = ?').get('radha').churn;
  assert.equal(out.decision.old_churn, churnBefore);
  assert.equal(churnAfter, Math.max(0, Math.min(100, churnBefore + out.decision.delta)));

  // The background retain reaches Hindsight with the helper's tag and the call's document ids.
  assert.equal((await waitForRetain(id)).status, 'ok');
  const retained = net.hindsight.find(h => h.path === 'memories' && h.method === 'POST');
  assert.deepEqual(retained.body.items.map(i => i.document_id), [`call:${out.call_id}:transcript`, `call:${out.call_id}:summary`]);
  assert.ok(retained.body.items.every(i => i.tags.includes('helper:radha')));
  assert.match(retained.body.items[1].content, /committed to: Leave home at 7:15/);

  // A repeat complete after the save returns the same result instead of saving again.
  const again = await post('/api/voice/complete', { session_id: id });
  assert.equal(again.body.call_id, out.call_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calls WHERE helper_id = ?').get('radha').n, 1);
});

test('call flow: a turn after hang-up is refused with 409', async () => {
  const { id } = await connectedCall('anita');
  await post('/api/voice/hangup', { session_id: id, by: 'coordinator' });
  const r = await post('/api/voice/turn', { session_id: id, text: 'Hello, are you still there?' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /ended/);
});

test('call flow: an unanswered ring becomes missed after the timeout', async () => {
  const start = await post('/api/voice/session', { helper_id: 'meena' });
  const id = start.body.session_id;
  await post('/api/voice/ring', { session_id: id });
  assert.equal((await srv.request('GET', '/api/voice/session/' + id)).body.call_state, 'ringing');

  const realNow = Date.now;
  const later = realNow() + 61 * 1000;
  Date.now = () => later;
  try {
    assert.deepEqual((await srv.request('GET', '/api/voice/incoming?helper=meena')).body, { call: null });
    assert.equal((await srv.request('GET', '/api/voice/session/' + id)).body.call_state, 'missed');
    const late = await post('/api/voice/answer', { session_id: id, accept: true });
    assert.equal(late.status, 409);
  } finally { Date.now = realNow; }
  assert.ok(db.prepare("SELECT 1 FROM activity WHERE text LIKE '%Meena Joshi did not answer%'").get());
});

test('call flow: when Hindsight rejects the retain, the call is saved locally and queued for retry', async () => {
  const pendingBefore = retainQueue.pendingCount();
  net.retainFails = true;
  try {
    const { id } = await connectedCall('priya');
    await post('/api/voice/turn', { session_id: id, text: 'The bus was late twice because of road work' });
    await post('/api/voice/hangup', { session_id: id });
    const done = await post('/api/voice/complete', { session_id: id });
    assert.equal(done.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calls WHERE helper_id = ?').get('priya').n, 1, 'saved locally first');

    const retain = await waitForRetain(id);
    assert.equal(retain.status, 'queued');
    assert.match(retain.detail, /503/);
    assert.equal(retainQueue.pendingCount(), pendingBefore + 1);
    const job = db.prepare("SELECT * FROM retain_jobs WHERE call_id = ?").get(done.body.call_id);
    assert.equal(job.status, 'pending');
    assert.equal(JSON.parse(job.payload).length, 2);
  } finally { net.retainFails = false; }
});
