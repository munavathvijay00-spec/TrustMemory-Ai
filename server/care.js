/**
 * Care features built on memory across calls and across people.
 *
 * Safety signals: a helper rarely says "I am being mistreated" in one call. She mentions a late
 * salary one week, long hours another. Each call's extraction lists safety concerns in her own
 * words; this module stores them, looks across her calls, and raises a private flag for the
 * coordinator when a pattern appears (the same kind on 2+ calls in 60 days, or pay/hours/
 * confinement/abuse together), or at once for physical harm or confinement. A flag is for a
 * human to check; it is never a finding about the household, and the household never sees it.
 *
 * Handover brief: when a placement ends, the next helper starts knowing nothing. The brief turns
 * the household's memory into a short spoken briefing (routine, health, preferences, what went
 * wrong before, first-week tips) without blame and without anything private about past helpers.
 */
const { istDate } = require('./dates');
const db = require('./db');
const hindsight = require('./hindsight');
const groq = require('./groq');
const retainQueue = require('./retain-queue');
const hooks = require('./voice/hooks');
const { SAFETY_KINDS } = require('./voice/extraction');

const WINDOW_DAYS = 60;
const MIN_CALLS = 2;
const IMMEDIATE = ['physical_harm', 'confinement'];
// Kinds that add up across calls even when they differ (late pay one call, long hours the next).
const PATTERN_KINDS = ['unpaid_pay', 'excess_hours', 'confinement', 'verbal_abuse', 'physical_harm', 'denied_food_or_rest'];
const KIND_LABELS = {
  unpaid_pay: 'pay late or unpaid',
  excess_hours: 'excessive hours',
  confinement: 'not allowed to leave',
  verbal_abuse: 'shouted at or insulted',
  physical_harm: 'physical harm',
  denied_food_or_rest: 'denied food or rest',
  other: 'other concern',
};
const LANGS = ['en', 'hi', 'te'];
const SECTIONS = ['routine', 'health_and_care', 'preferences', 'what_went_wrong_before', 'first_week_tips'];

