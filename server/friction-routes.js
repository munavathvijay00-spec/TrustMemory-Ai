/**
 * Friction check before a placement (coordinator only; access control already limits /api routes).
 *   GET /api/friction?helper=<id>&household=<id>
 */
const express = require('express');
const friction = require('./friction');

const router = express.Router();

router.get('/api/friction', async (req, res) => {
  try {
    res.json(await friction.check(String(req.query.helper || '').trim(), String(req.query.household || '').trim()));
  } catch (err) {
    if (err instanceof friction.FrictionError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[TrustMemory AI] friction check failed:', err && err.message);
    res.status(500).json({ error: 'Could not run the friction check.', code: 'INTERNAL' });
  }
});

module.exports = router;
