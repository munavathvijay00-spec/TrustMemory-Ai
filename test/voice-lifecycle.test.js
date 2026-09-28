/**
 * Voice session lifecycle: step timings (trace), restart safety (SQLite-persisted sessions are
 * restored) and graceful shutdown (pending retains are handed to the retry queue).
 * Groq and Hindsight are mocked at the network edge, as in call-flow.test.js.
 */
require('./support');
const { startServer } = require('./support');

process.env.GROQ_API_KEYS = 'gsk_test_key_0001';
process.env.HINDSIGHT_API_KEY = 'hs_test_key';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const agent = require('../server/voice-agent');
const store = require('../server/voice/session-store');
const inflight = require('../server/voice/inflight');
const { createShutdown } = require('../server/shutdown');
const { record, TRACE_CAP } = require('../server/voice/trace');
const { createApp } = require('../server/app');

/* ------------------------------------------------------------------ fetch mock */

// retainMode: 'ok' answers at once, 'hang' holds the retain until release() is called.
const net = { retainMode: 'ok', release: null };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

global.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  if (u.startsWith('https://api.groq.com/')) {
    if (body.response_format && body.response_format.type === 'json_object') {
      return json({ choices: [{ message: { content: JSON.stringify({ sentiment: 'cooperative', coordinator_note: 'She agreed to leave earlier.', specific_commitment: 'Leave at 7:00.', memory_facts: [] }) }, finish_reason: 'stop' }] });
    }
    const content = body.messages.length === 2
      ? 'Namaste, this is the agency calling. Is now an okay time? [m1]'
      : 'Thank you for telling me. Could you message the household if you are late?';
    return json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
  }
  if (u.includes('/v1/default/banks/')) {
    const path = u.split('/banks/')[1].split('/').slice(1).join('/');
    if (path === 'memories/recall') {
      return json({ results: [
        { id: 'f1', text: 'She takes the early bus past the market every morning', type: 'world', mentioned_at: '2026-08-01', document_id: 'seed:x' },
        { id: 'f2', text: 'She agreed to message the household before any delay', type: 'experience', mentioned_at: '2026-09-01', document_id: 'call:old:summary' },
      ] });
    }
    if (path.startsWith('mental-models/')) return json({ name: 'Coaching profile', content: 'Practical plans work.', updated_at: '2026-09-01' });
    if (path === 'memories') {
      if (net.retainMode === 'hang') return new Promise(resolve => { net.release = () => resolve(json({ detail: 'gone' }, 503)); });
      return json({ items_count: body.items.length });
    }
    return json({}, 404);
  }
  throw new Error('Unexpected network call in test: ' + u);
};

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0, rateLimit: (req, res, next) => next() })); });
test.after(async () => { await srv.close(); });

const post = (path, body) => srv.request('POST', path, { body });
const steps = trace => trace.map(e => e.step);

/* ------------------------------------------------------------------ tests */

test('trace: start, turn and complete record step timings; the retain entry lands when it settles', async () => {
  const start = await post('/api/voice/session', { helper_id: 'radha' });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const id = start.body.session_id;
  for (const step of ['recall', 'mental_model', 'ledger', 'llm_greeting']) assert.ok(steps(start.body.trace).includes(step), step);
  const recall = start.body.trace.find(e => e.step === 'recall');
  assert.equal(recall.ok, true);
  assert.equal(recall.detail, '2 facts');
  assert.equal(typeof recall.ms, 'number');
  assert.equal(start.body.trace.find(e => e.step === 'llm_greeting').detail, undefined, 'no model reported, so no detail');

  const t = await post('/api/voice/turn', { session_id: id, text: 'The early bus was late again this week' });
  assert.equal(t.status, 200);
  assert.deepEqual(steps(t.body.trace).slice(0, 2), ['turn_recall', 'llm_reply']);
  assert.equal(t.body.trace[0].detail, '2 hits');

  const done = await post('/api/voice/complete', { session_id: id });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  for (const step of ['extract', 'save_local', 'decision']) assert.ok(steps(done.body.trace).includes(step), step);

  let view;
  for (let i = 0; i < 100; i++) {
    view = (await srv.request('GET', '/api/voice/session/' + id)).body;
    if (view.result.retain.status !== 'saving') break;
    await new Promise(r => setImmediate(r));
  }
  const retain = view.trace.find(e => e.step === 'retain');
  assert.equal(retain.ok, true);
  assert.equal(retain.detail, '2 items');
  assert.ok(view.result.trace.some(e => e.step === 'retain'), 'the completion trace gets the retain entry too');
  assert.ok(steps(view.trace).indexOf('llm_greeting') < steps(view.trace).indexOf('turn_recall'));
});

test('trace: record caps the session trace at 60 entries', () => {
  const trace = [];
  for (let i = 0; i < TRACE_CAP + 5; i++) record(trace, 's' + i, Date.now(), true);
  assert.equal(trace.length, TRACE_CAP);
  assert.equal(trace[0].step, 's5');
});

