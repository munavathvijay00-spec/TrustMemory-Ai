/* =========================================================================
   ui/activity-page.js — Live Agent Operating Log
   ========================================================================= */

function pageActivity(){
  return `<div class="pagehead"><div class="eyebrow">Agent Activity</div><h1>Live agent operating log</h1><div class="lede">Every retain, recall, reflection, match and call — in order.</div></div>
  <div class="card"><div id="activityList">${activityRows()}</div></div>`;
}

function activityRows(){
  if(!S.activity.length) return emptyState('No activity yet.', 'Start a call from the Voice Agent page, add a note, or run matching.');
  return S.activity.slice(0, 150).map(a => `<div class="activity-row"><div class="t">${a.t}</div><div><span class="agent ${a.agentClass}">${a.agentLabel}</span></div><div>${escapeHtml(a.text)}</div></div>`).join('');
}

function renderActivityList(){
  const el = document.getElementById('activityList');
  if(el) el.innerHTML = activityRows();
}
