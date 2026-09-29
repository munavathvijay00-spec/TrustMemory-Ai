/** HTTP routes for the browser voice agent + memory status. */
const express = require('express');
const agent = require('./voice-agent');
const tts = require('./voice/tts');
const followup = require('./voice/followup');

const router = express.Router();

function fail(res, err) {
  const status = err.status || (err.code === 'GROQ_NOT_CONFIGURED' ? 503 : 500);
  return res.status(status).json({ error: err.message, code: err.code || null });
}

router.post('/api/voice/session', async (req, res) => {
  try {
    const { helper_id, scenario, late_count, use_memory, language, purpose } = req.body || {};
    res.json(await agent.startSession({ helperId: helper_id, scenario, lateCount: late_count, useMemory: use_memory !== false, language, purpose }));
  } catch (err) { fail(res, err); }
});

router.post('/api/voice/turn', async (req, res) => {
  try {
    const { session_id, text } = req.body || {};
    res.json(await agent.turn(session_id, text));
  } catch (err) { fail(res, err); }
});

router.post('/api/voice/complete', async (req, res) => {
  try {
    const { session_id } = req.body || {};
    res.json(await agent.completeSession(session_id));
  } catch (err) { fail(res, err); }
});

router.get('/api/voice/session/:id', (req, res) => {
  const s = agent.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  // The helper's own phone screen gets the call, not the agency's notes about her.
  if (req.account && req.account.role === 'helper') {
    return res.json({ session_id: s.session_id, helper: { id: s.helper.id, name: s.helper.name }, language: s.language, speech_lang: s.speech_lang,
      status: s.status, call_state: s.call_state, result: s.result ? { completed: true } : undefined });
  }
  res.json(s);
});

router.post('/api/voice/cancel', (req, res) => {
  const ok = agent.cancelSession((req.body || {}).session_id);
  res.json({ cancelled: ok });
});

/* ------------------------------------------------------------------ helper phone screen */

const SAFE_ID = /^[a-z0-9_-]{1,32}$/i;

router.post('/api/voice/ring', (req, res) => {
  try { res.json(agent.ring((req.body || {}).session_id)); } catch (err) { fail(res, err); }
});

router.get('/api/voice/incoming', (req, res) => {
  const helperId = String(req.query.helper || '').trim();
  if (!SAFE_ID.test(helperId)) return res.status(400).json({ error: 'Pass a valid helper id.' });
  res.json({ call: agent.incoming(helperId) });
});

router.post('/api/voice/answer', (req, res) => {
  const { session_id, accept } = req.body || {};
  try { res.json(agent.answer(session_id, accept !== false)); } catch (err) { fail(res, err); }
});

router.post('/api/voice/hangup', (req, res) => {
  const { session_id, by } = req.body || {};
  try { res.json(agent.hangup(session_id, by)); } catch (err) { fail(res, err); }
});

/* ------------------------------------------------------------------ Azure neural voices for the phone screen */

router.get('/api/voice/tts/status', (req, res) => res.json(tts.status()));

router.post('/api/voice/tts', async (req, res) => {
  const { text, lang } = req.body || {};
  try {
    const audio = await tts.synthesize(text, lang);
    res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'no-store').send(audio);
  } catch (err) { fail(res, err); }
});

/* ------------------------------------------------------------------ WhatsApp follow-up draft (coordinator) */

router.post('/api/voice/followup-draft', async (req, res) => {
  const id = String((req.body || {}).session_id || '');
  try { res.json(await followup.draftFollowup(id ? agent.getSession(id) : null)); } catch (err) { fail(res, err); }
});

module.exports = router;
