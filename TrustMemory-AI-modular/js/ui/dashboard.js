/* =========================================================================
   ui/dashboard.js — Coordinator Dashboard. Every number and alert comes from
   GET /api/dashboard (server/memory-routes.js); nothing is computed here.
   ========================================================================= */

let dashData = null;
let dashLoading = false;

async function loadDashboard(){
  if(dashLoading) return;
  dashLoading = true;
  try { dashData = await fetch('/api/dashboard').then(r => r.json()); }
  catch(e){ dashData = {error: e.message}; }
  dashLoading = false;
  if(route.page === 'dashboard' && typeof renderCurrentPage === 'function') renderCurrentPage();
}

function dashRing(helperId){
  if(typeof startCall === 'function') startCall('coaching', helperId);
}

function dashAction(a){
  if(!a) return '';
  if(a.ring) return `<button class="btn sm primary" onclick="dashRing('${a.ring}')">${escapeHtml(a.label)}</button>`;
  return `<button class="btn sm" onclick="nav('${a.page}','${a.param || ''}')">${escapeHtml(a.label)}</button>`;
}

function dashGreeting(){
  const h = new Date().getHours();
  const name = typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.name ? String(CURRENT_USER.name) : '';
  const first = name && !/agency|coordinator/i.test(name) ? ', ' + name.split(' ')[0] : '';
  return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + first;
}

function pageDashboard(){
  if(!dashData && !dashLoading) loadDashboard();
  const d = dashData;
  const c = d && d.counts;
  const tile = (n, label, warn) => `<div class="metric"><div class="label">${label}</div><div class="num ${warn ? 'warn' : ''}">${n == null ? '–' : n}</div></div>`;

  const dueHtml = !d ? '<div class="card" style="font-size:12.5px; color:var(--ink-soft);">Loading…</div>'
    : d.error ? `<div class="card" style="color:var(--rust); font-size:12.5px;">${escapeHtml(d.error)}</div>`
    : d.due.length ? `<div class="card">${d.due.map(x => `<div style="display:flex; justify-content:space-between; gap:10px; align-items:center; padding:8px 0; border-top:1px solid var(--line);">
        <div><div style="font-size:13px; font-weight:600;">${escapeHtml(x.helper_name)} <span class="badge ${x.overdue ? 'bad' : x.due_today ? 'warn' : 'neutral'}">${x.overdue ? 'overdue' : x.due_today ? 'due today' : 'due ' + escapeHtml(x.due_date)}</span></div>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">Promise to check: ${escapeHtml(x.text)}</div></div>
        <button class="btn sm primary" onclick="dashRing('${x.helper_id}')">Ring</button>
      </div>`).join('')}</div>`
    : `<div class="card">${emptyState('No follow-ups due in the next three days.', 'Every promise made on a call gets a check-in date two weeks later; it appears here when it is due.')}</div>`;

  const alertsHtml = !d || d.error ? '' : (d.alerts.length
    ? d.alerts.map(a => `<div class="alert"><div class="flag ${a.level}"></div><div class="body"><div class="title">${escapeHtml(a.title)}</div><div class="sub">${escapeHtml(a.detail)}</div></div><div class="cta">${dashAction(a.action)}</div></div>`).join('')
    : emptyState('Nothing to flag right now.', 'Alerts appear when a helper breaks promises, a follow-up is overdue, churn risk is high, or a household keeps losing helpers.'));

  return `
    ${typeof motionHero === 'function' ? motionHero({
      eyebrow: 'Coordinator Dashboard · ' + new Date().toLocaleDateString('en-IN', {weekday: 'long', day: 'numeric', month: 'long'}),
      title: dashGreeting() + '. <em>Here is what needs you today.</em>',
      lede: 'Follow-ups that are due, escalations and risks, all from agency memory and the commitment ledger. Every point on the right is a helper or household the agency remembers.',
      stats: [{n: c && c.promises_open, label: 'open promises'}, {n: d && d.due ? d.due.length : null, label: 'follow-ups due'}, {n: d && d.alerts ? d.alerts.length : null, label: 'need attention'}],
    }) : `<div class="pagehead"><div class="eyebrow">Coordinator Dashboard</div><h1>What needs you today</h1></div>`}
    ${typeof careSafetyCard === 'function' ? careSafetyCard() : ''}
    <div class="grid g4" style="margin-bottom:20px;">
      ${tile(c && c.helpers, 'Helpers')}
      ${tile(c && c.active_placements, 'Active placements')}
      ${tile(c && c.calls_last_7_days, 'Calls in the last 7 days')}
      ${tile(c && (c.promises_kept_rate == null ? '–' : c.promises_kept_rate + '%'), 'Promises kept')}
    </div>
    ${typeof requestsCard === 'function' ? requestsCard() : ''}
    ${typeof outreachTodayCard === 'function' ? outreachTodayCard() : ''}
    <div class="section">
      <h2>Follow-ups due</h2>
      ${dueHtml}
    </div>
    ${typeof renderWhoToCall === 'function' ? renderWhoToCall() : ''}
    <div class="section">
      <h2>Needs attention</h2>
      <div class="card">${d ? alertsHtml : 'Loading…'}</div>
    </div>
    ${typeof renderLearningMetrics === 'function' ? '<div style="margin-bottom:20px;">' + renderLearningMetrics() + '</div>' : ''}
  `;
}

function wireDashboard(){
  if(typeof careWireDashboard === 'function') careWireDashboard();
  if(typeof outreachWireDashboard === 'function') outreachWireDashboard();
}
