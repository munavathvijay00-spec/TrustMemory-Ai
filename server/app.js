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

function createApp({ port = process.env.PORT || 3000, logger = createLogger(), rateLimit = createRateLimiter() } = {}) {
  const app = express();

  app.use(logger);
  app.use(rateLimit);
  app.use(cors({ origin: [`http://localhost:${port}`, `http://127.0.0.1:${port}`] }));
  app.use(express.json({ limit: '64kb' }));

  // Serve static frontend files
  app.use(express.static(path.resolve(__dirname, '../TrustMemory-AI-modular')));

  app.use(validate);
  app.use(healthRoutes);

  // Voice agent (browser call + helper phone screen) and Hindsight memory endpoints
  app.use(voiceRoutes);
  app.use(memoryRoutes);

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
      } catch (e) { /* keep defaults */ }
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