db.exec(`
  CREATE TABLE IF NOT EXISTS safety_signals (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    household_id TEXT,
    call_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    evidence TEXT NOT NULL,
    said_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'call',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS safety_flags (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    household_id TEXT,
    kinds TEXT NOT NULL,
    reason TEXT NOT NULL,
    summary TEXT NOT NULL,
    summary_source TEXT NOT NULL DEFAULT 'local',
    memory_evidence TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    review_note TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function nowSql() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
function dayOf(date) { return istDate(new Date(date)); }
function daysAgoDate(n) { return dayOf(Date.now() - n * 86400000); }
/** Same arithmetic as the Hindsight seed (local date, 10:00), so local rows and memory agree on the day. */
function seedDay(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d.toISOString().slice(0, 10); }
function newId(prefix) { return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
function firstName(name) { return String(name || '').split(' ')[0]; }

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'VALIDATION'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.status = 404; this.code = 'NOT_FOUND'; }
}

// Seed: Lakshmi mentioned a late salary twice before this feature existed. One mention is outside
// the 60-day window, so no flag was raised; a further mention on a live call raises it.
const SEED_SIGNALS = [
  { id: 'sig_seed_lakshmi_1', days: 75, evidence: 'My salary for last month came almost two weeks late. Madam said there was some problem with the bank.' },
  { id: 'sig_seed_lakshmi_2', days: 30, evidence: 'This month also the salary is late. I had to borrow money for my son\'s school fees.' },
];
if (db.prepare("SELECT 1 FROM helpers WHERE id = 'lakshmi'").get()) {
  for (const s of SEED_SIGNALS) {
    // Re-dated on every start so "30 days ago" stays 30 days ago however old the database is.
    db.prepare(`INSERT INTO safety_signals (id, helper_id, household_id, call_id, kind, evidence, said_at, source, created_at)
                VALUES (?, 'lakshmi', 'h101', ?, 'unpaid_pay', ?, ?, 'seed', ?)
                ON CONFLICT(id) DO UPDATE SET said_at = excluded.said_at`)
      .run(s.id, 'seed_call_' + s.id.slice(-1), s.evidence, seedDay(s.days), '2000-01-01 00:00:00');
  }
}

function activity(agent, text) {
  db.prepare('INSERT INTO activity (id, agent, text, created_at) VALUES (?, ?, ?, ?)').run(newId('act_'), agent, text, nowSql());
}

/** Retain one dated fact in the background; queued for retry on failure, never blocks. */
function remember({ content, context, documentId, tags, metadata, helperId }) {
  if (!hindsight.isConfigured()) return;
  const item = { content, context, documentId, timestamp: new Date().toISOString(), metadata, tags };
  hindsight.retain([item]).catch(err => retainQueue.enqueue([item], { helperId, callId: documentId, error: err.message }));
}

function activeHouseholdOf(helperId) {
  const row = db.prepare("SELECT household_id FROM placements WHERE helper_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").get(helperId);
  return row ? row.household_id : null;
}

/* ------------------------------------------------------------------ safety signals */

function signalsFor(helperId, { withinDays } = {}) {
  const since = withinDays ? daysAgoDate(withinDays) : '0000-00-00';
  return db.prepare('SELECT * FROM safety_signals WHERE helper_id = ? AND said_at >= ? ORDER BY said_at, created_at').all(helperId, since);
}

/** Store what she said on this call. Unknown kinds and empty evidence are dropped. */
function recordSignals({ helperId, householdId = null, callId, concerns, saidAt = dayOf(Date.now()) }) {
  let n = 0;
  for (const c of Array.isArray(concerns) ? concerns : []) {
    const evidence = String((c && c.evidence) || '').trim().slice(0, 300);
    if (!c || !SAFETY_KINDS.includes(c.kind) || !evidence) continue;
    db.prepare(`INSERT INTO safety_signals (id, helper_id, household_id, call_id, kind, evidence, said_at, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'call', ?)`)
      .run(newId('sig_'), helperId, householdId, callId, c.kind, evidence, saidAt, nowSql());
    n += 1;
  }
  return n;
}

/**
 * Does the helper's recent history call for a human check? Returns null or
 * { kinds, calls, reason, immediate }.
 */
function assess(helperId, { latestCallId } = {}) {
  // Concerns a coordinator already reviewed do not count again; only what she said since.
  const lastReview = db.prepare("SELECT MAX(reviewed_at) AS t FROM safety_flags WHERE helper_id = ? AND status = 'reviewed'").get(helperId).t;
  const recent = signalsFor(helperId, { withinDays: WINDOW_DAYS }).filter(s => !lastReview || s.created_at > lastReview);
  if (!recent.length) return null;
  const latest = latestCallId ? recent.filter(s => s.call_id === latestCallId) : [];
  const urgent = latest.filter(s => IMMEDIATE.includes(s.kind));
  if (urgent.length) {
    const kinds = [...new Set(urgent.map(s => s.kind))];
    return { kinds, calls: 1, immediate: true, reason: 'She described ' + kinds.map(k => KIND_LABELS[k]).join(' and ') + ' on a call.' };
  }
  // A pattern flag needs this call to have raised one of the serious kinds, not just any remark.
  if (latestCallId && !latest.some(s => PATTERN_KINDS.includes(s.kind))) return null;
  const callsOf = list => new Set(list.map(s => s.call_id)).size;
  const byKind = {};
  for (const s of recent) (byKind[s.kind] = byKind[s.kind] || []).push(s);
  const repeated = Object.keys(byKind).filter(k => callsOf(byKind[k]) >= MIN_CALLS);
  const serious = recent.filter(s => PATTERN_KINDS.includes(s.kind));
  if (!repeated.length && callsOf(serious) < MIN_CALLS) return null;
  const kinds = repeated.length ? [...new Set([...repeated, ...serious.map(s => s.kind)])] : [...new Set(serious.map(s => s.kind))];
  const calls = callsOf(recent.filter(s => kinds.includes(s.kind)));
  return { kinds, calls, immediate: false, reason: 'She described ' + kinds.map(k => KIND_LABELS[k]).join(', ') + ' on ' + calls + ' different calls in ' + WINDOW_DAYS + ' days.' };
}

function localSummary(helper, signals) {
  const quotes = signals.map(s => `${s.said_at}: "${s.evidence}"`).join(' ');
  return `${firstName(helper.name)} described ${[...new Set(signals.map(s => KIND_LABELS[s.kind] || s.kind))].join(', ')} in her own words. ${quotes} This is a flag for a human to check, not a finding about the household.`;
}

function parseFlag(row) {
  if (!row) return null;
  let kinds = [];
  let memoryEvidence = [];
  try { kinds = JSON.parse(row.kinds || '[]'); } catch { kinds = []; }
  try { memoryEvidence = JSON.parse(row.memory_evidence || '[]'); } catch { memoryEvidence = []; }
  const helper = db.prepare('SELECT name FROM helpers WHERE id = ?').get(row.helper_id);
  const household = row.household_id ? db.prepare('SELECT name FROM households WHERE id = ?').get(row.household_id) : null;
  return Object.assign({}, row, {
    kinds,
    kind_labels: kinds.map(k => KIND_LABELS[k] || k),
    memory_evidence: memoryEvidence,
    helper_name: helper ? helper.name : row.helper_id,
    household_name: household ? household.name : null,
    timeline: signalsFor(row.helper_id).map(s => ({ id: s.id, kind: s.kind, label: KIND_LABELS[s.kind] || s.kind, evidence: s.evidence, said_at: s.said_at, call_id: s.call_id, source: s.source })),
  });
}

function getFlag(id) { return parseFlag(db.prepare('SELECT * FROM safety_flags WHERE id = ?').get(id)); }

/**
 * Raise (or update) the open flag for a helper if her history calls for it. Returns the flag or
 * null. The local summary is written at once; Hindsight enriches it in the background.
 */
function evaluate(helperId, { latestCallId, householdId = null } = {}) {
  const helper = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(helperId);
  if (!helper) return null;
  const hit = assess(helperId, { latestCallId });
  if (!hit) return null;
  const evidence = signalsFor(helperId, { withinDays: WINDOW_DAYS }).filter(s => hit.kinds.includes(s.kind));
  const summary = localSummary(helper, evidence);
  const hh = householdId || activeHouseholdOf(helperId);
  const now = nowSql();
  const open = db.prepare("SELECT * FROM safety_flags WHERE helper_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(helperId);
  let id;
  if (open) {
    id = open.id;
    db.prepare("UPDATE safety_flags SET kinds = ?, reason = ?, summary = ?, summary_source = 'local', household_id = COALESCE(?, household_id), updated_at = ? WHERE id = ?")
      .run(JSON.stringify(hit.kinds), hit.reason, summary, hh, now, id);
  } else {
    id = newId('flag_');
    db.prepare(`INSERT INTO safety_flags (id, helper_id, household_id, kinds, reason, summary, summary_source, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'local', 'open', ?, ?)`)
      .run(id, helperId, hh, JSON.stringify(hit.kinds), hit.reason, summary, now, now);
    activity('decision', `DECISION AGENT — Safety check needed: ${helper.name}. ${hit.reason} Flag for a human to check; the household is not told.`);
    remember({
      content: `On ${dayOf(Date.now())}, the agency raised a private safety check for ${helper.name}. ${hit.reason} Her words: ${evidence.map(s => `(${s.said_at}) "${s.evidence}"`).join(' ')} This is for the coordinator to check with her; it is not a finding about the household.`,
      context: 'Coordinator-only safety note written by the agency after a helper call.',
      documentId: 'safety:' + id,
      // Her tag only: a household-scoped recall or reflect (handover briefs, household profile) must never see it.
      tags: ['helper:' + helperId, 'source:safety'],
      metadata: { helper_id: helperId, kind: 'safety_flag' },
      helperId,
    });
  }
  enrichWithMemory(id, helper).catch(() => { /* the local summary stands */ });
  return getFlag(id);
}

/** Ask Hindsight what she has said across all her calls, with dated evidence, and keep it on the flag. */
async function enrichWithMemory(flagId, helper) {
  if (!hindsight.isConfigured()) return;
  const name = firstName(helper.name);
  const tags = ['helper:' + helper.id];
  const recalled = await hindsight.recall(`${name} salary pay late unpaid wages working hours not allowed to leave shouted insulted food rest`, { tags, budget: 'mid', limit: 12 });
  const out = await hindsight.reflect(
    `Across every call with ${helper.name}, has she herself described being paid late or not paid, working excessive hours, not being allowed to leave, being shouted at or insulted, being hurt, or being denied food or rest? ` +
    'List each mention with its date and her words. Then write two neutral sentences for the agency coordinator. This is a flag for a human to check with her, not a conclusion about the household: do not accuse anyone, and use only what she said herself.',
    {
      tags,
      budget: 'low',
      responseSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          mentions: { type: 'array', items: { type: 'object', properties: { when: { type: 'string' }, quote: { type: 'string' } }, required: ['when', 'quote'] } },
        },
        required: ['summary', 'mentions'],
      },
    }
  );
  const s = out.structured || {};
  const summary = String(s.summary || out.text || '').trim();
  if (!summary) return;
  const evidence = []
    .concat((Array.isArray(s.mentions) ? s.mentions : []).map(m => ({ when: String(m.when || '').slice(0, 30), text: String(m.quote || '').slice(0, 300), origin: 'reflect' })))
    .concat(out.basedOn.memories.map(m => ({ when: (m.mentionedAt || '').slice(0, 10), text: String(m.text).split(' | ')[0], origin: 'memory' })))
    .concat(recalled.map(m => ({ when: (m.mentionedAt || '').slice(0, 10), text: String(m.text).split(' | ')[0], origin: 'recall' })))
    .filter((e, i, all) => e.text && all.findIndex(x => x.text === e.text) === i)
    .slice(0, 12);
  db.prepare("UPDATE safety_flags SET summary = ?, summary_source = 'hindsight', memory_evidence = ?, updated_at = ? WHERE id = ?")
    .run(summary.slice(0, 1200), JSON.stringify(evidence), nowSql(), flagId);
}

function openFlags() {
  return db.prepare("SELECT * FROM safety_flags WHERE status = 'open' ORDER BY updated_at DESC").all().map(parseFlag);
}

function forHelper(helperId) {
  if (!db.prepare('SELECT 1 FROM helpers WHERE id = ?').get(helperId)) throw new NotFoundError('Unknown helper.');
  return {
    helper_id: helperId,
    signals: signalsFor(helperId).map(s => Object.assign({}, s, { label: KIND_LABELS[s.kind] || s.kind })),
    flags: db.prepare('SELECT * FROM safety_flags WHERE helper_id = ? ORDER BY created_at DESC').all(helperId).map(parseFlag),
  };
}

function review(flagId, note) {
  const text = String(note == null ? '' : note).replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 500) throw new ValidationError('Add a review note of 3 to 500 characters (what you checked and what happens next).');
  const flag = db.prepare('SELECT * FROM safety_flags WHERE id = ?').get(flagId);
  if (!flag) throw new NotFoundError('Unknown safety flag.');
  if (flag.status !== 'open') throw new ValidationError('This flag has already been reviewed.');
  const now = nowSql();
  db.prepare("UPDATE safety_flags SET status = 'reviewed', review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").run(text, now, now, flagId);
  const helper = db.prepare('SELECT name FROM helpers WHERE id = ?').get(flag.helper_id);
  const name = helper ? helper.name : flag.helper_id;
  activity('decision', `DECISION AGENT — Safety check reviewed for ${name}: ${text}`);
  remember({
    content: `On ${dayOf(Date.now())}, the coordinator reviewed the safety check for ${name}. Coordinator's note: ${text}`,
    context: 'Coordinator-only note recording the review of a helper safety check.',
    documentId: 'safety-review:' + flagId,
    tags: ['helper:' + flag.helper_id, 'source:safety'],
    metadata: { helper_id: flag.helper_id, kind: 'safety_review' },
    helperId: flag.helper_id,
  });
  return getFlag(flagId);
}

