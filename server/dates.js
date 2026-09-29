/**
 * Calendar dates as the agency sees them. The agency is in Hyderabad, but the server may run in
 * UTC, where toISOString() is still "yesterday" between 00:00 and 05:30 IST.
 */
const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD in India for the given moment (default: now). */
function istDate(d = new Date()) { return IST.format(d); }

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30, which Date rolls over). */
function isRealDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

module.exports = { istDate, isRealDate };
