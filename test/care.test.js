const { startServer } = require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const care = require('../server/care');
const db = require('../server/db');
const { HINDSIGHT_SEED_ITEMS } = require('../server/seed/care-seed');

let srv;
test.before(async () => { srv = await startServer(createApp({ port: 0 })); });
test.after(() => srv.close());

function openFlagFor(helperId) {
  return db.prepare("SELECT * FROM safety_flags WHERE helper_id = ? AND status = 'open'").get(helperId);
}

test('care: one mention is recorded but does not raise a safety check', () => {
  const flag = care.onCall({ helper: { id: 'meena', name: 'Meena Joshi' }, outcome: { safety_concerns: [{ kind: 'excess_hours', evidence: 'I worked until eleven at night on Saturday.' }] }, callId: 'c_meena_1' });
  assert.equal(flag, null);
  assert.equal(care.forHelper('meena').signals.length, 1);
  assert.equal(openFlagFor('meena'), undefined);
});

test('care: a second call with pay or hours concerns within 60 days raises one flag', () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE text LIKE '%Safety check needed: Meena%'").get().n;
  const flag = care.onCall({ helper: { id: 'meena', name: 'Meena Joshi' }, outcome: { safety_concerns: [{ kind: 'unpaid_pay', evidence: 'They have not paid me for this month yet.' }] }, callId: 'c_meena_2' });
  assert.ok(flag, 'pay and hours concerns on two different calls add up');
  assert.deepEqual([...flag.kinds].sort(), ['excess_hours', 'unpaid_pay']);
  assert.match(flag.summary, /flag for a human to check/);
  assert.equal(flag.timeline.length, 2);
  // A third call updates the same open flag instead of raising another.
  care.onCall({ helper: { id: 'meena', name: 'Meena Joshi' }, outcome: { safety_concerns: [{ kind: 'unpaid_pay', evidence: 'Still not paid.' }] }, callId: 'c_meena_3' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM safety_flags WHERE helper_id = 'meena'").get().n, 1);
  const after = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE text LIKE '%Safety check needed: Meena%'").get().n;
  assert.equal(after, before + 1, 'the coordinator is told once');
});

test('care: physical harm raises a flag from a single call; unknown kinds and empty evidence are dropped', () => {
  const flag = care.onCall({ helper: { id: 'anita', name: 'Anita Verma' }, outcome: { safety_concerns: [
    { kind: 'physical_harm', evidence: 'He pushed me when I was late.' },
    { kind: 'gossip', evidence: 'not a safety kind' },
    { kind: 'verbal_abuse', evidence: '   ' },
  ] }, callId: 'c_anita_1' });
  assert.ok(flag);
  assert.deepEqual(flag.kinds, ['physical_harm']);
  assert.equal(flag.household_id, 'h107', 'the active placement is attached');
  assert.equal(care.forHelper('anita').signals.length, 1);
});

test('care: seeded Lakshmi history is below the threshold until one more mention', () => {
  assert.equal(care.assess('lakshmi'), null, 'one mention inside 60 days, one outside');
  assert.equal(care.forHelper('lakshmi').signals.length, 2);
  const flag = care.onCall({ helper: { id: 'lakshmi', name: 'Lakshmi Rao' }, outcome: { safety_concerns: [{ kind: 'unpaid_pay', evidence: 'Salary is late again.' }] }, callId: 'c_lakshmi_live' });
  assert.ok(flag);
  assert.equal(flag.timeline.length, 3, 'the timeline shows every mention, including the older one');
  assert.equal(HINDSIGHT_SEED_ITEMS.length, 2);
  assert.ok(HINDSIGHT_SEED_ITEMS.every(i => i.tags.includes('helper:lakshmi') && i.documentId && i.timestamp));
});

test('care: safety routes list open flags, validate and record the review', async () => {
  const list = await srv.request('GET', '/api/care/safety');
  assert.equal(list.status, 200);
  const flag = list.body.open.find(f => f.helper_id === 'meena');
  assert.ok(flag);
  assert.equal((await srv.request('GET', '/api/care/safety/nobody')).status, 404);

  const short = await srv.request('POST', `/api/care/safety/${flag.id}/review`, { body: { note: 'ok' } });
  assert.equal(short.status, 400);
  assert.equal(short.body.code, 'VALIDATION');
  assert.equal((await srv.request('POST', '/api/care/safety/flag_nope/review', { body: { note: 'Checked with her.' } })).status, 404);

  const done = await srv.request('POST', `/api/care/safety/${flag.id}/review`, { body: { note: 'Called Meena; salary paid today. Checking again next week.' } });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'reviewed');
  assert.equal((await srv.request('POST', `/api/care/safety/${flag.id}/review`, { body: { note: 'Again.' } })).status, 400, 'a flag is reviewed once');
  const after = await srv.request('GET', '/api/care/safety');
  assert.ok(!after.body.open.some(f => f.id === flag.id));
});

test('care: handover brief falls back to local records, never names previous helpers, and validates input', async () => {
  const r = await srv.request('GET', '/api/care/handover/h104?helper=anita&lang=en');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'local');
  assert.match(r.body.note, /local records/);
  assert.match(r.body.sections.what_went_wrong_before.join(' '), /3 earlier placements/);
  const all = JSON.stringify(r.body.sections);
  for (const name of ['Sunita', 'Kavita', 'Fatima']) assert.ok(!all.includes(name), name + ' is not named');
  assert.equal(db.prepare("SELECT 1 FROM activity WHERE text LIKE '%Handover brief: Anita Verma for Iyer Residence%'").get(), undefined, 'a preview writes nothing');
  const given = await srv.request('POST', '/api/care/handover/h104/given', { body: { helper: 'anita' } });
  assert.equal(given.status, 200, given.text);
  assert.ok(db.prepare("SELECT 1 FROM activity WHERE text LIKE '%Handover brief: Anita Verma for Iyer Residence%'").get(), 'recorded once confirmed');
  assert.equal((await srv.request('POST', '/api/care/handover/h104/given', { body: {} })).status, 400);

  assert.equal((await srv.request('GET', '/api/care/handover/h104?helper=anita&lang=fr')).status, 400);
  assert.equal((await srv.request('GET', '/api/care/handover/h104')).status, 400);
  assert.equal((await srv.request('GET', '/api/care/handover/h999?helper=anita')).status, 404);
  assert.equal((await srv.request('GET', '/api/care/handover/h104?helper=nobody')).status, 404);
});

