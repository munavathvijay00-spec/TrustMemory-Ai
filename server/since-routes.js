/**
 * What changed since the last call with a helper (coordinator only: access control keeps
 * helpers and households to /api/me/*). Read-only.
 */
const express = require('express');
const { since, ValidationError, NotFoundError } = require('./since');

const router = express.Router();

router.get('/api/since', async (req, res) => {
  try {
    res.json(await since(req.query.helper));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[TrustMemory AI] since failed:', err && err.message);
    return res.status(500).json({ error: 'Could not work out what changed since the last call.', code: 'INTERNAL' });
  }
});

module.exports = router;
