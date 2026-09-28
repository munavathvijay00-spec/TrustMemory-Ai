/* =========================================================================
   main.js — boot sequence (loaded last)
   ========================================================================= */

/**
 * Drop the browser's cached copy and reload everything from the server.
 * Nothing on the server or in Hindsight is changed.
 */
function resetDemo(){
  S = clone(INITIAL);
  MEM = {};
  SCORES = {};
  SCORE_HISTORY = {};
  window.SERVER_SCORES = null;
  window.SERVER_DIFFICULTY = null;
  recalcAll();
  renderCurrentPage();
  log('mem','MEMORY AGENT', 'Reloading helpers, households, calls and memories from the server.');
  syncBackendData();
}

/** Add a timeline event once (by id). Events come only from server records. */
function addEventOnce(e){
  if(!S.events.some(x => x.id === e.id)) S.events.push(e);
}

function parseSkills(v){
  if(Array.isArray(v)) return v;
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; }
}

/** Server helper row -> console helper object (added if new, profile fields refreshed if known). */
function upsertHelperFromServer(r){
  const skills = parseSkills(r.skills);
  let h = S.helpers.find(x => x.id === r.id);
  if(!h){
    h = {id: r.id, name: r.name, location: '', exp: 0, skills: [], availability: '', roleScores: {}, color: r.color || '#5B6572'};
    S.helpers.push(h);
  }
  h.name = r.name;
  h.exp = r.experience_years;
  if(r.location) h.location = r.location;
  if(skills.length) h.skills = skills;
  else if(!h.skills.length && r.role) h.skills = [r.role];
  if(r.availability) h.availability = r.availability;
  if(r.color) h.color = r.color;
  return h;
}

function upsertHouseholdFromServer(r){
  let hh = S.households.find(x => x.id === r.id);
  if(!hh){
    hh = {id: r.id, name: r.name, location: '', requirement: r.need, schedule: ''};
    S.households.push(hh);
  }
  hh.name = r.name;
  hh.requirement = r.need || hh.requirement;
  if(r.location) hh.location = r.location;
  if(r.schedule) hh.schedule = r.schedule;
  return hh;
}