/** After-call hook: store what she said and check the pattern across her calls. */
function onCall({ helper, household, outcome, callId }) {
  const concerns = (outcome && outcome.safety_concerns) || [];
  if (!helper || !concerns.length) return null;
  const hh = (household && household.id) || activeHouseholdOf(helper.id);
  if (!recordSignals({ helperId: helper.id, householdId: hh, callId, concerns })) return null;
  return evaluate(helper.id, { latestCallId: callId, householdId: hh });
}
hooks.onCallSaved(onCall);

/* ------------------------------------------------------------------ handover brief */

const LANG_NAME = { hi: 'simple spoken Hindi in Devanagari script', te: 'simple spoken Telugu in Telugu script' };
const BRIEF_TTL_MS = 10 * 60 * 1000;
const briefCache = new Map(); // "<household>:<helper>" -> { at, sections, cited, mentalModelUsed }

/** Reflect runs once in English; other languages are a fast Groq translation of the same brief. */
async function translateSections(sections, lang) {
  const out = await groq.chatJson([{ role: 'user', content:
    `Translate every string in this JSON into ${LANG_NAME[lang]}, speaking to a home-care helper as "you". Keep the same keys and the same number of items. Keep times, numbers and names as they are. Return only the JSON.\n\n` + JSON.stringify(sections) }], { maxTokens: 2000 });
  const clean = {};
  for (const k of SECTIONS) {
    if (!sections[k].length) { clean[k] = []; continue; }   // nothing to translate; the model often drops empty keys
    clean[k] = Array.isArray(out && out[k]) && out[k].length === sections[k].length ? out[k].map(x => String(x).slice(0, 300)) : null;
  }
  if (SECTIONS.some(k => !clean[k])) throw new Error('the translation did not keep the same sections');
  return clean;
}

