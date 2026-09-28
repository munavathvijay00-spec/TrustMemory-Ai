/**
 * Care routes: private safety checks across a helper's calls, and the handover brief that
 * turns a household's memory into a briefing for the next helper. Logic lives in care.js.
 */
const express = require('express');
const care = require('./care');

const router = express.Router();

function careError(res, err) {
  if (err instanceof care.ValidationError || err instanceof care.NotFoundError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('[TrustMemory AI] care route failed:', err && err.message);
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
}

/* ------------------------------------------------------------------ safety checks (coordinator only) */

router.get('/api/care/safety', (req, res) => {
  try { res.json({ open: care.openFlags(), window_days: care.WINDOW_DAYS }); } catch (err) { careError(res, err); }
});

router.get('/api/care/safety/:helperId', (req, res) => {
  try { res.json(care.forHelper(req.params.helperId)); } catch (err) { careError(res, err); }
});

router.post('/api/care/safety/:flagId/review', (req, res) => {
  try { res.json(care.review(req.params.flagId, (req.body || {}).note)); } catch (err) { careError(res, err); }
});

/* ------------------------------------------------------------------ handover brief */

router.get('/api/care/handover/:householdId', async (req, res) => {
  try {
    res.json(await care.handover(req.params.householdId, { helperId: req.query.helper, lang: req.query.lang || 'en' }));
  } catch (err) { careError(res, err); }
});

// Recording that the brief was given writes to memory, so it is a POST and an explicit step.
router.post('/api/care/handover/:householdId/given', (req, res) => {
  try { res.json(care.recordHandover(req.params.householdId, (req.body || {}).helper)); } catch (err) { careError(res, err); }
});

module.exports = router;
