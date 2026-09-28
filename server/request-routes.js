/**
 * Requests and preferences routes.
 *
 *   /api/me/requests, /api/me/preferences, /api/me/household-notes, /api/me/festivals
 *     the signed-in helper's or household's own (access control lets them reach /api/me/*)
 *   /api/requests, /api/requests/:id/ack, /api/helper-preferences
 *     coordinator only (everything outside /api/me is coordinator-only when sign-in is on)
 */
const express = require('express');
const requests = require('./requests');

const router = express.Router();

function fail(res, err) {
  if (err instanceof requests.ValidationError) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
  console.error('[TrustMemory AI] request route failed:', err && err.message);
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL' });
}

/** The signed-in helper or household. With sign-in off (tests), ?as=helper:<id> stands in for one. */
function who(req, res, role) {
  const a = req.account;
  let r = a && a.role;
  let id = a && a.person_id;
  if (!a && req.authOff && typeof req.query.as === 'string' && /^(helper|household):[\w-]+$/.test(req.query.as)) [r, id] = req.query.as.split(':');
  if (!r || !id || (r !== 'helper' && r !== 'household')) { res.status(403).json({ error: 'This is for helper and household accounts.', code: 'FORBIDDEN' }); return null; }
  if (role && r !== role) { res.status(403).json({ error: 'This is for ' + role + ' accounts.', code: 'FORBIDDEN' }); return null; }
  return { role: r, id };
}

/* ------------------------------------------------------------------ the person's own */

router.get('/api/me/requests', (req, res) => {
  const w = who(req, res);
  if (!w) return;
  res.json({ requests: requests.listFor(w.role, w.id), kinds: requests.KINDS[w.role] });
});

router.post('/api/me/requests', (req, res) => {
  const w = who(req, res);
  if (!w) return;
  try { res.status(201).json(requests.createRequest(w.role, w.id, req.body || {})); } catch (err) { fail(res, err); }
});

router.get('/api/me/preferences', (req, res) => {
  const w = who(req, res, 'helper');
  if (!w) return;
  res.json(requests.getPreferences(w.id) || {});
});

router.put('/api/me/preferences', (req, res) => {
  const w = who(req, res, 'helper');
  if (!w) return;
  try { res.json(requests.savePreferences(w.id, req.body || {})); } catch (err) { fail(res, err); }
});

router.get('/api/me/household-notes', (req, res) => {
  const w = who(req, res, 'household');
  if (!w) return;
  res.json(requests.getHouseholdNotes(w.id) || {});
});

router.put('/api/me/household-notes', (req, res) => {
  const w = who(req, res, 'household');
  if (!w) return;
  try { res.json(requests.saveHouseholdNotes(w.id, req.body || {})); } catch (err) { fail(res, err); }
});

router.get('/api/me/festivals', (req, res) => {
  const w = who(req, res);
  if (!w) return;
  res.json({ festivals: requests.festivalsAhead(60) });
});

/* ------------------------------------------------------------------ coordinator */

router.get('/api/requests', (req, res) => {
  res.json({ requests: requests.listAll({ status: req.query.status }) });
});

router.post('/api/requests/:id/ack', (req, res) => {
  try {
    const r = requests.acknowledge(req.params.id, (req.body || {}).note);
    if (!r) return res.status(404).json({ error: 'No request with that id.', code: 'NOT_FOUND' });
    res.json({ request: r });
  } catch (err) { fail(res, err); }
});

router.get('/api/helper-preferences', (req, res) => {
  res.json({ preferences: requests.allPreferences() });
});

module.exports = router;
