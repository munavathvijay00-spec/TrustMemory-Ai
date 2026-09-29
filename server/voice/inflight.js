/**
 * In-flight work that must not be lost on shutdown: completeSession saves and the background
 * Hindsight retains they start. drain() waits for both (up to a timeout) and hands any retain
 * still pending to the durable retry queue, so a restart never drops a call's memory.
 */
const retainQueue = require('../retain-queue');

const SAVES = new Set();
const RETAINS = new Set();

/** Track a completeSession save until it settles. */
function trackSave(promise) {
  SAVES.add(promise);
  const done = () => { SAVES.delete(promise); };
  promise.then(done, done);
  return promise;
}

/**
 * Register a background retain before it starts. The caller passes the entry's promise to
 * settleRetain() once the retain chain exists; entry.handedOff tells the chain the items are
 * already in the retry queue.
 */
function startRetain({ items, helperId = null, callId = null, heldJob = null }) {
  const entry = { items, helperId, callId, heldJob, handedOff: false, jobId: null, promise: null };
  RETAINS.add(entry);
  return entry;
}

function settleRetain(entry, promise) {
  entry.promise = promise;
  const done = () => { RETAINS.delete(entry); };
  promise.then(done, done);
  return promise;
}

function pending() {
  return { saves: SAVES.size, retains: RETAINS.size };
}

/**
 * Wait up to timeoutMs for saves and retains to settle (a save that finishes may start a
 * retain, so this loops until both sets are empty or time runs out). Any retain still pending
 * is written to the retain queue. Returns what happened.
 */
async function drain({ timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while ((SAVES.size || RETAINS.size) && Date.now() < deadline) {
    const work = [...SAVES].concat([...RETAINS].map(r => r.promise).filter(Boolean));
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, deadline - Date.now())); });
    await Promise.race([Promise.allSettled(work), timeout]);
    clearTimeout(timer);
    // Let settle handlers (which remove entries from the sets) run before checking again.
    await new Promise(resolve => setImmediate(resolve));
  }
  const jobs = [];
  for (const entry of RETAINS) {
    entry.handedOff = true;
    const why = 'Server shut down before Hindsight confirmed the retain.';
    entry.jobId = entry.heldJob ? retainQueue.escalate(entry.heldJob, why) : retainQueue.enqueue(entry.items, { helperId: entry.helperId, callId: entry.callId, error: why });
    jobs.push(entry.jobId);
  }
  RETAINS.clear();
  return { saves_unfinished: SAVES.size, retains_handed_off: jobs.length, jobs };
}

module.exports = { trackSave, startRetain, settleRetain, pending, drain };
