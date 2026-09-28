/**
 * Request validation for the endpoints that take user input.
 *
 * Mounted before the routers, keyed by "METHOD path". A rule returns null when the
 * request is acceptable, or { status, error, code } to reject it. Routes without a
 * rule pass straight through, so the routers keep their own checks as a second line.
 */
const db = require('./db');

const SCENARIOS = ['coaching_call', 'followup_call', 'household_checkin', 'escalation_call'];
const VERDICTS = ['approve', 'correct', 'reject'];
const SESSION_ID = /^vs_[0-9a-f]{12}$/;

function bad(error) { return { status: 400, error, code: 'VALIDATION' }; }
function given(v) { return v !== undefined && v !== null && v !== ''; }

/** Accepts integers and integer strings ("3"), since form values often arrive as strings. */
function asInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10);
  return NaN;
}

const RULES = {
  'POST /api/voice/session': (req) => {
    const { helper_id, scenario, late_count } = req.body || {};
    if (given(helper_id)) {
      if (typeof helper_id !== 'string' || helper_id.length > 64) return bad('helper_id must be a string.');
      if (!db.prepare('SELECT 1 AS ok FROM helpers WHERE id = ?').get(helper_id)) {
        return { status: 404, error: `Unknown helper "${helper_id}".`, code: 'NOT_FOUND' };
      }
    }
    if (given(scenario) && !SCENARIOS.includes(scenario)) return bad('scenario must be one of: ' + SCENARIOS.join(', ') + '.');
    if (given(late_count)) {
      const n = asInt(late_count);
      if (!Number.isInteger(n) || n < 0 || n > 20) return bad('late_count must be a whole number from 0 to 20.');
    }
    return null;
  },

  'POST /api/voice/turn': (req) => {
    const { session_id, text } = req.body || {};
    if (typeof session_id !== 'string' || !SESSION_ID.test(session_id)) return bad('session_id is missing or malformed.');
    if (typeof text !== 'string' || !text.trim()) return bad('text is required.');
    if (text.length > 2000) return bad('text must be at most 2000 characters.');
    return null;
  },

  'POST /api/memory/feedback': (req) => {
    const { verdict, note } = req.body || {};
    if (!VERDICTS.includes(verdict)) return bad('verdict must be approve, correct or reject.');
    if (given(note) && (typeof note !== 'string' || note.length > 500)) return bad('note must be text of at most 500 characters.');
    return null;
  },

  'GET /api/memory/recall': (req) => {
    const q = req.query.q;
    if (typeof q !== 'string' || !q.trim()) return bad('Missing query "q".');
    if (q.length > 300) return bad('q must be at most 300 characters.');
    return null;
  },
};

function validate(req, res, next) {
  const rule = RULES[req.method + ' ' + req.path];
  if (!rule) return next();
  const problem = rule(req);
  if (!problem) return next();
  return res.status(problem.status).json({ error: problem.error, code: problem.code });
}

module.exports = { validate, RULES, SCENARIOS, VERDICTS };
