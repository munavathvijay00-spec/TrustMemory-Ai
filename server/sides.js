/**
 * Both sides of the story: what a household said about a placement and what the helper said
 * about working there, lined up by topic so a coordinator can mediate without taking a side.
 *
 * Hindsight recalls each side's own statements (household:<id> and helper:<id> tags), then one
 * reflect call lines them up by topic with a response schema. Safety signals, coordinator notes,
 * scores and other coordinator-only memory are never part of it. Without Hindsight, local
 * records (household feedback, requests and notes vs. the helper's own call facts) are used and
 * labelled as such. Read-only; results are cached for ten minutes per household and helper.
 */
const db = require('./db');
const hindsight = require('./hindsight');

const CACHE_TTL_MS = 10 * 60 * 1000;
const STATUSES = ['agree', 'differ', 'one_side'];
const TOPICS = ['schedule', 'workload', 'instructions', 'pay', 'respect'];
// Memory that is coordinator-only, derived by the agency, or not a statement by either side.
const EXCLUDED_SOURCES = ['source:safety', 'source:coordinator-note', 'source:coordinator-feedback', 'source:handover',
  'source:ledger', 'source:commitment-outcome', 'source:profile'];
const PRIVATE_TEXT = /safety check|safety flag|coordinator[- ]only|churn|trust score|pay issue/i;
// Agency-written context: coordinator summaries and records are not either side's own words.
const AGENCY_CONTEXT = /Coordinator summary|recorded by the agency|coordinator's (review )?note|written by the agency/i;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.status = 404; this.code = 'NOT_FOUND'; }
}

const cache = new Map(); // "<household>:<helper>" -> { at, result }
function clearCache() { cache.clear(); }

function firstName(name) { return String(name || '').split(' ')[0]; }
function day(v) { return String(v || '').slice(0, 10); }
function clip(v, n = 300) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }

/** Everyone placed at this household, current placement first, then most recent. */
function placedHelpers(householdId) {
  return db.prepare(`SELECT h.id, h.name, p.status, p.started_at, p.ended_at FROM placements p JOIN helpers h ON h.id = p.helper_id
                     WHERE p.household_id = ? ORDER BY (p.status = 'active') DESC, p.started_at DESC`).all(householdId)
    .filter((p, i, all) => all.findIndex(x => x.id === p.id) === i);
}

function isPrivate(m) {
  const tags = m.tags || [];
  return tags.some(t => EXCLUDED_SOURCES.includes(t)) || PRIVATE_TEXT.test(m.text || '') || PRIVATE_TEXT.test(m.context || '')
    || AGENCY_CONTEXT.test(m.context || '');
}

/** Who said it, from how it was retained. Returns 'household', 'helper' or null (unknown: left out). */
function sideOf(m, householdId, helperId) {
  const tags = m.tags || [];
  const ctx = String(m.context || '');
  const kind = (m.metadata && m.metadata.kind) || '';
  if (tags.includes('source:household_feedback') || tags.includes('source:household_notes')) return 'household';
  if (tags.includes('source:helper_correction') || tags.includes('source:voice-call')) return 'helper';
  if (tags.includes('source:self_report')) {
    if (/Written by the household/i.test(ctx)) return 'household';
    if (/Written by the helper|set by the helper/i.test(ctx)) return 'helper';
    const md = m.metadata || {};
    if (md.household_id === householdId && !md.helper_id) return 'household';
    if (md.helper_id === helperId && !md.household_id) return 'helper';
    return null;
  }
  if (kind === 'household' || /^Feedback from /i.test(ctx)) return 'household';
  if (kind === 'helperSaid' || /speaking to the agency|a home-care helper, speaking/i.test(ctx)) return 'helper';
  return null;
}

function normalise(structured) {
  const s = structured || {};
  const topics = (Array.isArray(s.topics) ? s.topics : []).slice(0, 6).map(t => {
    const side = x => ({ says: clip(x && x.says, 300), when: day(x && x.when) });
    const household = side(t && t.household);
    const helper = side(t && t.helper);
    let status = STATUSES.includes(t && t.status) ? t.status : 'one_side';
    if (!household.says || !helper.says) status = 'one_side';
    return { topic: clip(t && t.topic, 40) || 'Other', household, helper, status };
  }).filter(t => t.household.says || t.helper.says);
  const questions = (Array.isArray(s.questions) ? s.questions : []).map(q => clip(q, 240)).filter(Boolean).slice(0, 4);
  return { topics, questions };
}

/* ------------------------------------------------------------------ local fallback */

