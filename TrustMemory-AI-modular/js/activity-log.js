/* =========================================================================
   activity-log.js — shared Agent Activity log + header ticker
   ========================================================================= */

function log(agentClass, agentLabel, text){
  const row = {t:nowStamp(), agentClass, agentLabel, text};
  S.activity.unshift(row);
  if(S.activity.length > 400) S.activity.length = 400;
  updateTicker(row);
  if(typeof route !== 'undefined' && route.page === 'activity' && typeof renderActivityList === 'function'){
    renderActivityList();
  }
}

function updateTicker(row){
  const el = document.getElementById('tickerText');
  if(el){
    el.innerHTML = `<b>${row.agentLabel}</b> — ${escapeHtml(row.text)}`;
  }
}
