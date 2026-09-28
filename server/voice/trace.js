/**
 * Step timings for a voice session. Every session keeps trace: [{ step, ms, ok, detail }],
 * capped so a long call cannot grow it without bound.
 */
const TRACE_CAP = 60;

/** Append one timing entry (ms measured from t0) to `trace`, and to `also` when given. Returns the entry. */
function record(trace, step, t0, ok, detail, also) {
  const entry = { step, ms: Math.max(0, Date.now() - t0), ok: Boolean(ok) };
  if (detail !== undefined && detail !== null && detail !== '') entry.detail = String(detail).slice(0, 200);
  if (trace) {
    trace.push(entry);
    if (trace.length > TRACE_CAP) trace.splice(0, trace.length - TRACE_CAP);
  }
  if (also) also.push(entry);
  return entry;
}

module.exports = { record, TRACE_CAP };
