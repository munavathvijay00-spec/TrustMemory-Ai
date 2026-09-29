const { startServer } = require('./support');
// A developer's .env must not switch Azure on for these tests (dotenv never overrides a set variable).
process.env.AZURE_SPEECH_KEY = '';
process.env.AZURE_SPEECH_REGION = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const tts = require('../server/voice/tts');
const followup = require('../server/voice/followup');
const groq = require('../server/groq');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());

function withAzure(fn) {
  return async () => {
    const saved = { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION, fetch: global.fetch };
    process.env.AZURE_SPEECH_KEY = 'test-azure-key';
    process.env.AZURE_SPEECH_REGION = 'centralindia';
    try { await fn(); } finally {
      process.env.AZURE_SPEECH_KEY = saved.key || '';
      process.env.AZURE_SPEECH_REGION = saved.region || '';
      global.fetch = saved.fetch;
    }
  };
}

test('tts: SSML picks the neural voice for the language and escapes the text', () => {
  const te = tts.buildSsml('నమస్కారం <రాధ> & "మీరు"', 'te');
  assert.match(te, /name="te-IN-ShrutiNeural"/);
  assert.match(te, /xml:lang="te-IN"/);
  assert.match(te, /&lt;రాధ&gt; &amp; &quot;మీరు&quot;/);
  assert.doesNotMatch(te, /<రాధ>/);
  assert.match(tts.buildSsml('नमस्ते', 'hi'), /hi-IN-SwaraNeural/);
  assert.match(tts.buildSsml('Hello', 'en'), /en-IN-NeerjaNeural/);
});

test('tts: without an Azure key the route says so and the status is off', async () => {
  const st = await srv.request('GET', '/api/voice/tts/status');
  assert.equal(st.status, 200);
  assert.equal(st.body.azure, false);
  assert.equal(st.body.voices.te, 'te-IN-ShrutiNeural');
  const r = await srv.request('POST', '/api/voice/tts', { body: { text: 'నమస్కారం', lang: 'te' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'TTS_NOT_CONFIGURED');
});

test('tts: bad language and over-long text are refused before any network call', async () => {
  assert.equal((await srv.request('POST', '/api/voice/tts', { body: { text: 'Hello', lang: 'fr' } })).status, 400);
  assert.equal((await srv.request('POST', '/api/voice/tts', { body: { text: 'a'.repeat(601), lang: 'en' } })).status, 400);
  assert.equal((await srv.request('POST', '/api/voice/tts', { body: { text: '   ', lang: 'hi' } })).status, 400);
});

test('tts: with a key the route calls Azure with the right headers and returns mp3', withAzure(async () => {
  let seen = null;
  global.fetch = async (url, opts) => {
    seen = { url, opts };
    return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  };
  assert.equal((await srv.request('GET', '/api/voice/tts/status')).body.azure, true);
  const r = await srv.request('POST', '/api/voice/tts', { body: { text: 'మీ జీతం గురించి మాట్లాడుదాం', lang: 'te' } });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /audio\/mpeg/);
  assert.equal(seen.url, 'https://centralindia.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.equal(seen.opts.headers['Ocp-Apim-Subscription-Key'], 'test-azure-key');
  assert.equal(seen.opts.headers['X-Microsoft-OutputFormat'], 'audio-24khz-48kbitrate-mono-mp3');
  assert.match(seen.opts.body, /te-IN-ShrutiNeural/);
}));

test('tts: an Azure failure is a 502, not a crash', withAzure(async () => {
  global.fetch = async () => new Response('denied', { status: 401 });
  const r = await srv.request('POST', '/api/voice/tts', { body: { text: 'Hello', lang: 'en' } });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'TTS_FAILED');
}));

test('follow-up: unknown session is 404 and an unfinished call is 409', async () => {
  const r = await srv.request('POST', '/api/voice/followup-draft', { body: { session_id: 'vs_000000000000' } });
  assert.equal(r.status, 404);
  await assert.rejects(followup.draftFollowup({ helper: { name: 'Radha Kumari' }, language: 'te', transcript: [], result: null }), e => e.status === 409);
});

test('follow-up: the prompt carries the language and the rules, and the draft is capped', async () => {
  const s = {
    helper: { name: 'Radha Kumari' }, language: 'te',
    transcript: [{ who: 'Agent', text: 'Hello' }, { who: 'Radha', text: 'My husband will drop Lakshmi at school from next week.' }],
    result: { outcome: { specific_commitment: 'Message the family if more than ten minutes late', follow_up_date: '2026-10-13' } },
  };
  const prompt = followup.buildPrompt(s);
  assert.match(prompt, /Telugu script/);
  assert.match(prompt, /never mention scores/);
  assert.match(prompt, /Do not promise anything/);
  assert.match(prompt, /2026-10-13/);
  assert.doesNotMatch(prompt, /Hello/, 'only her own lines are used');
  const saved = groq.chatJson;
  groq.chatJson = async () => ({ text: 'x '.repeat(400) });
  try {
    const d = await followup.draftFollowup(s);
    assert.equal(d.lang, 'te');
    assert.ok(d.text.length <= followup.MAX_CHARS);
  } finally { groq.chatJson = saved; }
});
