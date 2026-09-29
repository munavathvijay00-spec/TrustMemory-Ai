/**
 * Express app factory. server/index.js boots it; the tests start it on an ephemeral port.
 *
 * Middleware order: request log -> rate limit -> CORS -> JSON body -> static frontend ->
 * input validation -> routers -> JSON 404 for /api -> JSON error handler.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const { createLogger } = require('./logger');
const { createRateLimiter } = require('./rate-limit');
const { validate } = require('./validate');
const healthRoutes = require('./health-routes');
const voiceRoutes = require('./voice-routes');
const memoryRoutes = require('./memory-routes');
const auth = require('./auth');
const authRoutes = require('./auth-routes');
const careRoutes = require('./care-routes');
const outreachRoutes = require('./outreach-routes');
const requestRoutes = require('./request-routes');
const recordRoutes = require('./record-routes');
const frictionRoutes = require('./friction-routes');
const sidesRoutes = require('./sides-routes');
const sinceRoutes = require('./since-routes');
const { securityHeaders } = require('./security-headers');

function createApp({
  port = process.env.PORT || 3000,
  logger = createLogger(),
  rateLimit = createRateLimiter(),
  auth: authEnabled = process.env.TRUSTMEMORY_AUTH !== 'off',
  seedDemo = authEnabled,
} = {}) {
  const app = express();
  // Behind a hosting proxy (Render, Azure), use the client's address for rate limits and
  // sign-in lockouts instead of the proxy's, or one visitor could lock out everyone.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  if (seedDemo) {
    // Demo accounts for the three roles. Generated passwords are printed once; set
    // DEMO_*_PASSWORD in .env to choose (or reset) them.
    for (const g of auth.seedDemoAccounts()) {
      console.log(`[TrustMemory AI] Demo ${g.role} account ${g.email} created with password ${g.password} (set ${g.env} in .env to change it).`);
    }
  }

  app.disable('x-powered-by');
  app.use(logger);
  app.use(securityHeaders);
  // Express matches routes case-insensitively, but access control, rate limits and validation
  // compare lowercase paths; refuse /API/..., /Api/... so nothing can slip past them.
  app.use((req, res, next) => (/^\/api(\/|$)/i.test(req.path) && !/^\/api(\/|$)/.test(req.path)
    ? res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }) : next()));
  app.use(rateLimit);
  app.use(cors({ origin: [`http://localhost:${port}`, `http://127.0.0.1:${port}`] }));
  app.use(express.json({ limit: '64kb' }));

  // Serve static frontend files
  app.use(express.static(path.resolve(__dirname, '../TrustMemory-AI-modular')));

  app.use(validate);
  // Sign-in and role checks for every /api route except health and the sign-in routes themselves.
  app.use(authRoutes.accessControl({ enabled: authEnabled }));
  app.use(authRoutes.router);
  app.use(healthRoutes);

  // Voice agent (browser call + helper phone screen) and Hindsight memory endpoints
  app.use(voiceRoutes);
  app.use(memoryRoutes);
  app.use(careRoutes);      // handover brief, safety signals
  app.use(outreachRoutes);  // today's calls, learning across helpers
  app.use(requestRoutes);   // requests and preferences from helpers and households
  app.use(recordRoutes);    // what is on record: view, correct, forget
  app.use(frictionRoutes);  // friction check before a placement
  app.use(sidesRoutes);     // both sides of a placement's story
  app.use(sinceRoutes);     // what changed since the last call

  /* ---------------------------------------------------------------- read-only data for the dashboard */

  app.get('/api/helpers', (req, res) => {
    res.json(db.prepare('SELECT * FROM helpers').all());
  });

  app.get('/api/households', (req, res) => {
    res.json(db.prepare('SELECT * FROM households').all());
  });

  app.get('/api/memories/:helper_id', (req, res) => {
    res.json(db.prepare('SELECT * FROM memories WHERE helper_id = ? ORDER BY created_at DESC').all(req.params.helper_id));
  });

  app.get('/api/calls', (req, res) => {
    const calls = db.prepare('SELECT * FROM calls ORDER BY created_at DESC').all();
    res.json(calls.map(c => {
      let transcript = [];
      let outcome = {};
      try {
        transcript = JSON.parse(c.transcript || '[]');
        outcome = JSON.parse(c.outcome_json || '{}');
      } catch { /* keep defaults */ }
      return { ...c, transcript, outcome };
    }));
  });

  app.get('/api/activity', (req, res) => {
    res.json(db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 50').all());
  });

  // Unknown API routes answer with JSON, not the HTML fallback.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));

  // Malformed JSON bodies and other unexpected errors never leak a stack trace.
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'BAD_JSON' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.', code: 'TOO_LARGE' });
    console.error(`[TrustMemory AI] Unhandled error (request ${req.id || '-'}):`, err && err.message);
    return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
  });

  return app;
}

module.exports = { createApp };