/**
 * Previous helpers stay anonymous in a brief. Only helpers who were placed at this household are
 * scrubbed: the full name always, the first name only when it is not a family member's
 * ("Mrs Priya Sharma", "Priya Sharma") so a daughter who shares a helper's name is left alone.
 */
function scrubNames(text, keepHelperId, householdId) {
  let out = String(text || '');
  const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const placed = householdId
    ? db.prepare('SELECT DISTINCT h.id, h.name FROM placements p JOIN helpers h ON h.id = p.helper_id WHERE p.household_id = ?').all(householdId)
    : [];
  for (const h of placed) {
    if (h.id === keepHelperId) continue;
    out = out.replace(new RegExp('\\b' + esc(h.name) + "('s)?\\b", 'gi'), 'the previous helper');
    const first = firstName(h.name);
    if (first.length > 2) {
      out = out.replace(new RegExp('(?<!\\b(?:Mr|Mrs|Ms|Smt|Shri|Dr)\\.?\\s)\\b' + esc(first) + "(?!\\s+[A-Z])('s)?\\b", 'g'), 'the previous helper');
    }
  }
  return out;
}

function cleanSections(raw, keepHelperId, householdId) {
  const out = {};
  for (const k of SECTIONS) {
    out[k] = (Array.isArray(raw && raw[k]) ? raw[k] : [])
      .map(x => scrubNames(typeof x === 'string' ? x : (x && (x.text || x.item)) || '', keepHelperId, householdId).trim())
      .filter(Boolean).slice(0, 6).map(x => x.slice(0, 300));
  }
  return out;
}

