/**
 * Browser voice agent, public API. The implementation is split by concern:
 *
 *   util.js           shared helpers (END_TOKEN, nowSql, firstName, helperTags, daysBetween)
 *   trace.js          per-session step timings
 *   session-store.js  live sessions in memory + SQLite (restart safety, sweep)
 *   recall.js         Hindsight / local memory recall and fact de-duplication
 *   prompt.js         the persona system prompt
 *   citations.js      [mN] memory citations and fallback attribution
 *   extraction.js     structured outcome extraction from the transcript
 *   inflight.js       saves and background retains still running (graceful shutdown)
 *   session.js        start, turn, complete, view, cancel
 *   relay.js          helper phone screen: ring, incoming, answer, hangup
 *
 * Shutdown and restore live in session-store.js and inflight.js and are used by server/index.js.
 */
const { startSession, turn, completeSession, getSession, cancelSession } = require('./session');
const { ring, incoming, answer, hangup } = require('./relay');
const { dedupeFacts } = require('./recall');
const { mayUseMemory, knownTags, splitCitations, attributeCitations } = require('./citations');
const { daysBetween } = require('./util');

module.exports = { startSession, turn, completeSession, getSession, cancelSession, ring, incoming, answer, hangup, _test: { dedupeFacts, mayUseMemory, knownTags, splitCitations, daysBetween, attributeCitations } };
