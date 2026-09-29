/**
 * Both sides of the story (coordinator only): what the household and the helper each said about
 * a placement, lined up by topic for a neutral mediation call. Logic lives in sides.js.
 */
const express = require('express');
const sides = require('./sides');

const router = express.Router();

router.get('/api/sides', async (req, res) => {
  try {
    res.json(await sides.compare(req.query.household, req.query.helper));
  } catch (err) {
    if (err instanceof sides.ValidationError || err instanceof sides.NotFoundError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[TrustMemory AI] both-sides route failed:', err && err.message);
    return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
  }
});

module.exports = router;
