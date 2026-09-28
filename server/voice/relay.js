/* ------------------------------------------------------------------ helper phone screen relay
 * The coordinator starts a session and rings the helper's phone screen. The phone screen polls
 * for an incoming call, answers or declines, runs the conversation through turn(), and hangs up.
 * The coordinator console mirrors the same session by polling getSession(). One session, one
 * memory path, two screens.
 */
const db = require('../db');
const { nowSql } = require('./util');
const { SESSIONS, persist } = require('./session-store');

const RING_TIMEOUT_MS = 60 * 1000;

function setCallState(s, state) {
  s.callState = state;
  s.callStateAt = new Date().toISOString();
  s.lastActivity = Date.now();
  persist(s);
}

/** An unanswered ring becomes "missed" after the timeout, whether or not the phone screen is open. */
function expireRing(s) {
  if (s.callState === 'ringing' && Date.now() - new Date(s.callStateAt).getTime() > RING_TIMEOUT_MS) {
    setCallState(s, 'missed');
    db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
      'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — ' + s.helper.name + ' did not answer.', nowSql());
  }
}

function ring(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.result || s.status === 'cancelled') throw Object.assign(new Error('This call has already ended.'), { status: 409 });
  // Only one ringing call per helper: an older unanswered ring for the same helper is withdrawn.
  for (const other of SESSIONS.values()) {
    if (other !== s && other.helper.id === s.helper.id && other.callState === 'ringing') setCallState(other, 'missed');
  }
  setCallState(s, 'ringing');
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — Ringing ' + s.helper.name + '\'s phone screen.', nowSql());
  return { session_id: s.id, call_state: s.callState };
}

function incoming(helperId) {
  let found = null;
  for (const s of SESSIONS.values()) {
    if (s.helper.id !== helperId || s.callState !== 'ringing') continue;
    expireRing(s);
    if (s.callState !== 'ringing') continue;
    if (!found || s.callStateAt > found.callStateAt) found = s;
  }
  if (!found) return null;
  return {
    session_id: found.id,
    caller: 'Home-Care Agency',
    helper: { id: found.helper.id, name: found.helper.name },
    greeting: found.transcript[0] ? found.transcript[0].text : '',
    rang_at: found.callStateAt,
  };
}

function answer(sessionId, accept) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.callState !== 'ringing') throw Object.assign(new Error('This call is not ringing any more.'), { status: 409 });
  setCallState(s, accept ? 'connected' : 'declined');
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'voice', ?, ?)").run(
    'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), 'VOICE AGENT — ' + s.helper.name + (accept ? ' answered the call.' : ' declined the call.'), nowSql());
  return { session_id: s.id, call_state: s.callState, greeting: s.transcript[0] ? s.transcript[0].text : '' };
}

function hangup(sessionId, by) {
  const s = SESSIONS.get(sessionId);
  if (!s) throw Object.assign(new Error('Session not found.'), { status: 404 });
  if (s.callState === 'ended') return { session_id: s.id, call_state: s.callState };
  setCallState(s, 'ended');
  s.endedBy = by === 'coordinator' ? 'coordinator' : 'helper';
  persist(s);
  return { session_id: s.id, call_state: s.callState, ended_by: s.endedBy };
}

module.exports = { RING_TIMEOUT_MS, setCallState, expireRing, ring, incoming, answer, hangup };
