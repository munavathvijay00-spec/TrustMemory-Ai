/**
 * Test environment. Require this FIRST in every test file (node --test runs each file in
 * its own process, so every file gets a fresh in-memory database).
 *
 * - TRUSTMEMORY_DB=:memory: so tests never touch trustmemory.db
 * - Groq and Hindsight keys forced empty (dotenv never overrides a variable that is set),
 *   so a developer's .env cannot make the tests call real services
 * - global fetch replaced with a stub that fails loudly if anything tries the network
 */
const http = require('http');

process.env.TRUSTMEMORY_DB = ':memory:';
process.env.TRUSTMEMORY_LOG = 'off';
for (const k of ['GROQ_API_KEYS', 'GROQ_API_KEY', 'HINDSIGHT_API_KEY', 'HINDSIGHT_API_URL', 'HINDSIGHT_BANK_ID']) process.env[k] = '';

global.fetch = async (url) => { throw new Error('Network disabled in tests: ' + url); };

/** Start an app on an ephemeral port; returns { request, close }. Uses node:http, not fetch. */
async function startServer(app) {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const { port } = server.address();
  function request(method, path, { body, raw, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
      const req = http.request({ host: '127.0.0.1', port, method, path, headers: payload !== null ? { 'Content-Type': 'application/json', ...headers } : headers }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch { /* not JSON */ }
          resolve({ status: res.statusCode, headers: res.headers, body: json, text: data });
        });
      });
      req.on('error', reject);
      if (payload !== null) req.write(payload);
      req.end();
    });
  }
  return { request, close: () => new Promise(r => server.close(r)) };
}

module.exports = { startServer };
