/**
 * Call language and purpose: validated on session start, carried into the prompt, the phone
 * relay and the saved session, and kept across a restart. Groq is mocked at the network edge;
 * Hindsight is left unconfigured so memory comes from the local ledger.
 */
require('./support');
const { startServer } = require('./support');

process.env.GROQ_API_KEYS = 'gsk_test_key_0001';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt } = require('../server/voice/prompt');
const { callLanguage, callPurpose } = require('../server/voice/util');
const store = require('../server/voice/session-store');
const { createApp } = require('../server/app');

const groqCalls = [];
global.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  if (String(url).startsWith('https://api.groq.com/')) {
    groqCalls.push(body);
    const content = body.messages.length === 2
      ? 'నమస్కారం రాధ గారు, ఏజెన్సీ నుండి మాట్లాడుతున్నాం. ఇప్పుడు మాట్లాడవచ్చా?'
      : 'సరే, అర్థమైంది. మీరు ఆలస్యం అయితే ఇంటివారికి మెసేజ్ చేయగలరా?\nరాధ: సరే, చేస్తాను.';
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('Network disabled in tests: ' + url);
};

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());

const base = {
  helper: { id: 'radha', name: 'Radha Kumari', role: 'child_care', experience_years: 4 },
  household: null, scenario: 'coaching_call', lateCount: 2,
  memory: { source: 'local', facts: [] }, priorCalls: [], ledger: null,
};

test('language: English by default; hi and te accepted; anything else refused', () => {
  assert.equal(callLanguage(undefined), 'en');
  assert.equal(callLanguage(''), 'en');
  assert.equal(callLanguage('TE'), 'te');
  assert.equal(callLanguage('hi'), 'hi');
  assert.throws(() => callLanguage('fr'), err => err.status === 400);
  assert.equal(callPurpose('   '), null);
  assert.equal(callPurpose('  Dussehra   is close '), 'Dussehra is close');
  assert.throws(() => callPurpose('x'.repeat(301)), err => err.status === 400);
});

test('language: the prompt tells the agent which language and why the agency is calling', () => {
  const en = buildSystemPrompt(base);
  assert.match(en, /plain Indian English/);
  assert.doesNotMatch(en, /LANGUAGE:/);
  assert.doesNotMatch(en, /Why the agency is calling today/);

  const te = buildSystemPrompt(Object.assign({}, base, { language: 'te', purpose: 'Dussehra is in three weeks.' }));
  assert.match(te, /LANGUAGE: speak ONLY natural spoken Telugu, written in Telugu script \(names too\)/);
  assert.match(te, /Radha garu/);
  assert.match(te, /Keep the citation tags exactly as \[m1\]/);
  assert.match(te, /Why the agency is calling today: Dussehra is in three weeks\./);

  const hi = buildSystemPrompt(Object.assign({}, base, { language: 'hi' }));
  assert.match(hi, /Devanagari/);
  assert.match(hi, /Radha ji/);
});

test('language: an agency-wide prior is used only when the helper has no track record', () => {
  const prior = { problem_type: 'transport', approach: 'listen_first', kept: 7, total: 9, helpers: 4 };
  const ledger = { open: [], works: { best: null, avoid: [], prior }, stats: {} };
  const withPrior = buildSystemPrompt(Object.assign({}, base, { ledger }));
  assert.match(withPrior, /ACROSS THE AGENCY: for transport problems, .* kept their promise 7 of 9 times/);
  const own = { open: [], works: { best: { approach: 'reassure_first', description: 'reassure her first', kept: 2, broken: 0 }, avoid: [], prior }, stats: {} };
  assert.doesNotMatch(buildSystemPrompt(Object.assign({}, base, { ledger: own })), /ACROSS THE AGENCY/);
  // Absent prior (older ledger shape) is fine.
  assert.doesNotMatch(buildSystemPrompt(Object.assign({}, base, { ledger: { open: [], works: { best: null, avoid: [] }, stats: {} } })), /ACROSS THE AGENCY/);
});

test('language: a Telugu call carries its language to the phone, cuts role-play, and survives a restart', async () => {
  const bad = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'radha', language: 'fr' } });
  assert.equal(bad.status, 400);
  const long = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'radha', purpose: 'x'.repeat(301) } });
  assert.equal(long.status, 400);

  const r = await srv.request('POST', '/api/voice/session', { body: { helper_id: 'radha', language: 'te', purpose: 'Dussehra is close.' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.language, 'te');
  assert.equal(r.body.speech_lang, 'te-IN');
  assert.equal(r.body.purpose, 'Dussehra is close.');
  assert.match(groqCalls[groqCalls.length - 1].messages[0].content, /Telugu script/);
  const id = r.body.session_id;

  await srv.request('POST', '/api/voice/ring', { body: { session_id: id } });
  const inc = await srv.request('GET', '/api/voice/incoming?helper=radha');
  assert.equal(inc.body.call.speech_lang, 'te-IN');
  const ans = await srv.request('POST', '/api/voice/answer', { body: { session_id: id, accept: true } });
  assert.equal(ans.body.speech_lang, 'te-IN');

  const t = await srv.request('POST', '/api/voice/turn', { body: { session_id: id, text: 'బస్ ఆలస్యంగా వచ్చింది' } });
  assert.equal(t.status, 200);
  assert.ok(!t.body.reply.includes('రాధ:'), 'the helper line written by the model is cut');
  assert.equal(t.body.ending, false);

  const view = await srv.request('GET', '/api/voice/session/' + id);
  const agentLines = view.body.transcript.filter(x => x.who === 'Agent');
  assert.ok(agentLines.every(x => x.latency && typeof x.latency.llm_ms === 'number'), 'every agent line carries its timings');

  // Simulated restart: the in-memory map is cleared and rebuilt from SQLite.
  store.SESSIONS.delete(id);
  assert.equal(store.restore(), 1);
  const back = await srv.request('GET', '/api/voice/session/' + id);
  assert.equal(back.body.language, 'te');
  assert.equal(back.body.purpose, 'Dussehra is close.');
});
