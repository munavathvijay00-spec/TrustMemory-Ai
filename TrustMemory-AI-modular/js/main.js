/* =========================================================================
   main.js — boot sequence (loaded last)
   ========================================================================= */

function resetDemo(){
  S = clone(INITIAL);
  MEM = {};
  SCORES = {};
  SCORE_HISTORY = {};
  clockTick = 0;
  recalcAll();
  log('mem','MEMORY AGENT', 'Demo reset — all scores, events, calls and reflections restored to initial state.');
  renderCurrentPage();
}

async function syncBackendData(){
  try {
    const [hRes, cRes, aRes] = await Promise.all([
      fetch('/api/helpers').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/calls').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/activity').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    if(hRes && Array.isArray(hRes)){
      window.SERVER_SCORES = {};
      hRes.forEach(dbH => { window.SERVER_SCORES[dbH.id] = {trust: dbH.trust, churn: dbH.churn}; });
      hRes.forEach(dbH => {
        const local = S.helpers.find(h => h.id === dbH.id);
        if(local){
          local.exp = dbH.experience_years;
        }
        SCORES[dbH.id] = SCORES[dbH.id] || {};
        SCORES[dbH.id].trust = dbH.trust;
        SCORES[dbH.id].churn = dbH.churn;
      });
    }

    if(cRes && Array.isArray(cRes) && cRes.length > 0){
      cRes.forEach(c => {
        const existing = S.calls.find(x => x.id === c.id || (x.call_id && x.call_id === c.call_id));
        if(!existing){
          S.calls.push({
            id: c.id,
            call_id: c.call_id,
            type: c.scenario || 'coaching_call',
            helperId: c.helper_id || 'anita',
            householdId: c.outcome?.household_id || (S.placements.find(p => p.helperId === c.helper_id)?.householdId) || null,
            destinationPhone: c.outcome?.provider === 'browser_voice' ? 'Voice agent (Groq + Hindsight)' : (c.outcome?.provider || ''),
            lateCount: c.outcome?.late_count || 2,
            reason: c.outcome?.reason || `${c.outcome?.late_count || 2} recent late arrivals check-in`,
            status: c.status,
            transcript: c.transcript || [],
            summary: c.outcome?.coordinator_note || 'Outbound check-in completed.',
            sentiment: c.outcome?.sentiment || 'cooperative',
            experienceEntry: c.outcome,
            followUp: `Check-in on ${c.outcome?.follow_up_date || 'two weeks'}`,
            createdAt: c.created_at
          });
        }
      });
      S.calls.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    for(const h of S.helpers){
      try {
        const mRes = await fetch('/api/memories/' + encodeURIComponent(h.id)).then(r => r.ok ? r.json() : null).catch(() => null);
        if(mRes && Array.isArray(mRes)){
          const mem = memOf(h.id);
          mRes.forEach(dbM => {
            const layer = dbM.network;
            if(mem[layer] && !mem[layer].some(x => x.text === dbM.content)){
              mem[layer].unshift({
                id: dbM.id,
                text: dbM.content,
                t: dbM.created_at ? (dbM.created_at.split(' ')[1] || dbM.created_at) : nowStamp(),
                meta: {}
              });
            }
          });
        }
      } catch(e){}
    }

    if(aRes && Array.isArray(aRes) && aRes.length > 0){
      aRes.forEach(act => {
        if(!S.activity.some(x => x.text === act.text)){
          S.activity.unshift({
            t: act.created_at ? (act.created_at.split(' ')[1] || act.created_at) : nowStamp(),
            agentClass: act.agent || 'voice',
            agentLabel: (act.agent || 'voice').toUpperCase() + ' AGENT',
            text: act.text
          });
        }
      });
    }

    if(typeof recalcAll === 'function') recalcAll();
    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  } catch(err){
    console.warn('Backend sync note:', err.message);
  }
}

function initApp(){
  const resetBtn = document.getElementById('resetBtn');
  if(resetBtn){
    resetBtn.onclick = resetDemo;
  }

  recalcAll();
  renderAuthRail();
  buildNav();

  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn){
    showAuthGate();
  } else {
    highlightNav();
    renderCurrentPage();
  }

  // Sync real state from SQLite database
  syncBackendData();

  log('mem','MEMORY AGENT', 'System initialized. Institutional memory loaded for helpers and households.');
}

document.addEventListener('DOMContentLoaded', initApp);

// Also trigger immediately if DOM is already parsed
if(document.readyState === 'interactive' || document.readyState === 'complete'){
  initApp();
}
