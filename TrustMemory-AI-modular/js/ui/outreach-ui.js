/* =========================================================================
   ui/outreach-ui.js — calling before problems and learning across helpers.
   "Today's calls" on the dashboard (GET /api/outreach/today) and "What works
   across the agency" on Hindsight Core (GET /api/outreach/learning).
   ========================================================================= */

const OUTREACH = { today: null, todayAt: 0, todayLoading: false, learning: null, learningAt: 0, learningLoading: false, showLow: false };
const OUTREACH_STALE_MS = 2 * 60 * 1000;

const OUTREACH_KIND = {
  promise_due: 'Promise due',
  escalation: 'Escalation',
  festival_risk: 'Festival',
  advance_requests: 'Salary advance',
  no_recent_call: 'Quiet',
};

async function outreachLoadToday(){
  if(OUTREACH.todayLoading) return;
  OUTREACH.todayLoading = true;
  try {
    const res = await fetch('/api/outreach/today');
    const d = await res.json().catch(() => ({}));
    OUTREACH.today = res.ok ? d : {error: d.error || ('HTTP ' + res.status)};
    OUTREACH.todayAt = Date.now();
  } catch(e){ OUTREACH.today = {error: e.message}; }
  OUTREACH.todayLoading = false;
  if(route.page === 'dashboard' && typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function outreachLoadLearning(){
  if(OUTREACH.learningLoading) return;
  OUTREACH.learningLoading = true;
  try {
    const res = await fetch('/api/outreach/learning');
    const d = await res.json().catch(() => ({}));
    OUTREACH.learning = res.ok ? d : {error: d.error || ('HTTP ' + res.status)};
    OUTREACH.learningAt = Date.now();
  } catch(e){ OUTREACH.learning = {error: e.message}; }
  OUTREACH.learningLoading = false;
  if(route.page === 'memory' && typeof renderCurrentPage === 'function') renderCurrentPage();
}

/** Start a call to this helper with the reason the agency is ringing today. */
function outreachRing(helperId){
  const row = OUTREACH.today && (OUTREACH.today.calls || []).find(c => c.helper_id === helperId);
  const purpose = row ? row.purpose : '';
  window.VOICE_FORM = Object.assign(window.VOICE_FORM || {late: 1}, {helper: helperId, purpose, scenario: 'coaching_call'});
  nav('voice');
  // Use the language she asked to be called in (her saved preference), then ring.
  const ring = () => {
    const sel = document.getElementById('vHelper');
    if(sel) sel.value = helperId;
    const lang = document.getElementById('vLanguage');
    if(lang && window.VOICE_FORM && window.VOICE_FORM.language) lang.value = window.VOICE_FORM.language;
    if(typeof startLiveVoiceSession === 'function') startLiveVoiceSession();
  };
  const prefs = typeof REQ !== 'undefined' && REQ.helperPrefs;
  const p = prefs && prefs[helperId];
  window.VOICE_FORM.language = (p && p.language) || 'en';
  if(typeof reqLoadHelperPrefs === 'function' && prefs === null){
    reqLoadHelperPrefs().then(() => { const q = (REQ.helperPrefs || {})[helperId]; window.VOICE_FORM.language = (q && q.language) || 'en'; setTimeout(ring, 150); }).catch(() => setTimeout(ring, 150));
  } else setTimeout(ring, 250);
}

function outreachToggleLow(){
  OUTREACH.showLow = !OUTREACH.showLow;
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function outreachReason(r){
  const src = r.source ? `<span style="color:var(--ink-soft);"> · ${escapeHtml(r.source)}${r.when ? ', ' + escapeHtml(r.when) : ''}</span>` : '';
  const mem = (r.memory || []).length
    ? `<div style="margin-top:3px;">${r.memory.map(m => `<div style="font-size:11.5px; color:var(--teal);">Hindsight${m.when ? ' (' + escapeHtml(m.when) + ')' : ''}: ${escapeHtml(m.text)}</div>`).join('')}</div>`
    : '';
  return `<div style="margin-top:6px;">
      <div style="font-size:12.5px;"><span class="badge neutral" style="margin-right:6px;">${escapeHtml(OUTREACH_KIND[r.kind] || r.kind)}</span><b>${escapeHtml(r.text)}</b></div>
      <div style="font-size:12px; color:var(--ink-soft); margin-top:2px; line-height:1.45;">${escapeHtml(r.evidence || '')}${src}</div>
      ${mem}
    </div>`;
}

function outreachRow(c){
  const cls = c.priority === 'high' ? 'bad' : c.priority === 'medium' ? 'warn' : 'neutral';
  return `<div style="display:flex; justify-content:space-between; gap:14px; align-items:flex-start; padding:10px 0; border-top:1px solid var(--line);">
      <div style="min-width:0;">
        <div style="font-size:13.5px; font-weight:600;">${escapeHtml(c.helper_name)} <span class="badge ${cls}">${escapeHtml(c.priority)} priority</span></div>
        ${c.reasons.map(outreachReason).join('')}
      </div>
      <button class="btn sm primary" style="flex:none;" onclick="outreachRing('${escapeHtml(c.helper_id)}')" title="${escapeHtml(c.purpose)}">Ring with this reason</button>
    </div>`;
}

function outreachTodayCard(){
  // Refresh in the background when stale, so a finished call shows up on the next visit.
  if((!OUTREACH.today || Date.now() - OUTREACH.todayAt > OUTREACH_STALE_MS) && !OUTREACH.todayLoading) outreachLoadToday();
  const d = OUTREACH.today;
  let body;
  if(!d) body = '<div style="font-size:12.5px; color:var(--ink-soft);">Working out who to call today…</div>';
  else if(d.error) body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(d.error)}</div>`;
  else if(!d.calls.length) body = emptyState('No calls needed today.', 'Calls appear here when a promise is due, a festival is coming and a helper went home and came back late last time, or she keeps asking for salary advances.');
  else {
    const main = d.calls.filter(c => c.priority !== 'low');
    const low = d.calls.filter(c => c.priority === 'low');
    const shown = OUTREACH.showLow || !main.length ? d.calls : main;
    const toggle = main.length && low.length
      ? `<div style="padding-top:8px; border-top:1px solid var(--line);"><button class="btn sm" onclick="outreachToggleLow()">${OUTREACH.showLow ? 'Hide' : 'Show'} ${low.length} low-priority check-in${low.length === 1 ? '' : 's'}</button></div>`
      : '';
    body = shown.map(outreachRow).join('') + toggle;
  }
  const fests = d && !d.error && d.upcoming_festivals && d.upcoming_festivals.length
    ? `<div style="font-size:12px; color:var(--ink-soft); margin-bottom:6px;">Coming up: ${d.upcoming_festivals.map(f => `${escapeHtml(f.name)} ${escapeHtml(new Date(f.date + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}))} (in ${f.days_away} days)`).join(' · ')}</div>`
    : '';
  const memNote = d && !d.error && d.memory_source && d.memory_source !== 'hindsight'
    ? `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Hindsight memory ${d.memory_source === 'off' ? 'is not configured' : 'could not be read just now'}; reasons come from the ledger and agency records.</div>`
    : '';
  return `<div class="section">
      <h2>Today's calls</h2>
      <div class="card">
        <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:6px;">Who to ring before a problem happens, and why. Every reason says where it came from.</div>
        ${fests}
        ${body}
        ${memNote}
      </div>
    </div>`;
}

function outreachWireDashboard(){}

function outreachApproachCell(a){
  const cls = a.kept_rate >= 67 ? 'ok' : a.kept_rate >= 50 ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${a.kept} of ${a.total} kept</span> <span style="font-size:11.5px; color:var(--ink-soft);">${a.helpers} helper${a.helpers === 1 ? '' : 's'}</span>`;
}

function outreachAgencyLearning(){
  if((!OUTREACH.learning || Date.now() - OUTREACH.learningAt > OUTREACH_STALE_MS) && !OUTREACH.learningLoading) outreachLoadLearning();
  const d = OUTREACH.learning;
  let body;
  if(!d) body = '<div style="font-size:12.5px; color:var(--ink-soft);">Reading the commitment ledger…</div>';
  else if(d.error) body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(d.error)}</div>`;
  else if(!d.by_problem.length) body = emptyState('Nothing learned across helpers yet.', 'Each promise made on a call is labelled with the kind of problem it fixes. Once promises are kept or broken, this shows which approach works for each kind of problem.');
  else {
    const approaches = Object.keys(d.approach_labels || {});
    const labels = d.approach_labels || {};
    const head = `<tr><th style="text-align:left; padding:6px 8px; font-size:11.5px; color:var(--ink-soft);">Problem</th>${approaches.map(a => `<th style="text-align:left; padding:6px 8px; font-size:11.5px; color:var(--ink-soft);">${escapeHtml(labels[a].charAt(0).toUpperCase() + labels[a].slice(1))}</th>`).join('')}</tr>`;
    const rows = d.by_problem.map(p => `<tr style="border-top:1px solid var(--line);">
        <td style="padding:8px; font-size:12.5px; font-weight:600; text-transform:capitalize;">${escapeHtml(p.label)}</td>
        ${approaches.map(a => { const cell = p.approaches.find(x => x.approach === a); return `<td style="padding:8px;">${cell ? outreachApproachCell(cell) : '<span style="color:var(--ink-soft); font-size:12px;">–</span>'}</td>`; }).join('')}
      </tr>`).join('');
    const takeaways = d.by_problem.map(p => `<li style="margin-bottom:4px;">${escapeHtml(p.takeaway)}</li>`).join('');
    const prior = d.prior
      ? `<div style="font-size:12px; color:var(--ink-soft); margin-top:8px;">For a helper with no history of her own, the voice agent starts from <b>${escapeHtml(labels[d.prior.approach] || d.prior.approach)}</b> (kept ${d.prior.kept} of ${d.prior.total} across ${d.prior.helpers} helpers).</div>`
      : '';
    body = `<div style="overflow-x:auto;"><table style="border-collapse:collapse; width:100%;">${head}${rows}</table></div>
      <ul style="font-size:12.5px; line-height:1.5; margin:12px 0 0 18px; padding:0;">${takeaways}</ul>
      ${prior}
      ${d.untyped_resolved ? `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">${d.untyped_resolved} resolved promise${d.untyped_resolved === 1 ? ' has' : 's have'} no problem type yet and ${d.untyped_resolved === 1 ? 'is' : 'are'} not counted.</div>` : ''}`;
  }
  return `<div class="section">
      <h2>What works across the agency</h2>
      <div class="card">
        <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:8px;">From the commitment ledger: for each kind of problem, how often promises were kept after each coaching approach. Changes are retained to Hindsight as dated facts.</div>
        ${body}
      </div>
    </div>`;
}

function outreachWireMemory(){}
