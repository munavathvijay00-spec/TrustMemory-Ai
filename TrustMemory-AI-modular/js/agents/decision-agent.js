/* =========================================================================
   agents/decision-agent.js — score cache for the console

   The Decision Agent that owns trust, churn and household difficulty is
   server/decision.js. The browser only shows the server's numbers
   (window.SERVER_SCORES / SERVER_DIFFICULTY, filled by syncBackendData in
   main.js); nothing is computed here. Until the first sync a neutral value is
   shown.
   ========================================================================= */

function helperEvents(id){
  return S.events.filter(e => e.helperId === id);
}

function householdEvents(id){
  return S.events.filter(e => e.householdId === id);
}

function recalcAll(){
  S.helpers.forEach(h => {
    SCORES[h.id] = SCORES[h.id] || {};
    const server = window.SERVER_SCORES && window.SERVER_SCORES[h.id];
    SCORES[h.id].trust = server ? server.trust : (SCORES[h.id].trust != null ? SCORES[h.id].trust : 0);
    SCORES[h.id].churn = server ? server.churn : (SCORES[h.id].churn != null ? SCORES[h.id].churn : 0);

    SCORE_HISTORY[h.id] = SCORE_HISTORY[h.id] || [];
    const last = SCORE_HISTORY[h.id][SCORE_HISTORY[h.id].length - 1];
    if(server && (!last || last.trust !== SCORES[h.id].trust || last.churn !== SCORES[h.id].churn)){
      SCORE_HISTORY[h.id].push({t: nowStamp(), trust: SCORES[h.id].trust, churn: SCORES[h.id].churn});
      if(SCORE_HISTORY[h.id].length > 20) SCORE_HISTORY[h.id].shift();
    }
  });

  S.households.forEach(h => {
    SCORES[h.id] = SCORES[h.id] || {};
    const serverDiff = window.SERVER_DIFFICULTY && window.SERVER_DIFFICULTY[h.id];
    SCORES[h.id].difficulty = serverDiff != null ? serverDiff : (SCORES[h.id].difficulty != null ? SCORES[h.id].difficulty : 0);
  });
}

/** Fallback explanation when the Decision Agent has not scored this helper from a call yet. */
function churnWhy(helperId, churnScore){
  return ['Not yet scored from a call: this is the starting value on file. The Decision Agent re-scores after every call, with named reasons.'];
}
