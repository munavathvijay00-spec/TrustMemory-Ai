/** Memory recall for a call: Hindsight first (tag-scoped to the helper), local SQLite as fallback. */
const db = require('../db');
const hindsight = require('../hindsight');
const { helperTags } = require('./util');
const { record } = require('./trace');

/** Hindsight appends " | When: ... | Involving: ..." to recall text; compare on the sentence itself. */
function factCore(text) {
  return String(text || '').split(' | ')[0].trim();
}

function wordSet(text) {
  return new Set(factCore(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
}

/** Drop near-duplicates (the same fact retained by the seed and by live calls, or phrased twice). */
function dedupeFacts(facts, existing = []) {
  const kept = [];
  const seen = existing.map(f => wordSet(f.text));
  for (const f of facts) {
    const ws = wordSet(f.text);
    if (!ws.size) continue;
    const dup = seen.some(o => {
      let inter = 0;
      for (const w of ws) if (o.has(w)) inter += 1;
      return inter / Math.min(ws.size, o.size) >= 0.8;
    });
    if (dup) continue;
    seen.push(ws);
    kept.push(f);
  }
  return kept;
}

function factOrigin(f) {
  const doc = String(f.documentId || '');
  if (f.type === 'observation') return 'consolidated';
  if (doc.startsWith('call:')) return 'learned on a call';
  if (doc.startsWith('feedback:')) return 'coordinator feedback';
  if (doc.startsWith('note:')) return 'coordinator note';
  if (doc.startsWith('seed:')) return 'agency records';
  return 'agency records';
}

/**
 * `trace` (optional array) receives step timings: recall, mental_model, household_recall.
 * It only observes; the recalled memory is the same with or without it.
 */
async function recallForHelper(helper, { useMemory = true, scenario = 'coaching_call', household = null, trace = null } = {}) {
  const t0 = Date.now();
  if (!useMemory) {
    record(trace, 'recall', t0, true, '0 facts (memory off)');
    return { source: 'disabled', bank: hindsight.BANK_ID, facts: [], mentalModel: null, error: null };
  }
  const query = scenario === 'followup_call'
    ? helper.name + ': commitments made on the last coaching call, what she agreed to do, the follow-up that was planned, and anything that happened since then'
    : helper.name + ': attendance, late arrivals, previous coaching calls, commitments made and whether they held, preferences, times not to call, household feedback';
  const local = db.prepare(
    'SELECT network, content, created_at FROM memories WHERE helper_id = ? ORDER BY created_at DESC LIMIT 12'
  ).all(helper.id).map(m => ({ text: m.content, type: m.network, mentionedAt: m.created_at }));

  if (!hindsight.isConfigured()) {
    record(trace, 'recall', t0, true, local.length + ' facts (local)');
    return { source: 'local', bank: null, facts: local, mentalModel: null, error: 'Hindsight not configured; using local SQLite memories.' };
  }
  try {
    let recallEntry = null;
    const [factsA, mm] = await Promise.all([
      hindsight.recall(query, { tags: helperTags(helper.id), budget: 'mid', limit: 10 })
        .then(r => { recallEntry = record(trace, 'recall', t0, true); return r; }),
      hindsight.mentalModels.get('coach-' + helper.id).then(
        m => { record(trace, 'mental_model', t0, true, m && m.content ? 'found' : 'none'); return m; },
        e => { record(trace, 'mental_model', t0, false, e && e.message); return null; }
      ),
    ]);
    // Only this helper's memories: an untagged, bank-wide fallback could pull another helper's facts into the call.
    let facts = dedupeFacts(factsA).map(f => Object.assign(f, { origin: factOrigin(f) }));
    if (recallEntry) recallEntry.detail = facts.length + ' facts';
    if (household) {
      const th = Date.now();
      try {
        const hh = await hindsight.recall(household.name + ': what the household expects from a helper and what they have said about ' + helper.name, { tags: ['household:' + household.id], budget: 'low', limit: 3, maxTokens: 600 });
        const before = facts.length;
        facts = facts.concat(dedupeFacts(hh, facts).map(f => Object.assign(f, { origin: 'household', about: household.name })));
        record(trace, 'household_recall', th, true, (facts.length - before) + ' facts');
      } catch (e) { record(trace, 'household_recall', th, false, e.message); /* household memory is additive */ }
    }
    const mentalModel = mm && mm.content ? { name: mm.name, content: mm.content, updatedAt: mm.updated_at || mm.last_refreshed_at || null } : null;
    return { source: 'hindsight', bank: hindsight.BANK_ID, facts, mentalModel, localFacts: local, error: null };
  } catch (err) {
    record(trace, 'recall', t0, false, err.message + ' (fell back to ' + local.length + ' local facts)');
    return { source: 'local', bank: hindsight.BANK_ID, facts: local, mentalModel: null, error: err.message };
  }
}

module.exports = { factCore, wordSet, dedupeFacts, factOrigin, recallForHelper };
