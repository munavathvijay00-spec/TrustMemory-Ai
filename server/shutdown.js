/**
 * Graceful shutdown: stop accepting connections, wait (up to timeoutMs) for call saves and
 * background Hindsight retains still in flight, hand any retain still pending to the durable
 * retry queue, then exit. Live voice sessions are already persisted on every change.
 */
const inflight = require('./voice/inflight');

function createShutdown({ server, timeoutMs = 10000, exit = code => process.exit(code), log = console.log, drain = inflight.drain } = {}) {
  let running = null;
  return function shutdown(signal) {
    if (running) return running;
    running = (async () => {
      log(`[TrustMemory AI] ${signal || 'shutdown'} received: finishing in-flight saves (up to ${timeoutMs / 1000} s)...`);
      if (server) {
        server.close();
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      }
      let code = 0;
      try {
        const r = await drain({ timeoutMs });
        log(`[TrustMemory AI] Shutdown: ${r.retains_handed_off} retain(s) handed to the retry queue, ${r.saves_unfinished} save(s) unfinished.`);
        if (r.saves_unfinished) code = 1;
      } catch (err) {
        log('[TrustMemory AI] Shutdown drain failed: ' + err.message);
        code = 1;
      }
      exit(code);
      return code;
    })();
    return running;
  };
}

module.exports = { createShutdown };
