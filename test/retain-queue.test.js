require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const hindsight = require('../server/hindsight');
const retainQueue = require('../server/retain-queue');

function makeDue() {
  db.prepare("UPDATE retain_jobs SET next_attempt_at = ? WHERE status = 'pending'").run(new Date(Date.now() - 1000).toISOString());
}

test('retain-queue: a failed retain stays pending with backoff, then succeeds on retry', async () => {
  const calls = [];
  let fail = true;
  hindsight.isConfigured = () => true;
  hindsight.retain = async (items) => { calls.push(items); if (fail) throw new Error('503 from Hindsight'); return { ok: true }; };

  const id = retainQueue.enqueue([{ content: 'Anita agreed to take the earlier bus.' }], { helperId: 'anita', callId: 'call_1', error: 'timeout' });
  assert.equal(retainQueue.pendingCount(), 1);
  assert.deepEqual(await retainQueue.runOnce(), { attempted: 0 }, 'not due yet, so nothing is attempted');

  makeDue();
  assert.deepEqual(await retainQueue.runOnce(), { attempted: 1 });
  let job = db.prepare('SELECT * FROM retain_jobs WHERE id = ?').get(id);
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 2);
  assert.equal(job.last_error, '503 from Hindsight');
  assert.ok(job.next_attempt_at > new Date().toISOString(), 'next attempt is scheduled in the future');

  fail = false;
  makeDue();
  await retainQueue.runOnce();
  job = db.prepare('SELECT * FROM retain_jobs WHERE id = ?').get(id);
  assert.equal(job.status, 'done');
  assert.equal(job.last_error, null);
  assert.equal(retainQueue.pendingCount(), 0);
  assert.deepEqual(calls[1], [{ content: 'Anita agreed to take the earlier bus.' }]);
  assert.ok(db.prepare("SELECT 1 FROM activity WHERE text LIKE '%Retry succeeded: call call_1%'").get());
});

test('retain-queue: gives up after the maximum attempts and does nothing while Hindsight is unconfigured', async () => {
  hindsight.isConfigured = () => true;
  hindsight.retain = async () => { throw new Error('still down'); };
  const id = retainQueue.enqueue([{ content: 'x' }], { helperId: 'priya', callId: 'call_2' });
  for (let i = 0; i < 6; i++) { makeDue(); await retainQueue.runOnce(); }
  assert.equal(db.prepare('SELECT status FROM retain_jobs WHERE id = ?').get(id).status, 'failed');

  hindsight.isConfigured = () => false;
  retainQueue.enqueue([{ content: 'y' }]);
  makeDue();
  assert.deepEqual(await retainQueue.runOnce(), { attempted: 0 });
});
