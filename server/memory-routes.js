/**
 * Memory routes: the parts of Hindsight the UI shows directly.
 *   GET  /api/memory/status            configured? which bank, which models
 *   GET  /api/memory/stats             bank statistics
 *   GET  /api/memory/recall            ?q=&helper=|household=   raw facts
 *   GET  /api/memory/observations      ?helper=|household=      consolidated beliefs
 *   GET  /api/memory/mental-model      ?helper=|household=      standing profile Hindsight keeps current
 *   GET  /api/memory/brief             ?helper=                 reflect: "brief me before this call"
 *   GET  /api/memory/directives        list rules
 *   POST /api/memory/directives        {name, content}          create rule
 *   PATCH /api/memory/directives/:id   {is_active}              enable / disable
 *   GET  /api/memory/suggest-directive ?helper=                 reflect proposes a rule from experience
 *   POST /api/memory/feedback          {call_id, helper_id, verdict, note}  coordinator correction -> retained
 *   GET  /api/memory/match             ?household=&role=        memory-backed candidate ranking
 */
const express = require('express');
const db = require('./db');
const groq = require('./groq');
const hindsight = require('./hindsight');

const router = express.Router();

function fail(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ error: err.message });
}

function needHindsight(res) {
  if (hindsight.isConfigured()) return true;
  res.status(503).json({ error: 'Hindsight is not configured. Set HINDSIGHT_API_KEY in .env.' });
  return false;
}

function scopeTags(q) {
  const helper = String(q.helper || '').trim();
  const household = String(q.household || '').trim();
  if (helper) return { tags: ['helper:' + helper], id: helper, kind: 'helper' };
  if (household) return { tags: ['household:' + household], id: household, kind: 'household' };
  return { tags: undefined, id: null, kind: null };
}

function entityName(kind, id) {
  if (!id) return null;
  const row = kind === 'helper'
    ? db.prepare('SELECT name FROM helpers WHERE id = ?').get(id)
    : db.prepare('SELECT name FROM households WHERE id = ?').get(id);
  return row ? row.name : id;
}

router.get('/api/memory/status', (req, res) => {
  res.json({
    groq: { configured: groq.isConfigured(), model: groq.MODEL, models: groq.MODEL_CHAIN, keys: groq.keyCount() },
    hindsight: { configured: hindsight.isConfigured(), bank: hindsight.BANK_ID, base_url: hindsight.BASE_URL },
  });
});

router.get('/api/memory/stats', async (req, res) => {
  if (!needHindsight(res)) return;
  try { res.json(await hindsight.stats()); } catch (err) { fail(res, err); }
});

router.get('/api/memory/recall', async (req, res) => {
  if (!needHindsight(res)) return;
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query "q".' });
  const scope = scopeTags(req.query);
  try {
    const facts = await hindsight.recall(q, { tags: scope.tags, budget: 'low', limit: 12 });
    res.json({ bank: hindsight.BANK_ID, count: facts.length, facts });
  } catch (err) { fail(res, err); }
});

router.get('/api/memory/observations', async (req, res) => {
  if (!needHindsight(res)) return;
  const scope = scopeTags(req.query);
  const name = entityName(scope.kind, scope.id);
  const q = String(req.query.q || '').trim() || (name ? `${name}: patterns, reliability, commitments, preferences, what works and what does not` : 'patterns across helpers and households: reliability, commitments, placement outcomes');
  try {
    const items = await hindsight.observations(q, { tags: scope.tags, limit: Number(req.query.limit) || 12 });
    res.json({ bank: hindsight.BANK_ID, count: items.length, observations: items });
  } catch (err) { fail(res, err); }
});

router.get('/api/memory/mental-model', async (req, res) => {
  if (!needHindsight(res)) return;
  const scope = scopeTags(req.query);
  if (!scope.id) return res.status(400).json({ error: 'Pass helper= or household=.' });
  const id = (scope.kind === 'helper' ? 'coach-' : 'household-') + scope.id;
  try {
    const mm = await hindsight.mentalModels.get(id);
    res.json({ id: mm.id, name: mm.name, content: mm.content || '', updated_at: mm.updated_at || mm.last_refreshed_at || null, source_query: mm.source_query || '' });
  } catch (err) {
    if (err.status === 404) return res.json({ id, name: null, content: '', missing: true });
    fail(res, err);
  }
});

router.post('/api/memory/mental-model/refresh', async (req, res) => {
  if (!needHindsight(res)) return;
  const scope = scopeTags(req.body || {});
  if (!scope.id) return res.status(400).json({ error: 'Pass helper or household.' });
  const id = (scope.kind === 'helper' ? 'coach-' : 'household-') + scope.id;
  try { await hindsight.mentalModels.refresh(id); res.json({ refreshed: id }); } catch (err) { fail(res, err); }
});

