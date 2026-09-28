/**
 * One-line JSON request log with a request id, echoed back as X-Request-Id.
 *
 * Only /api requests are logged (static files would drown the console). The two status
 * polls the console and helper phone make every second are logged only when they fail.
 * Set TRUSTMEMORY_LOG=off to silence it (the tests do).
 */
const crypto = require('crypto');

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const QUIET = [/^\/api\/voice\/incoming$/, /^\/api\/voice\/session\/[^/]+$/, /^\/api\/memory\/status$/];

function createLogger({ write = line => console.log(line), enabled = process.env.TRUSTMEMORY_LOG !== 'off' } = {}) {
  return function requestLogger(req, res, next) {
    const incoming = req.get('X-Request-Id');
    req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomBytes(4).toString('hex');
    res.set('X-Request-Id', req.id);
    if (!enabled || !req.path.startsWith('/api/')) return next();

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (res.statusCode < 400 && req.method === 'GET' && QUIET.some(rx => rx.test(req.path))) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      write(JSON.stringify({ id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) }));
    });
    return next();
  };
}

module.exports = { createLogger };