/** Brief from SQLite only, used when Hindsight is unconfigured or fails. English only. */
function localBrief(hh) {
  const ended = db.prepare("SELECT status, started_at, ended_at FROM placements WHERE household_id = ? AND status != 'active' ORDER BY ended_at").all(hh.id);
  const weeks = p => (p.started_at && p.ended_at ? Math.max(1, Math.round((new Date(p.ended_at) - new Date(p.started_at)) / (7 * 86400000))) : null);
  return {
    routine: [hh.schedule ? `The household's schedule on record: ${hh.schedule}.` : null, hh.location ? `The home is in ${hh.location}.` : null].filter(Boolean),
    health_and_care: [`The household needs ${String(hh.need || '').replace('_', ' ')}.`],
    preferences: hh.notes ? [hh.notes] : [],
    what_went_wrong_before: ended.length
      ? [`${ended.length} earlier placement${ended.length === 1 ? '' : 's'} here ended${ended.some(weeks) ? ' within ' + Math.max(...ended.map(weeks).filter(Boolean)) + ' weeks' : ''}. Ask the agency what the family expects before your first day.`]
      : [],
    first_week_tips: ['Agree the daily plan with the family on your first day and write it down.', 'If anything is unclear or pay is late, tell the agency the same day.'],
  };
}

/**
 * The coordinator confirms the brief was actually given to a helper who is starting there: only
 * then is it written to memory, so previewing briefs never creates a placement that did not happen.
 */
