/** GET /api/health: liveness plus which integrations are configured. Never exposes secrets. */
const express = require('express');
const db = require('./db');
const groq = require('./groq');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');

const router = express.Router();

router.get('/api/health', (req, res) => {
  const body = {
    ok: true,
    uptime_s: Math.round(process.uptime()),
    groq: { configured: groq.isConfigured(), keys: groq.keyCount() },
    hindsight: { configured: hindsight.isConfigured(), bank: hindsight.BANK_ID },
    db: null,
    retains_waiting: null,
  };
  try {
    body.db = {
      helpers: db.prepare('SELECT COUNT(*) AS n FROM helpers').get().n,
      calls: db.prepare('SELECT COUNT(*) AS n FROM calls').get().n,
    };
    body.retains_waiting = retainQueue.pendingCount();
  } catch (err) {
    body.ok = false;
    body.db = { error: 'Database unavailable.' };
  }
  res.status(body.ok ? 200 : 503).json(body);
});

module.exports = router;