const TOPIC_WORDS = {
  schedule: /\b(time\w*|late\w*|early|hours?|morning\w*|evening\w*|schedul\w*|start\w*|arriv\w*|leav\w*|shift\w*|school)\b|\d{1,2}:\d{2}/i,
  workload: /\b(work\w*|tasks?|clean\w*|cook\w*|chores?|laundry|dishes|too much|extra)\b/i,
  instructions: /\b(instruct\w*|told|asked|rules?|expect\w*|should|allowed|phone|diet)\b/i,
  pay: /\b(salar\w*|pay\w*|paid|advance|money|wages?)\b/i,
  respect: /\b(shout\w*|respect\w*|rude\w*|polite\w*|patien\w*|kind\w*|behaviou?r|tone|attitude)\b/i,
};

function topicOf(text) {
  return TOPICS.find(t => TOPIC_WORDS[t].test(text)) || null;
}

function localStatements(householdId, helperId) {
  const household = [];
  const helper = [];
  try {
    for (const f of db.prepare('SELECT text, created_at FROM household_feedback WHERE household_id = ? AND (helper_id = ? OR helper_id IS NULL) ORDER BY created_at').all(householdId, helperId)) {
      household.push({ says: f.text, when: day(f.created_at) });
    }
  } catch { /* table appears with the account routes */ }
  try {
    for (const r of db.prepare("SELECT role, text, created_at FROM requests WHERE ((role = 'household' AND person_id = ?) OR (role = 'helper' AND person_id = ?)) AND kind != 'pay_issue' ORDER BY created_at").all(householdId, helperId)) {
      (r.role === 'household' ? household : helper).push({ says: r.text, when: day(r.created_at) });
    }
  } catch { /* table appears with the request routes */ }
  try {
    const hh = db.prepare('SELECT home_routine, home_health, home_preferences FROM households WHERE id = ?').get(householdId) || {};
    for (const v of [hh.home_routine, hh.home_health, hh.home_preferences]) if (v) household.push({ says: v, when: '' });
  } catch { /* columns appear with the request routes */ }
  for (const c of db.prepare('SELECT outcome_json, created_at FROM calls WHERE helper_id = ? ORDER BY created_at').all(helperId)) {
    let o = {};
    try { o = JSON.parse(c.outcome_json || '{}'); } catch { o = {}; }
    if (o.household_id && o.household_id !== householdId) continue;
    for (const f of Array.isArray(o.memory_facts) ? o.memory_facts : []) helper.push({ says: f, when: day(c.created_at) });
  }
  return { household: household.filter(s => !PRIVATE_TEXT.test(s.says)), helper: helper.filter(s => !PRIVATE_TEXT.test(s.says)) };
}

function localCompare(householdName, helperName, householdId, helperId) {
  const { household, helper } = localStatements(householdId, helperId);
  const byTopic = {};
  for (const [sideName, list] of [['household', household], ['helper', helper]]) {
    for (const s of list) {
      const t = topicOf(s.says);
      if (!t) continue;
      byTopic[t] = byTopic[t] || { household: null, helper: null };
      if (!byTopic[t][sideName]) byTopic[t][sideName] = { says: clip(s.says), when: s.when };
    }
  }
  const topics = TOPICS.filter(t => byTopic[t]).map(t => {
    const e = byTopic[t];
    return {
      topic: t.charAt(0).toUpperCase() + t.slice(1),
      household: e.household || { says: '', when: '' },
      helper: e.helper || { says: '', when: '' },
      // Local records cannot judge agreement; with both sides present the coordinator compares them.
      status: e.household && e.helper ? 'both' : 'one_side',
    };
  });
  const questions = topics.slice(0, 4).map(t => t.status === 'both'
    ? `On ${t.topic.toLowerCase()}: what does each of you expect, and what would work for both of you?`
    : `On ${t.topic.toLowerCase()}: only one side has spoken so far. How does ${t.household.says ? firstName(helperName) : 'the ' + householdName} see it?`);
  return { topics, questions };
}

/* ------------------------------------------------------------------ main */

