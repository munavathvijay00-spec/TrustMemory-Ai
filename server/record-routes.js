/**
 * What the agency has on record: the helper sees her own record and corrects it; the coordinator
 * can have every memory about a helper forgotten. (/api/me/* is open to signed-in helpers; every
 * other route here is coordinator-only through the access control in auth-routes.js.)
 */
const express = require('express');
const record = require('./record');

const router = express.Router();

function fail(res, err) {
  if (err instanceof record.ValidationError || err instanceof record.NotFoundError || err instanceof record.MemoryUnavailableError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error('[TrustMemory AI] record route failed:', err && err.message);
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
}

/** The signed-in helper. With sign-in off (tests), ?as=helper:<id> stands in for one. */
function helperId(req, res) {
  const a = req.account;
  let id = a && a.role === 'helper' ? a.person_id : null;
  if (!a && req.authOff && typeof req.query.as === 'string' && /^helper:[\w-]+$/.test(req.query.as)) id = req.query.as.split(':')[1];
  if (!id) { res.status(403).json({ error: 'This is for helper accounts.', code: 'FORBIDDEN' }); return null; }
  return id;
}

router.get('/api/me/record', async (req, res) => {
  const id = helperId(req, res);
  if (!id) return;
  try { res.json(await record.recordFor(id)); } catch (err) { fail(res, err); }
});

router.post('/api/me/record/correction', (req, res) => {
  const id = helperId(req, res);
  if (!id) return;
  try { res.status(201).json(record.correct(id, req.body || {})); } catch (err) { fail(res, err); }
});

router.post('/api/record/:helperId/forget', async (req, res) => {
  try { res.json(await record.forget(req.params.helperId, (req.body || {}).confirm_name)); } catch (err) { fail(res, err); }
});

/** Her corrections for the coordinator to review: retire the old fact, keep both, or restore. */
router.get('/api/record/:helperId/corrections', (req, res) => {
  try { res.json({ corrections: record.correctionsFor(req.params.helperId, 20) }); } catch (err) { fail(res, err); }
});

router.post('/api/record/corrections/:id/:action', async (req, res) => {
  const act = { retire: record.retire, restore: record.restore, keep: record.keep }[req.params.action];
  if (!act) return res.status(404).json({ error: 'Unknown action.', code: 'NOT_FOUND' });
  try { res.json(await act(req.params.id)); } catch (err) { fail(res, err); }
});

module.exports = router;
