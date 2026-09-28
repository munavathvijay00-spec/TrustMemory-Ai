/* =========================================================================
   agents/reflection-agent.js — cross-placement pattern detection
   ========================================================================= */

function reflectOnHousehold(householdId){
  const hh = S.households.find(h => h.id === householdId);
  const placements = S.placements.filter(p => p.householdId === householdId);
  const failed = placements.filter(p => p.status === 'failed' || p.status === 'ended_poor_fit');
  recall(householdId, 'comparing placement history');
  log('ref','REFLECTION AGENT', `Retrieved ${placements.length} placement records for ${hh.name} across ${new Set(placements.map(p=>p.helperId)).size} different helpers.`);

  let classification, insight;
  if(failed.length >= 3){
    classification = 'HYPOTHESIS';
    insight = `${failed.length} placements ended in replacement across different helpers, with schedule-related complaints in each. Possible common factor: schedule or expectation mismatch on the household side, rather than helper performance.`;
  } else if(failed.length >= 1){
    classification = 'OBSERVATION';
    insight = `${failed.length} placement(s) at ${hh.name} ended early. Evidence is limited; further placements would clarify whether this is a pattern.`;
  } else {
    classification = 'FACT';
    insight = `${hh.name} has no failed placements on record. Current placement history shows stability.`;
  }

  const evidence = failed.map(p => {
    const helper = S.helpers.find(h => h.id === p.helperId);
    return `${helper ? helper.name : p.helperId}: placement ended ${p.end} (${p.status.replace('_',' ')})`;
  });

  const refl = {
    id: uid(),
    entityType: 'household',
    entityId: householdId,
    classification,
    insight,
    evidence,
    confidence: failed.length >= 3 ? 0.72 : failed.length >= 1 ? 0.5 : 0.9,
    createdAt: nowStamp()
  };

  S.reflections.unshift(refl);
  retain(householdId, 'observation', insight, {classification});
  log('ref','REFLECTION AGENT', `Stored ${classification} for ${hh.name}: "${insight}"`);

  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  return refl;
}

function reflectOnRoleFit(helperId){
  const h = S.helpers.find(x => x.id === helperId);
  recall(helperId, 'comparing role-specific outcomes');
  const rs = h.roleScores;
  const best = Object.entries(rs).sort((a,b) => b[1]-a[1])[0];
  const worst = Object.entries(rs).sort((a,b) => a[1]-b[1])[0];
  const insight = `${h.name} performs consistently better in ${roleLabel(best[0])} (${best[1]}/100) than in ${roleLabel(worst[0])} (${worst[1]}/100), based on historical placement outcomes.`;

  const refl = {
    id: uid(),
    entityType: 'helper',
    entityId: helperId,
    classification: 'OBSERVATION',
    insight,
    evidence: [
      `${roleLabel(best[0])} outcomes: strong, repeated positive feedback.`,
      `${roleLabel(worst[0])} outcomes: below-average feedback, early placement end.`
    ],
    confidence: 0.81,
    createdAt: nowStamp()
  };

  S.reflections.unshift(refl);
  retain(helperId, 'observation', insight, {});
  log('ref','REFLECTION AGENT', `Stored role-fit OBSERVATION for ${h.name}.`);

  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  return refl;
}

function reflCard(r){
  const cls = r.classification === 'FACT' ? 'ok' : r.classification === 'OBSERVATION' ? 'warn' : 'neutral';
  return `<div class="card" style="margin-bottom:10px;">
    <span class="badge ${cls}">${r.classification}</span>
    <p style="margin-top:8px; font-size:13px;">${r.insight}</p>
    ${r.evidence && r.evidence.length ? `<div class="hr"></div><div style="font-size:11.5px; color:var(--ink-soft);"><b>Evidence</b><ul style="margin:6px 0 0; padding-left:16px;">${r.evidence.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}