router.get('/api/memory/brief', async (req, res) => {
  if (!needHindsight(res)) return;
  const scope = scopeTags(req.query);
  if (!scope.id) return res.status(400).json({ error: 'Pass helper= or household=.' });
  const name = entityName(scope.kind, scope.id);
  const q = scope.kind === 'helper'
    ? `Brief the coordinator before a call with ${name} today. In four short lines: what she committed to and whether it held, what is going on in her life that affects work, how to approach her, and anything to avoid (including times not to call).`
    : `Brief the coordinator about the ${name} before proposing a helper. In four short lines: what they expect, why past placements ended, what kind of helper would succeed, and anything to avoid.`;
  try {
    const out = await hindsight.reflect(q, { tags: scope.tags, budget: 'low' });
    res.json({
      bank: hindsight.BANK_ID,
      text: out.text,
      cited: out.basedOn.memories.map(m => ({ text: m.text, when: m.mentionedAt, type: m.type })),
      mental_models: out.basedOn.mentalModels.map(m => m.name || m.id),
      directives: out.basedOn.directives.map(d => d.name || d.content),
    });
  } catch (err) { fail(res, err); }
});

/* ------------------------------------------------------------------ directives */

router.get('/api/memory/directives', async (req, res) => {
  if (!needHindsight(res)) return;
  try { res.json({ directives: await hindsight.directives.list() }); } catch (err) { fail(res, err); }
});

router.post('/api/memory/directives', async (req, res) => {
  if (!needHindsight(res)) return;
  const { name, content, priority } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content are required.' });
  try {
    const d = await hindsight.directives.create({ name, content, priority: priority != null ? Number(priority) : 60 });
    db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)").run(
      'act_' + Date.now(), `MEMORY AGENT — Coordinator approved a new bank directive: "${name}". Every future reflect and call obeys it.`, new Date().toISOString().replace('T', ' ').substring(0, 19));
    res.json({ directive: d });
  } catch (err) { fail(res, err); }
});

router.patch('/api/memory/directives/:id', async (req, res) => {
  if (!needHindsight(res)) return;
  const { is_active } = req.body || {};
  try { res.json({ directive: await hindsight.directives.update(req.params.id, { is_active: Boolean(is_active) }) }); } catch (err) { fail(res, err); }
});

router.get('/api/memory/suggest-directive', async (req, res) => {
  if (!needHindsight(res)) return;
  const scope = scopeTags(req.query);
  const name = entityName(scope.kind, scope.id);
  let existing = [];
  try { existing = (await hindsight.directives.list()).map(d => d.name + ': ' + d.content); } catch (e) { /* optional */ }
  const existingBlock = existing.length ? ` The agency ALREADY has these rules, do not propose anything they already cover: ${existing.join(' | ')}.` : '';
  const q = (name
    ? `Based on everything remembered about ${name}, propose ONE NEW standing rule the agency should always follow when dealing with her (for example a preference to honour, a topic to handle gently, something to always check, or a support to offer). Only propose it if the evidence supports it; otherwise say no rule is needed.`
    : 'Based on everything remembered across helpers and households, propose ONE NEW standing rule the agency should always follow. Only propose it if the evidence supports it; otherwise say no rule is needed.') + existingBlock;
  const schema = {
    type: 'object',
    properties: {
      rule_needed: { type: 'boolean' },
      name: { type: 'string' },
      content: { type: 'string' },
      evidence: { type: 'string' },
    },
    required: ['rule_needed', 'name', 'content', 'evidence'],
  };
  try {
    const out = await hindsight.reflect(q, { tags: scope.tags, budget: 'low', responseSchema: schema });
    const s = out.structured || {};
    res.json({
      rule_needed: Boolean(s.rule_needed),
      name: s.name || '',
      content: s.content || '',
      evidence: s.evidence || out.text,
      cited: out.basedOn.memories.map(m => ({ text: m.text, when: m.mentionedAt })),
    });
  } catch (err) { fail(res, err); }
});

/* ------------------------------------------------------------------ coordinator feedback */

