/**
 * Friction check before a placement: read both people's memory (the helper's constraints and
 * the household's expectations) and name the likely clashes before day one, each with the
 * dated facts behind it and one practical fix to agree up front.
 *
 * Read only: nothing is retained. Hindsight recall + one reflect with a response schema; when
 * Hindsight is unconfigured or fails, a small comparison of the local profiles, labelled so.
 */
const db = require('./db');
const hindsight = require('./hindsight');

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_POINTS = 4;
const cache = new Map(); // "<helper>|<household>" -> { at, result }

class FrictionError extends Error {
  constructor(message, status = 400, code = 'VALIDATION') { super(message); this.status = status; this.code = code; }
}

function firstName(name) { return String(name || '').split(' ')[0]; }
function day(s) { return s ? String(s).slice(0, 10) : ''; }
function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function parseList(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }

function loadPair(helperId, householdId) {
  if (!helperId || !householdId || typeof helperId !== 'string' || typeof householdId !== 'string') {
    throw new FrictionError('Pick a helper and a household (helper, household).');
  }
  const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get(helperId);
  if (!helper) throw new FrictionError('Unknown helper.', 404, 'NOT_FOUND');
  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
  if (!household) throw new FrictionError('Unknown household.', 404, 'NOT_FOUND');
  return { helper, household };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          helper_fact: { type: 'string' },
          helper_date: { type: 'string' },
          household_fact: { type: 'string' },
          household_date: { type: 'string' },
          clash: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['helper_fact', 'household_fact', 'clash', 'fix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['points', 'summary'],
};

function factLine(f) { return `- (${day(f.mentionedAt) || 'undated'}) ${String(f.text).split(' | ')[0]}`; }

function cleanPoints(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(p => p && p.helper_fact && p.household_fact && p.clash)
    .slice(0, MAX_POINTS)
    .map(p => ({
      helper_fact: clip(p.helper_fact, 300),
      helper_date: day(p.helper_date),
      household_fact: clip(p.household_fact, 300),
      household_date: day(p.household_date),
      clash: clip(p.clash, 300),
      fix: clip(p.fix, 300),
    }));
}

/** Local comparison when memory is unavailable: role, schedule and availability from the profiles. */
function localCheck(helper, household) {
  const points = [];
  const skills = parseList(helper.skills);
  const hSkills = skills.length ? skills : [helper.role];
  const need = household.need;
  const schedule = String(household.schedule || '');
  const availability = String(helper.availability || '');
  const label = r => String(r || '').replace('_', ' ');
  if (need && !hSkills.includes(need)) {
    points.push({ helper_fact: `${helper.name} lists ${hSkills.map(label).join(', ')}.`, helper_date: '', household_fact: `${household.name} needs ${label(need)}.`, household_date: '', clash: 'The household needs a kind of work she has not listed.', fix: `Ask ${firstName(helper.name)} about her ${label(need)} experience before offering the placement.` });
  }
  if (/live-?in/i.test(schedule) && availability && !/live-?in/i.test(availability)) {
    points.push({ helper_fact: `${helper.name} is available ${availability.toLowerCase()}.`, helper_date: '', household_fact: `${household.name} wants a live-in helper.`, household_date: '', clash: 'Live-in work is not in her stated availability.', fix: 'Confirm whether she can live in before proceeding.' });
  }
  if (/part-?time/i.test(availability) && /full|9\s*am|8\s*am/i.test(schedule)) {
    points.push({ helper_fact: `${helper.name} is available part-time.`, helper_date: '', household_fact: `${household.name}'s schedule: ${schedule}.`, household_date: '', clash: 'The household expects full days.', fix: 'Agree the exact hours in writing before day one.' });
  }
  if (/weekend/i.test(availability) && /weekday/i.test(schedule)) {
    points.push({ helper_fact: `${helper.name} is available on weekends.`, helper_date: '', household_fact: `${household.name}'s schedule: ${schedule}.`, household_date: '', clash: 'The household needs weekday help.', fix: 'Check whether she can take weekdays.' });
  }
  return {
    points: points.slice(0, MAX_POINTS),
    summary: points.length ? `${points.length} possible friction point${points.length === 1 ? '' : 's'} from the profiles on file.` : 'No clear friction on record in the profiles on file.',
  };
}

/**
 * Likely friction between one helper and one household. `hs` is the Hindsight client (injectable
 * for tests). Returns { helper_id, household_id, source, points, summary, based_on, cached }.
 */
async function check(helperId, householdId, { hs = hindsight, now = Date.now() } = {}) {
  const { helper, household } = loadPair(helperId, householdId);
  const key = helper.id + '|' + household.id;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return Object.assign({}, hit.result, { cached: true });

  const base = { helper_id: helper.id, helper_name: helper.name, household_id: household.id, household_name: household.name };
  let result = null;
  if (hs.isConfigured()) {
    try {
      const [helperFacts, householdFacts] = await Promise.all([
        hs.recall(`${helper.name}: constraints on time and travel, school run, commute, health, times she cannot work or be called, work she said she cannot do`, { tags: ['helper:' + helper.id], budget: 'low', limit: 8 }),
        hs.recall(`${household.name}: expectations of a helper, start time, schedule, house rules, complaints and why earlier placements ended`, { tags: ['household:' + household.id], budget: 'low', limit: 8 }),
      ]);
      const out = await hs.reflect(
        `Before placing ${helper.name} with the ${household.name}, list up to ${MAX_POINTS} likely friction points between THIS helper and THIS household. ` +
        'For each: one fact about her (with its date) and one fact about the household (with its date) that clash, why they clash in one sentence, and one practical, respectful fix to agree before her first day. ' +
        'Use only facts present in memory; do not invent details, times or names. The helper fact must be about this helper herself and the household fact about this household itself; skip a point otherwise. ' +
        'Never judge either person. The summary is one plain sentence naming the main risk. If nothing clearly clashes, return no points and say "No clear friction on record."',
        {
          tags: ['helper:' + helper.id, 'household:' + household.id],
          tagsMatch: 'any',
          budget: 'low',
          context: [`What the agency remembers about ${helper.name}:`, ...helperFacts.map(factLine), '', `What the agency remembers about the ${household.name}:`, ...householdFacts.map(factLine)].join('\n'),
          responseSchema: RESPONSE_SCHEMA,
        }
      );
      const s = out.structured || {};
      const points = cleanPoints(s.points);
      // Prefer what reflect says it used; when it returns none, show the facts recalled from both records.
      const used = ((out.basedOn && out.basedOn.memories) || []).length ? out.basedOn.memories : helperFacts.concat(householdFacts);
      result = Object.assign(base, {
        source: 'hindsight',
        points,
        summary: clip(s.summary || (points.length ? '' : 'No clear friction on record.'), 400),
        recalled: { helper: helperFacts.length, household: householdFacts.length },
        based_on: used.slice(0, 12).map(m => ({ text: String(m.text).split(' | ')[0], when: day(m.mentionedAt), tags: m.tags || [] })),
      });
    } catch (err) {
      result = null;
      base.note = 'Hindsight could not be reached (' + clip(err.message, 100) + '); showing a check from local records.';
    }
  }
  if (!result) {
    const local = localCheck(helper, household);
    result = Object.assign(base, { source: 'local', points: local.points, summary: local.summary, recalled: { helper: 0, household: 0 }, based_on: [] });
    result.note = result.note || 'From local records: Hindsight memory is not available, so this compares the profiles on file.';
  }
  // A fallback caused by a Hindsight failure is not cached, so the next check tries memory again.
  if (result.source === 'hindsight' || !hs.isConfigured()) cache.set(key, { at: now, result });
  return Object.assign({}, result, { cached: false });
}

function clearCache() { cache.clear(); }

module.exports = { check, localCheck, clearCache, FrictionError, CACHE_TTL_MS };