test('care: the after-call hook stores concerns from a saved call', async () => {
  const hooks = require('../server/voice/hooks');
  hooks.emitCallSaved(
    { helper: { id: 'priya', name: 'Priya Nair' }, household: { id: 'h102' }, transcript: [] },
    { call_id: 'browser_hooktest', outcome: { safety_concerns: [{ kind: 'denied_food_or_rest', evidence: 'I do not get a lunch break.' }] } }
  );
  await new Promise(r => setImmediate(r));
  const s = care.forHelper('priya').signals;
  assert.equal(s.length, 1);
  assert.equal(s[0].call_id, 'browser_hooktest');
  assert.equal(s[0].household_id, 'h102');
});

test('care UI: the safety card, helper timeline and handover brief render from API data', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ui = path.resolve(__dirname, '../TrustMemory-AI-modular/js');
  const ctx = { console, Date, JSON, Math, Promise, encodeURIComponent, fetch: () => new Promise(() => {}), document: { getElementById: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ui, 'format-utils.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ui, 'ui/care-ui.js'), 'utf8'), ctx);
  vm.runInContext("var S = {helpers: [{id: 'lakshmi', name: 'Lakshmi Rao', skills: ['cleaning']}], households: [{id: 'h101', name: 'Sharma Residence', requirement: 'cleaning'}]}; var route = {page: 'dashboard'};", ctx);

  assert.equal(vm.runInContext('careSafetyCard()', ctx), '', 'no card while there are no open flags');
  const flag = { id: 'flag_1', helper_id: 'lakshmi', helper_name: 'Lakshmi Rao', household_name: 'Sharma Residence', kind_labels: ['pay late or unpaid'], reason: 'She described pay late or unpaid on 2 different calls in 60 days.', summary: 'Late salary <again>.', summary_source: 'hindsight', timeline: [{ said_at: '2026-08-29', label: 'pay late or unpaid', evidence: 'Salary is late.' }] };
  ctx.testFlag = flag;
  vm.runInContext('careSafety = {open: [testFlag]}; careSafetyAt = Date.now();', ctx);
  const card = vm.runInContext('careSafetyCard()', ctx);
  assert.match(card, /Safety check needed/);
  assert.match(card, /Late salary &lt;again&gt;/, 'model text is escaped');
  assert.match(card, /dashRing\('lakshmi'\)/);

  vm.runInContext("careHelperSafety.lakshmi = {loading: false, at: Date.now(), data: {signals: [], flags: []}}", ctx);
  assert.match(vm.runInContext("careHelperPanel('lakshmi')", ctx), /No safety concerns raised on any call/);

  vm.runInContext("careBriefState('h101').data = {lang: 'hi', helper_name: 'Lakshmi Rao', household_name: 'Sharma Residence', source: 'hindsight', mental_model_used: true, note: '', cited: [{text: 'x', when: '2026-09-01'}], sections: {routine: ['सुबह 9 बजे'], health_and_care: [], preferences: [], what_went_wrong_before: [], first_week_tips: []}}", ctx);
  const panel = vm.runInContext("careHouseholdPanel('h101')", ctx);
  assert.match(panel, /Handover brief for the next helper/);
  assert.match(panel, /रोज़ का काम/, 'section titles follow the brief language');
  assert.match(panel, /wa\.me\/\?text=/);
});

test('care: name scrubbing hides previous helpers but leaves family members who share a first name', () => {
  // Priya Nair was placed at h105 (Gupta), so "Priya" alone is scrubbed there; "Mrs Priya Sharma" is family.
  const out = care.scrubNames('Mrs Priya Sharma works from home. Priya Nair left after six weeks. Priya was often late.', 'radha', 'h105');
  assert.match(out, /Mrs Priya Sharma/);
  assert.doesNotMatch(out, /Priya Nair|Priya was/);
  // At a household where she never worked, her name is left alone.
  assert.match(care.scrubNames('Priya helps with homework.', 'radha', 'h101'), /Priya helps/);
});

test('care: a reviewed flag is not reopened by an unrelated remark on a later call', () => {
  care.recordSignals({ helperId: 'kavita', callId: 'kv1', concerns: [{ kind: 'excess_hours', evidence: 'I worked till eleven at night again.' }] });
  care.recordSignals({ helperId: 'kavita', callId: 'kv2', concerns: [{ kind: 'excess_hours', evidence: 'Every day now I finish after ten.' }] });
  const flag = care.evaluate('kavita', { latestCallId: 'kv2' });
  assert.ok(flag, 'two calls about hours raise a flag');
  care.review(flag.id, 'Spoke to Kavita and the family; hours agreed in writing.');
  care.recordSignals({ helperId: 'kavita', callId: 'kv3', concerns: [{ kind: 'other', evidence: 'The bus was crowded.' }] });
  assert.equal(care.evaluate('kavita', { latestCallId: 'kv3' }), null, 'reviewed concerns do not count again');
});