router.post('/api/memory/feedback', async (req, res) => {
  const { call_id, helper_id, verdict, note } = req.body || {};
  if (!helper_id || !verdict) return res.status(400).json({ error: 'helper_id and verdict are required.' });
  const helper = db.prepare('SELECT name FROM helpers WHERE id = ?').get(helper_id);
  if (!helper) return res.status(404).json({ error: 'Unknown helper.' });
  const now = new Date().toISOString();
  const nowSql = now.replace('T', ' ').substring(0, 19);
  const verdictText = {
    approve: `The coordinator reviewed the agent's record of the call with ${helper.name} and confirmed it as accurate.`,
    correct: `The coordinator corrected the agent's record of the call with ${helper.name}: ${note || 'no detail given'}.`,
    reject: `The coordinator rejected the agent's record of the call with ${helper.name} as wrong: ${note || 'no detail given'}. Do not rely on that call's summary.`,
  }[verdict];
  if (!verdictText) return res.status(400).json({ error: 'verdict must be approve, correct or reject.' });

  db.prepare("INSERT INTO memories (id, helper_id, household_id, network, content, created_at) VALUES (?, ?, NULL, 'experience', ?, ?)")
    .run('mem_fb_' + Date.now(), helper_id, `Coordinator feedback (${verdict}): ${note || 'confirmed'}`, nowSql);
  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'mem', ?, ?)")
    .run('act_' + Date.now(), `MEMORY AGENT — Coordinator ${verdict === 'approve' ? 'approved' : verdict === 'correct' ? 'corrected' : 'rejected'} the record of ${helper.name}'s call${call_id ? ' (' + call_id + ')' : ''}. Retained as feedback so the next call reflects it.`, nowSql);

  let retain = { status: 'skipped' };
  if (hindsight.isConfigured()) {
    try {
      await hindsight.retain([{
        content: verdictText,
        context: 'Coordinator feedback on the voice agent\'s record of a call. This overrides the agent\'s own summary where they disagree.',
        documentId: `feedback:${call_id || 'call'}:${Date.now()}`,
        timestamp: now,
        metadata: { helper_id, verdict, call_id: call_id || '', kind: 'coordinator-feedback' },
        tags: ['helper:' + helper_id, 'source:coordinator-feedback', 'verdict:' + verdict],
      }]);
      retain = { status: 'ok', bank: hindsight.BANK_ID };
    } catch (err) { retain = { status: 'error', detail: err.message }; }
  }
  res.json({ ok: true, retain });
});

/* ------------------------------------------------------------------ learning metrics */

router.get('/api/memory/metrics', (req, res) => {
  const helperId = String(req.query.helper || '').trim();
  const rows = db.prepare(
    helperId
      ? "SELECT c.call_id, c.helper_id, c.scenario, c.outcome_json, c.created_at, h.name FROM calls c JOIN helpers h ON h.id = c.helper_id WHERE c.status = 'completed' AND c.helper_id = ? ORDER BY c.created_at ASC"
      : "SELECT c.call_id, c.helper_id, c.scenario, c.outcome_json, c.created_at, h.name FROM calls c JOIN helpers h ON h.id = c.helper_id WHERE c.status = 'completed' ORDER BY c.created_at ASC"
  ).all(...(helperId ? [helperId] : []));
  const opinions = db.prepare("SELECT helper_id, content, created_at FROM memories WHERE network = 'opinion' ORDER BY created_at ASC").all();
  const feedback = db.prepare("SELECT helper_id, content, created_at FROM memories WHERE network = 'experience' AND content LIKE 'Coordinator feedback%' ORDER BY created_at ASC").all();

  const calls = rows.map(r => {
    let o = {};
    try { o = JSON.parse(r.outcome_json || '{}'); } catch (e) { /* ignore */ }
    // The Decision Agent writes its Opinion row within seconds of the call row: take the first one after it, within 3 minutes.
    const t0 = new Date(r.created_at.replace(' ', 'T') + 'Z').getTime();
    const op = opinions.find(x => x.helper_id === r.helper_id && (() => { const t = new Date(x.created_at.replace(' ', 'T') + 'Z').getTime(); return t >= t0 - 1000 && t <= t0 + 180000; })());
    const m = op && op.content.match(/(\d+) → (\d+)/);
    return {
      call_id: r.call_id, helper_id: r.helper_id, helper: r.name, scenario: r.scenario, at: r.created_at,
      provider: o.provider || 'unknown',
      memory_used: o.memory_used !== false && o.provider === 'browser_voice',
      memories_recalled: Number(o.memories_recalled || 0),
      memory_citations: Number(o.memory_citations || 0),
      helper_turns: Number(o.helper_turns || 0),
      commitment: Boolean(o.specific_commitment),
      churn_before: m ? Number(m[1]) : null,
      churn_after: m ? Number(m[2]) : null,
    };
  });
  const withMem = calls.filter(c => c.memory_used);
  const avg = (arr, k) => arr.length ? Math.round(arr.reduce((n, c) => n + (c[k] || 0), 0) / arr.length * 10) / 10 : 0;
  res.json({
    calls,
    summary: {
      total_calls: calls.length,
      memory_calls: withMem.length,
      avg_memories_recalled: avg(withMem, 'memories_recalled'),
      avg_citations: avg(withMem, 'memory_citations'),
      avg_helper_turns_to_close: avg(withMem, 'helper_turns'),
      commitment_rate: withMem.length ? Math.round(withMem.filter(c => c.commitment).length / withMem.length * 100) : 0,
      coordinator_feedback: feedback.length,
      approvals: feedback.filter(f => /\(approve\)/.test(f.content)).length,
      corrections: feedback.filter(f => /\((correct|reject)\)/.test(f.content)).length,
    },
  });
});