async function compare(householdId, helperId) {
  const hid = String(householdId == null ? '' : householdId).trim();
  if (!hid || !/^[A-Za-z0-9_-]{1,40}$/.test(hid)) throw new ValidationError('Pick the household (household).');
  const hh = db.prepare('SELECT id, name FROM households WHERE id = ?').get(hid);
  if (!hh) throw new NotFoundError('Unknown household.');
  const placed = placedHelpers(hid);
  let helper;
  if (helperId != null && String(helperId).trim()) {
    const id = String(helperId).trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new ValidationError('Pick a valid helper.');
    helper = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(id);
    if (!helper) throw new NotFoundError('Unknown helper.');
    if (!placed.some(p => p.id === id)) throw new ValidationError(`${helper.name} has not been placed with ${hh.name}.`);
  } else {
    if (!placed.length) throw new ValidationError(`No helper has been placed with ${hh.name} yet.`);
    helper = { id: placed[0].id, name: placed[0].name };
  }

  const key = hid + ':' + helper.id;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Object.assign({}, hit.result, { cached: true });

  let result = null;
  if (hindsight.isConfigured()) {
    try {
      const [hhMem, helperMem] = await Promise.all([
        hindsight.recall(`What has the ${hh.name} said about ${helper.name}: schedule, timings, workload, instructions, pay, respect, feedback`, { tags: ['household:' + hid], budget: 'mid', limit: 12, maxTokens: 1500 }),
        hindsight.recall(`What has ${helper.name} said about working at the ${hh.name}: hours, timings, workload, instructions, pay, how she is treated`, { tags: ['helper:' + helper.id], budget: 'mid', limit: 12, maxTokens: 1500 }),
      ]);
      const lines = [];
      for (const m of hhMem.concat(helperMem)) {
        if (isPrivate(m)) continue;
        const side = sideOf(m, hid, helper.id);
        if (!side) continue;
        const line = `[${side === 'household' ? 'HOUSEHOLD' : 'HELPER'}${day(m.mentionedAt) ? ' ' + day(m.mentionedAt) : ''}] ${clip(String(m.text).split(' | ')[0], 280)}`;
        if (!lines.includes(line)) lines.push(line);
      }
      const out = await hindsight.reflect(
        `Line up what the ${hh.name} (the household) said about the placement with what ${helper.name} (the helper) said about working there. ` +
        'Group by topic (for example schedule, workload, instructions, pay, respect). For each topic give what the household says and what the helper says, each with its date, ' +
        'and whether they agree, differ, or only one side has spoken (one_side). Then write 2 to 4 neutral questions the agency coordinator could ask both sides on a mediation call. ' +
        'Rules: never decide who is right, never accuse anyone, use only what each side actually said, leave a side empty if it has not spoken on that topic, ' +
        'and do not use or mention safety flags, scores, or coordinator notes.',
        {
          tags: ['household:' + hid, 'helper:' + helper.id],
          tagsMatch: 'any',
          budget: 'low',
          context: lines.length ? 'Statements on record, labelled by who said them:\n' + lines.join('\n') : undefined,
          responseSchema: {
            type: 'object',
            properties: {
              topics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    topic: { type: 'string' },
                    household: { type: 'object', properties: { says: { type: 'string' }, when: { type: 'string' } } },
                    helper: { type: 'object', properties: { says: { type: 'string' }, when: { type: 'string' } } },
                    status: { type: 'string', enum: STATUSES },
                  },
                  required: ['topic', 'status'],
                },
              },
              questions: { type: 'array', items: { type: 'string' } },
            },
            required: ['topics', 'questions'],
          },
        }
      );
      if (out.structured) {
        const n = normalise(out.structured);
        result = {
          source: 'hindsight', note: '',
          topics: n.topics, questions: n.questions,
          based_on: out.basedOn.memories.filter(m => !isPrivate(m)).slice(0, 12).map(m => ({ text: clip(String(m.text).split(' | ')[0], 240), when: day(m.mentionedAt) })),
        };
      }
    } catch (err) {
      result = null;
      console.warn('[TrustMemory AI] both-sides reflect failed, using local records:', err && err.message);
    }
  }
  if (!result) {
    const local = localCompare(hh.name, helper.name, hid, helper.id);
    result = {
      source: 'local',
      note: 'From local records: household feedback, requests and notes compared with the helper\'s own call notes. Hindsight memory was not used.',
      topics: local.topics, questions: local.questions, based_on: [],
    };
  }
  result = Object.assign({
    household_id: hid, household_name: hh.name, helper_id: helper.id, helper_name: helper.name,
    helpers: placed.map(p => ({ id: p.id, name: p.name, status: p.status })),
    generated_at: new Date().toISOString(),
  }, result);
  cache.set(key, { at: Date.now(), result });
  return result;
}

module.exports = { ValidationError, NotFoundError, STATUSES, compare, placedHelpers, sideOf, isPrivate, normalise, clearCache };
