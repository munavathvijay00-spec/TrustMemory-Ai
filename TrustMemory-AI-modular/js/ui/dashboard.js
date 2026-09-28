/* =========================================================================
   ui/dashboard.js — Coordinator Dashboard: intel strip, risk overview, live feed
   ========================================================================= */

function pageDashboard(){
  recalcAll();
  const activeHelpers = S.helpers.length;
  const activeHouseholds = S.households.length;
  const activePlacements = S.placements.filter(p => p.status === 'active').length;
  const highChurn = S.helpers.filter(h => SCORES[h.id].churn >= 55).length;
  const highDiff = S.households.filter(h => SCORES[h.id].difficulty >= 55).length;
  const actions = S.recommendations.length;

  const alerts = buildAiNoticedAlerts();

  return `
    <div class="pagehead">
      <div class="eyebrow">Coordinator Dashboard</div>
      <h1>Your agency's memory, intelligence and action layer.</h1>
      <div class="lede">Every agent writes here: escalation calls from the Voice Agent, score changes from the Decision Agent, cross-placement patterns from the Reflection Agent, and pre-staged backups from the Matching Agent.</div>
    </div>
    <div class="grid g4" style="margin-bottom:30px;">
      <div class="metric"><div class="label">Active helpers</div><div class="num">${activeHelpers}</div></div>
      <div class="metric"><div class="label">Active households</div><div class="num">${activeHouseholds}</div></div>
      <div class="metric"><div class="label">Active placements</div><div class="num">${activePlacements}</div></div>
      <div class="metric"><div class="label">Actions required</div><div class="num ${actions > 0 ? 'warn' : ''}">${actions}</div></div>
    </div>
    <div class="grid g2" style="margin-bottom:30px;">
      <div class="metric"><div class="label">High churn risk</div><div class="num ${highChurn > 0 ? 'warn' : 'ok'}">${highChurn}</div></div>
      <div class="metric"><div class="label">High household difficulty</div><div class="num ${highDiff > 0 ? 'warn' : 'ok'}">${highDiff}</div></div>
    </div>
    <div class="section">
      <h2>AI noticed</h2>
      <div class="desc">Signals the system surfaced on its own, before a coordinator asked.</div>
      <div class="card">
        ${alerts.length ? alerts.map(a => alertRow(a)).join('') : emptyState('Nothing to flag right now.', 'Trigger an event from a helper or household profile, or run a Demo Mode scenario, to see this in action.')}
      </div>
    </div>
    ${S.stagedBackups.filter(b => b.status === 'staged').length ? `
    <div class="section">
      <h2>Pre-staged backups</h2>
      <div class="desc">The Matching Agent scores replacement candidates before a coordinator asks, using the Observation Network.</div>
      <div class="card">
        ${S.stagedBackups.filter(b => b.status === 'staged').map(b => {
          const hh = S.households.find(x => x.id === b.householdId);
          const backup = S.helpers.find(h => h.id === b.backupHelperId);
          const atRisk = S.helpers.find(h => h.id === b.atRiskHelperId);
          return alertRow({
            flag: 'warn',
            title: `${backup ? backup.name : ''} pre-staged as backup for ${hh ? hh.name : ''}.`,
            sub: `In case ${atRisk ? atRisk.name : 'the current helper'}'s placement needs replacement. Match score ${b.score}/100.`,
            cta: {label: 'View household', onClick: `nav('householdDetail','${b.householdId}')`}
          });
        }).join('')}
      </div>
    </div>` : ''}
    <div class="section">
      <h2>Get started</h2>
      <div class="grid g3">
        ${quickCard('Run Demo Mode', 'See the full remember → understand → predict → act → learn loop in ~90 seconds.', 'demo')}
        ${quickCard('Open Memory Explorer', 'Browse World, Experience, Opinion and Observation memory for any helper or household.', 'memory')}
        ${quickCard('Try Matching', 'Enter a household requirement and see a memory-informed recommendation.', 'matching')}
      </div>
    </div>
  `;
}

function quickCard(title, desc, page){
  return `<button class="card" style="text-align:left; cursor:pointer;" onclick="nav('${page}')">
    <div style="font-weight:600; font-size:13.5px; margin-bottom:4px;">${title}</div>
    <div style="color:var(--ink-soft); font-size:12px;">${desc}</div>
  </button>`;
}

function buildAiNoticedAlerts(){
  const alerts = [];
  S.recommendations.slice(0, 5).forEach(r => {
    alerts.push({
      flag: r.callType === 'escalation' ? 'bad' : 'warn',
      title: r.text,
      sub: 'Recommended action: ' + r.action,
      cta: {
        label: r.callType === 'escalation' ? 'Escalate' : 'Review',
        onClick: `nav('helperDetail','${r.entityId}')`
      }
    });
  });
  S.households.forEach(h => {
    const d = SCORES[h.id] ? SCORES[h.id].difficulty : computeDifficulty(h.id);
    if(d >= 55){
      alerts.push({
        flag: 'bad',
        title: `${h.name} has an elevated difficulty score (${d}/100).`,
        sub: 'Multiple placement replacements on record.',
        cta: {label: 'View reflection', onClick: `nav('householdDetail','${h.id}')`}
      });
    }
  });
  const priya = S.helpers.find(h => h.id === 'priya');
  if(priya){
    alerts.push({
      flag: 'info',
      title: `${priya.name} performs significantly better in elder care than child care.`,
      sub: 'Role-specific historical performance.',
      cta: {label: 'View matching', onClick: `nav('matching')`}
    });
  }
  return alerts;
}

function alertRow(a){
  return `<div class="alert">
    <div class="flag ${a.flag}"></div>
    <div class="body"><div class="title">${a.title}</div><div class="sub">${a.sub}</div></div>
    <div class="cta"><button class="btn sm" onclick="${a.cta.onClick}">${a.cta.label}</button></div>
  </div>`;
}

function wireDashboard(){}