function recordHandover(householdId, helperId) {
  const hh = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
  if (!hh) throw new NotFoundError('Unknown household.');
  if (!helperId || typeof helperId !== 'string') throw new ValidationError('Pick the helper who is starting (helper).');
  const helper = db.prepare('SELECT id, name FROM helpers WHERE id = ?').get(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');
  const cached = briefCache.get(householdId + ':' + helper.id);
  const today = dayOf(Date.now());
  activity('mem', `MEMORY AGENT — Handover brief: ${helper.name} for ${hh.name}, given before her first day.`);
  remember({
    content: `On ${today}, the agency briefed ${helper.name} before starting at the ${hh.name}.` + (cached ? ' The brief covered: ' + SECTIONS.flatMap(k => cached.sections[k]).slice(0, 8).join(' ') : ''),
    context: 'Agency record of a handover brief given to a helper before a new placement.',
    documentId: `handover:${householdId}:${helper.id}:${today}`,
    tags: ['household:' + householdId, 'helper:' + helper.id, 'source:handover'],
    metadata: { household_id: householdId, helper_id: helper.id, kind: 'handover_brief' },
    helperId: helper.id,
  });
  return { recorded: true, household_id: householdId, helper_id: helper.id, date: today };
}

async function handover(householdId, { helperId, lang = 'en' } = {}) {
  const hh = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
  if (!hh) throw new NotFoundError('Unknown household.');
  if (!LANGS.includes(lang)) throw new ValidationError('lang must be one of: ' + LANGS.join(', ') + '.');
  if (!helperId || typeof helperId !== 'string') throw new ValidationError('Pick the helper who is starting (helper).');
  const helper = db.prepare('SELECT id, name, role FROM helpers WHERE id = ?').get(helperId);
  if (!helper) throw new NotFoundError('Unknown helper.');

  let sections = null;
  let cited = [];
  let source = 'local';
  let mentalModelUsed = false;
  let note = 'From local records: Hindsight memory was not available, so this brief uses only the household profile and placement history.';
  const cacheKey = householdId + ':' + helper.id;
  const cached = briefCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BRIEF_TTL_MS) {
    ({ sections, cited, mentalModelUsed } = cached);
    source = 'hindsight';
    note = '';
  } else if (hindsight.isConfigured()) {
    try {
      let model = null;
      try { model = await hindsight.mentalModels.get('household-' + householdId); } catch { model = null; }
      const modelText = model && (model.content || model.text);
      mentalModelUsed = Boolean(modelText);
      const out = await hindsight.reflect(
        `Prepare a handover brief for ${firstName(helper.name)}, a ${String(helper.role).replace('_', ' ')} helper who is about to start at the ${hh.name}. ` +
        'Use only what the agency memory says about this household. Sections: routine (daily schedule and timings), health_and_care (conditions, medication, diet, who needs care), ' +
        'preferences (what the family likes and dislikes), what_went_wrong_before (why earlier placements ended, phrased as "the previous placement ended over ..."), first_week_tips (practical advice for the first week). ' +
        '2 to 5 short items per section, each one plain sentence in simple English spoken to the helper as "you". If memory has nothing for a section, return an empty list. ' +
        'Never name previous helpers, never describe their personal lives, and never blame anyone. Do not mention agency safety checks, flags, or coordinator reviews.',
        {
          tags: ['household:' + householdId],
          budget: 'low',
          context: modelText ? 'Standing profile of this household kept by the agency:\n' + String(modelText).slice(0, 3000) : undefined,
          responseSchema: {
            type: 'object',
            properties: Object.fromEntries(SECTIONS.map(k => [k, { type: 'array', items: { type: 'string' } }])),
            required: SECTIONS,
          },
        }
      );
      if (out.structured) {
        sections = cleanSections(out.structured, helper.id, householdId);
        cited = out.basedOn.memories.filter(m => !(m.tags || []).includes('source:safety') && !String(m.documentId || '').startsWith('safety:'))
          .map(m => ({ text: String(m.text).split(' | ')[0], when: (m.mentionedAt || '').slice(0, 10) }))
          .concat((out.basedOn.mentalModels || []).map(m => ({ text: 'Standing profile: ' + (m.name || m.id || 'household profile'), when: String(m.last_refreshed_at || m.updated_at || '').slice(0, 10) })));
        if (!cited.length && mentalModelUsed) cited.push({ text: 'Standing profile: ' + (model.name || 'household-' + householdId), when: String(model.last_refreshed_at || model.updated_at || '').slice(0, 10) });
        cited = cited.slice(0, 12);
        source = 'hindsight';
        note = '';
        briefCache.set(cacheKey, { at: Date.now(), sections, cited, mentalModelUsed });
      }
    } catch (err) {
      note = 'From local records: Hindsight could not be reached (' + String(err.message).slice(0, 120) + ').';
    }
  }
  if (!sections) sections = cleanSections(localBrief(hh), helper.id, householdId);
  let shownLang = 'en';
  if (lang !== 'en') {
    try {
      sections = cleanSections(await translateSections(sections, lang), helper.id, householdId);
      shownLang = lang;
    } catch (err) {
      note = (note ? note + ' ' : '') + 'Translation was not available (' + String(err.message).slice(0, 80) + '), so the brief is in English.';
    }
  }

  return {
    household_id: householdId, household_name: hh.name,
    helper_id: helper.id, helper_name: helper.name,
    lang: shownLang, requested_lang: lang, source, note, mental_model_used: mentalModelUsed,
    sections, cited,
  };
}

function clearCache() { briefCache.clear(); }

module.exports = {
  clearCache, KIND_LABELS, WINDOW_DAYS, ValidationError, NotFoundError,
  recordSignals, assess, evaluate, onCall, openFlags, forHelper, review, getFlag, handover, recordHandover, scrubNames,
};
