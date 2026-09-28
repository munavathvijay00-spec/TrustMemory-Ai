const db = require('./db');

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Priority 3: Wire the Decision Agent honestly
 * Formula: churn = clamp(100 - (trust * 0.6) - (recent_positive_experiences * 8) + (recent_late_arrivals * 5), 0, 100)
 */
function recalculateChurn(helperId, scenario, outcomeSummary, lateCount = 2) {
  const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get(helperId);
  if (!helper) return null;

  const oldChurn = helper.churn;
  const trust = helper.trust;

  // Count recent positive experiences from memories table
  const expMemories = db.prepare(`
    SELECT content FROM memories 
    WHERE helper_id = ? AND network = 'experience'
  `).all(helperId);

  let positiveCount = 0;
  for (const m of expMemories) {
    const text = (m.content || '').toLowerCase();
    if (text.includes('praise') || text.includes('excellent') || text.includes('satisfied') || text.includes('commitment') || text.includes('agreed') || text.includes('positive')) {
      positiveCount++;
    }
  }

  const lateArrivals = parseInt(lateCount || 2, 10);
  const calculatedChurn = clamp(100 - (trust * 0.6) - (positiveCount * 8) + (lateArrivals * 5), 0, 100);

  // 1. Update helpers table
  db.prepare('UPDATE helpers SET churn = ? WHERE id = ?').run(calculatedChurn, helperId);

  // 2. Insert Opinion memory row
  const opinionId = 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const opinionText = `Churn risk recalculated: ${oldChurn} → ${calculatedChurn}. Reason: ${outcomeSummary}.`;

  db.prepare(`
    INSERT INTO memories (id, helper_id, household_id, network, content, created_at)
    VALUES (?, ?, ?, 'opinion', ?, ?)
  `).run(opinionId, helperId, null, opinionText, now);

  // 3. Log to Agent Activity
  const activityId = 'act_' + Date.now();
  const activityText = `DECISION AGENT — Recalculated churn risk for ${helper.name} following ${scenario}. ${oldChurn} → ${calculatedChurn}.`;

  db.prepare(`
    INSERT INTO activity (id, agent, text, created_at)
    VALUES (?, 'decision', ?, ?)
  `).run(activityId, activityText, now);

  return {
    oldChurn,
    newChurn: calculatedChurn,
    opinionText,
    activityText
  };
}

module.exports = {
  recalculateChurn
};
