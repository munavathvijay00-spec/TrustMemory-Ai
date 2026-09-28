/* =========================================================================
   agents/matching-agent.js — role-fit ranking + ensureBackupStaged
   ========================================================================= */

function findMatches(role, householdId, opts){
  opts = opts || {};
  const naive = opts.naive; // ignore memory/role-fit, mimic "generic ranking"
  const hh = S.households.find(h => h.id === householdId);
  recall(householdId, 'retrieving household memory');
  log('match','MATCHING AGENT', `Evaluating candidates for ${hh ? hh.name : householdId} — requirement: ${roleLabel(role)}.`);

  const scored = S.helpers.map(h => {
    recall(h.id);
    const roleFit = h.roleScores[role] || 40;
    const trust = SCORES[h.id] ? SCORES[h.id].trust : computeTrust(h.id);
    const churn = SCORES[h.id] ? SCORES[h.id].churn : computeChurn(h.id);
    let score;
    if(naive){
      score = Math.round(50 + h.exp * 2 - (h.location.includes('Hyderabad') ? 0 : 5));
    } else {
      score = Math.round(roleFit * 0.5 + trust * 0.3 + (100 - churn) * 0.2);
    }
    return {helper:h, score:clamp(score, 0, 100), roleFit, trust, churn};
  }).sort((a,b) => b.score - a.score);

  if(!naive){
    log('match','MATCHING AGENT', `Ranked ${scored.length} candidates using role-specific history, trust signal and churn risk.`);
  } else {
    log('match','MATCHING AGENT', `Ranked ${scored.length} candidates using generic profile fields only (no memory).`);
  }
  return scored;
}

function ensureBackupStaged(householdId, atRiskHelperId, afterChurn, date){
  if(afterChurn != null && afterChurn >= 75 && householdId){
    const already = S.stagedBackups.find(b => b.householdId === householdId && b.status === 'staged');
    if(!already){
      const hh = S.households.find(x => x.id === householdId);
      if(hh){
        const candidates = findMatches(hh.requirement, householdId).filter(c => c.helper.id !== atRiskHelperId);
        if(candidates.length){
          const backup = candidates[0];
          log('match','MATCHING AGENT', `Read Observation Network for ${hh.name}. Pre-staging backup helper in case ${labelFor(atRiskHelperId)}'s placement needs replacement.`);
          S.stagedBackups.unshift({
            id: uid(),
            householdId,
            atRiskHelperId,
            backupHelperId: backup.helper.id,
            score: backup.score,
            status: 'staged',
            createdAt: date || todayIso()
          });
          log('match','MATCHING AGENT', `Staged ${backup.helper.name} (match score ${backup.score}/100) as backup for ${hh.name}.`);
        }
      }
    }
  }
}

function matchWhy(r, currentRole){
  const w = [];
  const roleName = currentRole ? roleLabel(currentRole) : 'role';
  if(r.roleFit >= 75) w.push(`Consistently positive ${roleName} outcomes on record.`);
  if(r.trust >= 75) w.push('Strong attendance and reliability history.');
  if(r.churn <= 30) w.push('Low churn risk based on recent trend.');
  if(!w.length) w.push('Best available balance of role fit, trust and stability among current candidates.');
  return w;
}
