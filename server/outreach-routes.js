/**
 * Calling before problems and learning across helpers.
 *
 *   GET /api/outreach/today      who to ring today, ranked, with dated and sourced reasons
 *   GET /api/outreach/learning   what works across the agency, by problem type and approach
 */
const express = require('express');
const outreach = require('./outreach');
const commitments = require('./commitments');

const router = express.Router();

router.get('/api/outreach/today', async (req, res) => {
  const raw = req.query.limit;
  const limit = raw === undefined ? 8 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: 'limit must be a whole number from 1 to 50.', code: 'VALIDATION' });
  try {
    res.json(await outreach.today({ limit, useMemory: req.query.memory !== 'off' }));
  } catch (err) {
    console.error('[TrustMemory AI] outreach/today failed:', err.message);
    res.status(500).json({ error: 'Could not build today\'s calls.', code: 'INTERNAL' });
  }
});

router.get('/api/outreach/learning', (req, res) => {
  try {
    res.json(commitments.agencyLearning());
  } catch (err) {
    console.error('[TrustMemory AI] outreach/learning failed:', err.message);
    res.status(500).json({ error: 'Could not build the agency learning table.', code: 'INTERNAL' });
  }
});

module.exports = router;
