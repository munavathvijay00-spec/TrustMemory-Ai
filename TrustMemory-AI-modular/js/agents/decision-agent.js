/* =========================================================================
   agents/decision-agent.js — Trust/Churn/Difficulty + severity classification
   ========================================================================= */

function helperEvents(id){
  return S.events.filter(e => e.helperId === id);
}

function householdEvents(id){
  return S.events.filter(e => e.householdId === id);
}

function computeTrust(helperId){
  const evs = helperEvents(helperId);
  let score = 68; // baseline
  evs.forEach(e => {
    if(e.type === 'positive_feedback') score += 4;
    if(e.type === 'placement_start') score += 1;
    if(e.type === 'late_arrival') score -= 3;
    if(e.type === 'complaint') score -= 6;
    if(e.type === 'negative_feedback') score -= 5;
    if(e.type === 'placement_end' && !e.description.toLowerCase().includes('replacement')) score += 2;
  });
  return clamp(Math.round(score), 0, 100);
}

function computeChurn(helperId){
  const evs = helperEvents(helperId).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  let score = 18; // baseline low risk
  const recentWindowDays = 30;
  const last = evs.length ? new Date(evs[evs.length-1].date) : new Date();
  evs.forEach(e => {
    const days = (last - new Date(e.date)) / 86400000;
    const recencyWeight = days <= recentWindowDays ? 1.6 : (days <= 90 ? 1 : 0.4);
    if(e.type === 'late_arrival') score += 9 * recencyWeight;
    if(e.type === 'complaint') score += 13 * recencyWeight;
    if(e.type === 'negative_feedback') score += 10 * recencyWeight;
    if(e.type === 'placement_end' && e.description.toLowerCase().includes('replacement')) score += 12 * recencyWeight;
    if(e.type === 'positive_feedback') score -= 5;
    if(e.type === 'coaching_completed') score -= 14;
  });
  return clamp(Math.round(score), 0, 100);
}

function computeDifficulty(householdId){
  const evs = householdEvents(householdId);
  const failed = evs.filter(e => e.type === 'placement_end' && e.description.toLowerCase().includes('replacement')).length;
  const complaints = evs.filter(e => e.type === 'complaint' || e.type === 'household_complaint').length;
  let score = 20 + failed * 20 + complaints * 8;
  return clamp(Math.round(score), 0, 100);
}

function recalcAll(){
  S.helpers.forEach(h => {
    SCORES[h.id] = SCORES[h.id] || {};
    // The server's Decision Agent owns trust and churn. Local formulas are only a fallback
    // until the first sync, so every page shows the same number the server stored.
    const server = window.SERVER_SCORES && window.SERVER_SCORES[h.id];
    SCORES[h.id].trust = server ? server.trust : computeTrust(h.id);
    SCORES[h.id].churn = server ? server.churn : computeChurn(h.id);

    // Track score history
    SCORE_HISTORY[h.id] = SCORE_HISTORY[h.id] || [];
    const last = SCORE_HISTORY[h.id][SCORE_HISTORY[h.id].length - 1];
    if(!last || last.trust !== SCORES[h.id].trust || last.churn !== SCORES[h.id].churn){
      SCORE_HISTORY[h.id].push({
        t: nowStamp(),
        trust: SCORES[h.id].trust,
        churn: SCORES[h.id].churn
      });
      if(SCORE_HISTORY[h.id].length > 20) SCORE_HISTORY[h.id].shift();
    }
  });

  S.households.forEach(h => {
    SCORES[h.id] = SCORES[h.id] || {};
    SCORES[h.id].difficulty = computeDifficulty(h.id);

    SCORE_HISTORY[h.id] = SCORE_HISTORY[h.id] || [];
    const last = SCORE_HISTORY[h.id][SCORE_HISTORY[h.id].length - 1];
    if(!last || last.difficulty !== SCORES[h.id].difficulty){
      SCORE_HISTORY[h.id].push({
        t: nowStamp(),
        difficulty: SCORES[h.id].difficulty
      });
      if(SCORE_HISTORY[h.id].length > 20) SCORE_HISTORY[h.id].shift();
    }
  });
}

function classifySeverity(eventType){
  const map = {
    late_arrival: {severity:'MEDIUM', confidence:0.81, reason:'Attendance deviation; severity depends on recurrence.'},
    complaint: {severity:'MEDIUM', confidence:0.85, reason:'Household-reported dissatisfaction requires review.'},
    negative_feedback: {severity:'MEDIUM', confidence:0.78, reason:'Negative sentiment recorded in feedback.'},
    positive_feedback: {severity:'LOW', confidence:0.9, reason:'Positive sentiment, no risk signal.'},
    placement_failure: {severity:'HIGH', confidence:0.9, reason:'Placement ended in failure.'},
    successful_placement: {severity:'LOW', confidence:0.92, reason:'Placement concluded successfully.'},
    household_complaint: {severity:'HIGH', confidence:0.83, reason:'Household-side dissatisfaction pattern.'},
    coaching_completed: {severity:'LOW', confidence:0.88, reason:'Coaching resolved with commitments logged.'},
  };
  const r = map[eventType] || {severity:'LOW', confidence:0.6, reason:'Unclassified event type.'};
  log('dec','DECISION AGENT', `Classified severity for "${eventType}" → ${r.severity} (confidence ${r.confidence}). ${r.reason}`);
  return r;
}

function churnWhy(helperId, churnScore){
  const evs = helperEvents(helperId).slice().sort((a,b) => new Date(b.date) - new Date(a.date));
  const reasons = [];
  const lateCount = evs.filter(e => e.type === 'late_arrival').length;
  const complaintCount = evs.filter(e => e.type === 'complaint').length;
  const unresolved = complaintCount - evs.filter(e => e.type === 'coaching_completed').length;
  if(lateCount) reasons.push(`${lateCount} late arrival${lateCount > 1 ? 's' : ''} on record.`);
  if(complaintCount) reasons.push(`${complaintCount} complaint${complaintCount > 1 ? 's' : ''} on record.`);
  if(unresolved > 0) reasons.push(`${unresolved} concern${unresolved > 1 ? 's' : ''} without a logged follow-up.`);
  if(evs.length && evs[0] && (evs[0].type === 'late_arrival' || evs[0].type === 'complaint')) reasons.push('Attendance trend is recent, not historical.');
  if(!reasons.length) reasons.push('No adverse signals in the recent window; risk reflects baseline variance.');
  return reasons;
}