async function syncBackendData(){
  try {
    const [hRes, hhRes, cRes, aRes] = await Promise.all([
      fetch('/api/helpers').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/households').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/calls').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/activity').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    // The roster comes from the server, so people added from the console survive a refresh.
    if(hRes && Array.isArray(hRes)) hRes.forEach(upsertHelperFromServer);
    if(hhRes && Array.isArray(hhRes)) hhRes.forEach(upsertHouseholdFromServer);

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

    if(hhRes && Array.isArray(hhRes)){
      window.SERVER_DIFFICULTY = {};
      hhRes.forEach(dbHh => { window.SERVER_DIFFICULTY[dbHh.id] = dbHh.difficulty; });
    }

    if(cRes && Array.isArray(cRes) && cRes.length > 0){
      cRes.forEach(c => {
        const existing = S.calls.find(x => x.id === c.id || (x.call_id && x.call_id === c.call_id));
        if(!existing){
          S.calls.push({
            id: c.id,
            call_id: c.call_id,
            type: c.scenario || 'coaching_call',
            helperId: c.helper_id,
            householdId: c.outcome?.household_id || (S.placements.find(p => p.helperId === c.helper_id)?.householdId) || null,
            destinationPhone: c.outcome?.provider === 'browser_voice' ? 'Voice agent (Groq + Hindsight)' : (c.outcome?.provider || ''),
            lateCount: c.outcome?.late_count ?? null,
            reason: c.outcome?.reason || (c.outcome?.late_count ? `${c.outcome.late_count} recent late arrivals check-in` : 'Voice call'),
            status: c.status,
            transcript: c.transcript || [],
            summary: c.outcome?.coordinator_note || '',
            sentiment: c.outcome?.sentiment || '',
            experienceEntry: c.outcome,
            followUp: c.outcome?.follow_up_date ? `Check-in on ${c.outcome.follow_up_date}` : '',
            createdAt: c.created_at
          });
        }
      });
      S.calls.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      cRes.forEach(c => {
        if(!c.helper_id || c.status !== 'completed') return;
        addEventOnce({id:'call_' + c.id, helperId:c.helper_id, householdId:c.outcome?.household_id || null, placementId:null,
          type:'coaching_completed', description:c.outcome?.coordinator_note || 'Voice call completed.',
          severity:null, date:String(c.created_at || '').slice(0,10) || todayIso(), source:'server'});
      });
    }

    for(const h of S.helpers){
      try {
        const mRes = await fetch('/api/memories/' + encodeURIComponent(h.id)).then(r => r.ok ? r.json() : null).catch(() => null);
        if(mRes && Array.isArray(mRes)){
          const mem = memOf(h.id);
          mRes.forEach(dbM => {
            const layer = dbM.network;
            if(layer === 'experience'){
              addEventOnce({id:'mem_' + dbM.id, helperId:h.id, householdId:dbM.household_id || null, placementId:null,
                type:'note', description:dbM.content, severity:null, date:String(dbM.created_at || '').slice(0,10), source:'server'});
            }
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

/** Groq / Hindsight / retry-queue status in the sidebar (what the Settings page used to show). */
async function renderRailStatus(){
  const el = document.getElementById('railStatus');
  if(!el) return;
  try {
    const h = await fetch('/api/health').then(r => r.json());
    const dot = ok => `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${ok ? '#5FB38A' : '#D9822B'}; margin-right:4px;"></span>`;
    el.innerHTML = `<div style="font-size:11px; color:#A6B0BD; padding:8px 14px; line-height:1.7;">
      ${dot(h.groq && h.groq.configured)}Groq${h.groq && h.groq.keys ? ' · ' + h.groq.keys + ' key' + (h.groq.keys === 1 ? '' : 's') : ''}<br>
      ${dot(h.hindsight && h.hindsight.configured)}Hindsight${h.hindsight && h.hindsight.bank ? ' · ' + h.hindsight.bank : ''}<br>
      ${h.retains_waiting ? dot(false) + h.retains_waiting + ' retain' + (h.retains_waiting === 1 ? '' : 's') + ' waiting for retry' : ''}
    </div>`;
  } catch(e){
    el.innerHTML = '<div style="font-size:11px; color:#D9822B; padding:8px 14px;">Server unreachable</div>';
  }
}

/** Sidebar, first page and data sync, once the signed-in role is known. */
function startConsole(){
  const admin = CURRENT_USER.role === 'admin';
  if(!admin){
    route = {page: homePageFor(), param: null};
    if(typeof writeHash === 'function') writeHash(route.page, null);
  }
  // Helpers and households get a plain sidebar: no reload button, no service status.
  const resetBtn = document.getElementById('resetBtn');
  if(resetBtn && resetBtn.style) resetBtn.style.display = admin ? '' : 'none';

  recalcAll();
  renderAuthRail();
  buildNav();
  highlightNav();
  renderCurrentPage();
  if(typeof window.scrollTo === 'function') window.scrollTo(0, 0);   // the sign-in screen may have been scrolled
  if(!admin) return;

  // Sync real state from SQLite database
  syncBackendData();
  renderRailStatus();
  setInterval(renderRailStatus, 30000);

  log('mem','MEMORY AGENT', 'System initialized. Institutional memory loaded for helpers and households.');
}

let APP_STARTED = false;

function initApp(){
  if(APP_STARTED) return;
  APP_STARTED = true;
  const resetBtn = document.getElementById('resetBtn');
  if(resetBtn){
    resetBtn.onclick = resetDemo;
  }

  // Restore the page from the URL (#/page/param) so a refresh keeps the coordinator where they were.
  const fromHash = typeof routeFromHash === 'function' ? routeFromHash() : null;
  if(fromHash) route = fromHash;
  if(typeof window.addEventListener === 'function') window.addEventListener('hashchange', () => {
    const r = routeFromHash();
    if(r && (r.page !== route.page || String(r.param || '') !== String(route.param || ''))) nav(r.page, r.param, {fromHash: true});
  });

  // Who is signed in decides everything else: the sign-in screen, "waiting for approval",
  // or the console for that role. If the server cannot be reached, show the coordinator view.
  const content = document.getElementById('content');
  if(content) content.innerHTML = '<div class="empty"><p>Loading…</p></div>';
  authBoot().then(state => {
    // Unreachable server: say so and retry. (The offline smoke test opts into the console view.)
    if(state === 'offline' && !window.TM_OFFLINE_CONSOLE) return showOfflineScreen();
    if(state === 'gate') return showAuthGate('login');
    if(state === 'pending') return showPendingScreen();
    authLock(false);
    startConsole();
  }).catch(err => console.warn('Start-up note:', err && err.message));
}

document.addEventListener('DOMContentLoaded', initApp);

// Also trigger immediately if DOM is already parsed
if(document.readyState === 'interactive' || document.readyState === 'complete'){
  initApp();
}
