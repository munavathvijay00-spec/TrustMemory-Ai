/**
 * After-call hooks. Features that react to a finished call (safety signals, learning across
 * helpers) register here instead of editing saveCall. Hooks run after the call is saved and
 * never block or fail the call: errors are logged and swallowed.
 */
const handlers = [];

function onCallSaved(fn) { handlers.push(fn); }

function emitCallSaved(s, result) {
  for (const fn of handlers) {
    Promise.resolve()
      .then(() => fn({ helper: s.helper, household: s.household || null, transcript: s.transcript, outcome: result.outcome, callId: result.call_id, result }))
      .catch(err => console.warn('[TrustMemory AI] after-call hook failed:', err && err.message));
  }
}

module.exports = { onCallSaved, emitCallSaved };