test('restart: a live session is persisted, restored after a restart, and removed once completed', async () => {
  const start = await agent.startSession({ helperId: 'anita' });
  const id = start.session_id;
  agent.ring(id);
  agent.answer(id, true);
  const row = () => db.prepare('SELECT * FROM voice_sessions WHERE id = ?').get(id);
  assert.ok(row(), 'persisted on start');
  assert.equal(JSON.parse(row().json).callState, 'connected', 'call state changes are persisted');

  // Simulate a restart: the in-memory map is gone, SQLite still has the row.
  store.SESSIONS.delete(id);
  assert.equal(agent.getSession(id), null);
  assert.equal(store.restore(), 1);
  const back = agent.getSession(id);
  assert.equal(back.call_state, 'connected');
  assert.equal(back.greeting, start.greeting);
  assert.ok(back.trace.some(e => e.step === 'llm_greeting'), 'the trace survives the restart');

  // The restored call carries on and completes normally.
  const t = await agent.turn(id, 'I will take the earlier bus from tomorrow');
  assert.ok(t.reply);
  assert.equal(JSON.parse(row().json).transcript.length, 3, 'the turn is persisted');
  await agent.completeSession(id);
  assert.equal(row(), undefined, 'a completed session is removed from the table');
});

test('restart: stale and cancelled sessions are not restored', async () => {
  const a = await agent.startSession({ helperId: 'priya' });
  const b = await agent.startSession({ helperId: 'meena' });
  db.prepare('UPDATE voice_sessions SET updated_at = ? WHERE id = ?').run(Date.now() - 31 * 60 * 1000, a.session_id);
  assert.equal(agent.cancelSession(b.session_id), true);
  assert.equal(db.prepare('SELECT 1 FROM voice_sessions WHERE id = ?').get(b.session_id), undefined);
  store.SESSIONS.delete(a.session_id);
  assert.equal(store.restore(), 0);
  assert.equal(agent.getSession(a.session_id), null);
  assert.equal(db.prepare('SELECT 1 FROM voice_sessions WHERE id = ?').get(a.session_id), undefined, 'the stale row is dropped');

  // The sweep drops idle sessions from memory and from the table.
  const c = await agent.startSession({ helperId: 'priya' });
  store.sweep(Date.now() + store.IDLE_MS + 1000);
  assert.equal(agent.getSession(c.session_id), null);
  assert.equal(db.prepare('SELECT 1 FROM voice_sessions WHERE id = ?').get(c.session_id), undefined);
});

test('shutdown: a retain still pending is handed to the retry queue once, and the process exits cleanly', async () => {
  net.retainMode = 'hang';
  try {
    const start = await agent.startSession({ helperId: 'radha' });
    await agent.turn(start.session_id, 'The early bus was late again this week');
    const done = await agent.completeSession(start.session_id);
    assert.equal(done.retain.status, 'saving');
    assert.deepEqual(inflight.pending(), { saves: 0, retains: 1 });

    const exits = [];
    const logs = [];
    let closed = false;
    const shutdown = createShutdown({ server: { close: () => { closed = true; } }, timeoutMs: 30, exit: code => exits.push(code), log: m => logs.push(m) });
    const [code, again] = await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    assert.equal(code, 0);
    assert.equal(again, 0, 'a second signal waits for the same shutdown');
    assert.deepEqual(exits, [0]);
    assert.ok(closed, 'stops accepting connections');
    assert.match(logs.join('\n'), /1 retain\(s\) handed to the retry queue/);

    const jobs = () => db.prepare('SELECT * FROM retain_jobs WHERE call_id = ?').all(done.call_id);
    assert.equal(jobs().length, 1);
    assert.equal(jobs()[0].status, 'pending');
    assert.equal(JSON.parse(jobs()[0].payload).length, 2);

    // If the held retain fails after the hand-off, it is not queued a second time.
    net.release();
    for (let i = 0; i < 50 && agent.getSession(start.session_id).result.retain.status === 'saving'; i++) await new Promise(r => setImmediate(r));
    assert.equal(agent.getSession(start.session_id).result.retain.status, 'queued');
    assert.equal(jobs().length, 1);
    assert.deepEqual(inflight.pending(), { saves: 0, retains: 0 });
  } finally { net.retainMode = 'ok'; }
});

test('shutdown: waits for an in-flight save and reports a failed drain', async () => {
  let finish;
  const save = inflight.trackSave(new Promise(r => { finish = r; }));
  const drained = inflight.drain({ timeoutMs: 2000 });
  setTimeout(() => finish('saved'), 10);
  assert.equal(await save, 'saved');
  assert.deepEqual(await drained, { saves_unfinished: 0, retains_handed_off: 0, jobs: [] });

  const exits = [];
  const shutdown = createShutdown({ exit: c => exits.push(c), log: () => {}, drain: async () => { throw new Error('boom'); } });
  assert.equal(await shutdown(), 1);
  assert.deepEqual(exits, [1]);
});