/* ------------------------------------------------------------------ matching */

router.get('/api/memory/match', async (req, res) => {
  const householdId = String(req.query.household || '').trim();
  const role = String(req.query.role || '').trim() || 'elder_care';
  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
  if (!household) return res.status(404).json({ error: 'Unknown household.' });
  const helpers = db.prepare('SELECT * FROM helpers').all();

  let householdFacts = [];
  const perHelper = {};
  let source = 'local';
  if (hindsight.isConfigured()) {
    try {
      householdFacts = await hindsight.recall(`${household.name}: expectations, schedule, why placements ended, what kind of helper succeeds`, { tags: ['household:' + householdId], budget: 'low', limit: 6 });
      await Promise.all(helpers.map(async h => {
        perHelper[h.id] = await hindsight.recall(`${h.name}: ${role.replace('_', ' ')} experience, reliability, feedback, preferences about roles, outcomes at ${household.name}`, { tags: ['helper:' + h.id], budget: 'low', limit: 5 });
      }));
      source = 'hindsight';
    } catch (err) { source = 'local (' + err.message.slice(0, 60) + ')'; }
  }

  const ranked = helpers.map(h => {
    const facts = perHelper[h.id] || [];
    const joined = facts.map(f => f.text.toLowerCase()).join(' ');
    const roleWord = role.replace('_', ' ');
    let evidenceScore = 0;
    const reasons = [];
    if (new RegExp(roleWord).test(joined)) { evidenceScore += 10; reasons.push(`Memory shows ${roleWord} experience or feedback.`); }
    if (/praised|excellent|renewed|trust|wonderful|reliable|punctual/.test(joined)) { evidenceScore += 12; reasons.push('Positive household feedback on record.'); }
    if (/replaced|ended .*early|not the right fit|asked not to be placed|uncomfortable/.test(joined)) { evidenceScore -= 12; reasons.push('A past placement ended early or she asked not to do this kind of role.'); }
    if (new RegExp(household.name.split(' ')[0].toLowerCase()).test(joined) && /ended|replac/.test(joined)) { evidenceScore -= 20; reasons.push(`A previous placement at ${household.name} ended.`); }
    if (/committed|commitment|kept|working/.test(joined)) { evidenceScore += 4; reasons.push('Kept a commitment made to the agency.'); }
    // Role fit from the roster: primary role match is the strongest static signal.
    let roleFit = 0;
    if (h.role === role) { roleFit += 18; reasons.unshift(`Primary role is ${roleWord}.`); }
    else if (/child_care/.test(role) && /praised .*(toddler|child)|children|five-year-old/.test(joined)) { roleFit += 8; }
    else { roleFit -= 10; reasons.push(`Primary role is ${h.role.replace('_', ' ')}, not ${roleWord}.`); }
    if (/asked not to be placed in child|prefers elder care/.test(joined) && /child_care/.test(role)) { roleFit -= 25; reasons.push('She asked not to be placed in child care.'); }
    const base = Math.round(h.trust * 0.4 + (100 - h.churn) * 0.25) + roleFit;
    const score = Math.max(0, Math.min(100, base + evidenceScore));
    return { helper: { id: h.id, name: h.name, role: h.role, experience_years: h.experience_years }, score, trust: h.trust, churn: h.churn, reasons, evidence: facts.map(f => ({ text: f.text, when: f.mentionedAt })) };
  }).sort((a, b) => b.score - a.score);

  db.prepare("INSERT INTO activity (id, agent, text, created_at) VALUES (?, 'match', ?, ?)").run(
    'act_' + Date.now(), `MATCHING AGENT — Ranked ${ranked.length} candidates for ${household.name} (${role}) using recalled memory (${source}). Top: ${ranked[0] ? ranked[0].helper.name : 'none'}.`, new Date().toISOString().replace('T', ' ').substring(0, 19));

  res.json({ household: { id: household.id, name: household.name, need: household.need }, role, source, household_evidence: householdFacts.map(f => ({ text: f.text, when: f.mentionedAt })), candidates: ranked });
});

module.exports = router;
