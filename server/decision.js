const db = require('./db');

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Priority 3: Wire the Decision Agent honestly
 * Formula: churn = clamp(100 - (trust * 0.6) - (recent_positive_experiences * 8) + (recent_late_arrivals * 5), 0, 100)
 */
function recalculateChurn(helperId, scenario, outcomeSummary, lateCount = 2, outcome = null) {
  const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get(helperId);
  if (!helper) return null;

  const oldChurn = helper.churn;
  const lateArrivals = parseInt(lateCount || 0, 10) || 0;

  // Delta model: start from the current churn risk and move it by what this call revealed.
  // Every adjustment is named so the Opinion entry can explain itself.
  const reasons = [];
  let delta = 0;
  if (lateArrivals > 0) { delta += lateArrivals * 3; reasons.push(`${lateArrivals} recent late arrival${lateArrivals === 1 ? '' : 's'} (+${lateArrivals * 3})`); }
  if (outcome && typeof outcome === 'object') {
    if (outcome.call_completed === false) { delta += 2; reasons.push('call not completed (+2)'); }
    if (outcome.root_cause_identified) { delta -= 2; reasons.push('root cause understood (-2)'); }
    if (outcome.specific_commitment) { delta -= 8; reasons.push('concrete commitment made (-8)'); }
    if (outcome.notification_commitment) { delta -= 3; reasons.push('agreed to notify household when late (-3)'); }
    if (outcome.sentiment === 'cooperative') { delta -= 2; reasons.push('cooperative on call (-2)'); }
    if (outcome.sentiment === 'defensive') { delta += 5; reasons.push('defensive on call (+5)'); }
    if (outcome.sentiment === 'distressed') { delta += 4; reasons.push('helper distressed (+4)'); }
    if (outcome.escalations_required) { delta += 10; reasons.push('escalation required (+10)'); }
    for (const c of Array.isArray(outcome.commitment_checks) ? outcome.commitment_checks : []) {
      if (c.status === 'kept') { delta -= 6; reasons.push('kept an earlier commitment (-6)'); }
      if (c.status === 'broken') { delta += 6; reasons.push('earlier commitment not kept (+6)'); }
    }
  } else {
    // Legacy path (webhook without structured outcome): keyword scan of the summary.
    const text = String(outcomeSummary || '').toLowerCase();
    if (/commit|agreed|will take|will message/.test(text)) { delta -= 8; reasons.push('commitment in summary (-8)'); }
    if (/escalat/.test(text)) { delta += 10; reasons.push('escalation in summary (+10)'); }
  }
  const calculatedChurn = clamp(oldChurn + delta, 0, 100);

  // 1. Update helpers table
  db.prepare('UPDATE helpers SET churn = ? WHERE id = ?').run(calculatedChurn, helperId);

  // 2. Insert Opinion memory row
  const opinionId = 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const opinionText = `Churn risk recalculated: ${oldChurn} → ${calculatedChurn} (${delta >= 0 ? '+' : ''}${delta}). ${reasons.length ? 'Because: ' + reasons.join('; ') + '. ' : ''}Source: ${outcomeSummary}`;

  db.prepare(`
    INSERT INTO memories (id, helper_id, household_id, network, content, created_at)
    VALUES (?, ?, ?, 'opinion', ?, ?)
  `).run(opinionId, helperId, null, opinionText, now);

  // 3. Log to Agent Activity
  // Random suffix: two re-scores in the same millisecond must not collide on the primary key.
  const activityId = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const activityText = `DECISION AGENT — Recalculated churn risk for ${helper.name} following ${scenario}. ${oldChurn} → ${calculatedChurn}.`;

  db.prepare(`
    INSERT INTO activity (id, agent, text, created_at)
    VALUES (?, 'decision', ?, ?)
  `).run(activityId, activityText, now);

  return {
    oldChurn,
    newChurn: calculatedChurn,
    old_churn: oldChurn,
    new_churn: calculatedChurn,
    delta,
    reasons,
    opinionText,
    activityText
  };
}

module.exports = {
  recalculateChurn
};
