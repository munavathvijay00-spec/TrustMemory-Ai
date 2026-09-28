/* =========================================================================
   ui/requests-ui.js — requests and preferences in people's own words.

   Helper view: "Tell the agency" (leave, running late, problem at work, pay
   issue), festival leave planning, and how the agency should call her.
   Household view: "Ask the agency" (concern, check-in, cover, schedule,
   praise) and what the next helper should know about the home.
   Coordinator: open requests on the dashboard, and a helper's call
   preference on the Voice Agent form. Data: /api/me/*, /api/requests.
   ========================================================================= */

const REQ_KINDS = {
  helper: [['leave', 'Leave'], ['running_late', 'Running late'], ['problem_at_work', 'Problem at work'], ['pay_issue', 'Pay issue'], ['other', 'Other']],
  household: [['concern', 'Concern'], ['checkin_request', 'Ask for a check-in'], ['cover_needed', 'Need cover'], ['schedule_change', 'Schedule change'], ['praise', 'Praise']],
};
const REQ_DATED = ['leave', 'cover_needed'];
const REQ_PLACEHOLDER = {
  leave: 'e.g. I am going home to Warangal for Dussehra and will be back on the 26th.',
  running_late: 'e.g. The bus is delayed; I will reach by 9:30.',
  problem_at_work: 'e.g. The family has asked me to do extra cooking every day.',
  pay_issue: 'e.g. My salary for this month has not come yet.',
  other: 'Write what the agency should know.',
  concern: 'e.g. She has been late three times this week.',
  checkin_request: 'e.g. Please call us this week about the new timings.',
  cover_needed: 'e.g. Our helper is away for Diwali; we need someone for the mornings.',
  schedule_change: 'e.g. From next month we need her from 8 am instead of 9.',
  praise: 'e.g. She handled our father\'s fall very calmly.',
};
const REQ_LANGS = [['en', 'English'], ['hi', 'हिन्दी · Hindi'], ['te', 'తెలుగు · Telugu']];

const REQ = {
  mine: null, festivals: null, prefs: null, notes: null,
  open: null, openAt: 0, helperPrefs: null,
  form: {kind: '', text: '', from: '', to: ''},
  msg: '', err: '', prefsMsg: '', notesMsg: '', loading: {},
};

(function reqStyles(){
  if(typeof document === 'undefined' || !document.head || !document.createElement) return;
  const s = document.createElement('style');
  s.textContent = `
  .req-chips{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;}
  .req-chip{border:1px solid var(--line-strong); background:var(--card); color:var(--ink); border-radius:999px; padding:6px 13px; font-size:12.5px; font-weight:600; cursor:pointer; transition:all .15s;}
  .req-chip:hover{border-color:var(--brass);}
  .req-chip.on{background:var(--ink); color:var(--card); border-color:var(--ink);}
  .req-chip.pay.on{background:var(--rust); border-color:var(--rust); color:#fff;}
  .req-item{padding:10px 0; border-top:1px solid var(--line); font-size:12.5px;}
  .req-item .top{display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
  .req-item .when{font-family:var(--font-mono); font-size:11px; color:var(--ink-faint);}
  .req-item .words{margin-top:4px; font-size:13px; color:var(--ink);}
  .req-item .reply{margin-top:4px; color:var(--teal); font-size:12px;}
  .req-fest{display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-top:1px solid var(--line);}
  .req-fest:first-child{border-top:none;}
  .req-ok{font-size:12.5px; color:var(--teal); margin:8px 0;}
  .req-err{font-size:12.5px; color:var(--rust); margin:8px 0;}
  .req-row{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
  @media (max-width:760px){ .req-row{grid-template-columns:1fr;} }`;
  document.head.appendChild(s);
})();

async function reqJson(url, opts){
  const res = await fetch(url, opts);
  const d = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
const reqPost = (url, body, method = 'POST') => reqJson(url, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})});

function reqRerender(){ if(typeof renderCurrentPage === 'function') renderCurrentPage(); }

function reqDate(d){
  if(!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
}

function reqStatus(r){
  return r.status === 'acknowledged'
    ? '<span class="badge ok">Seen by the agency</span>'
    : '<span class="badge warn">Open</span>';
}

function reqItemHtml(r, {showWho = false} = {}){
  const dates = r.date_from ? ` · ${escapeHtml(reqDate(r.date_from))}${r.date_to && r.date_to !== r.date_from ? ' – ' + escapeHtml(reqDate(r.date_to)) : ''}` : '';
  return `<div class="req-item">
    <div class="top">
      ${showWho ? `<b>${escapeHtml(r.person_name)}</b><span class="badge neutral">${r.role === 'helper' ? 'helper' : 'household'}</span>` : ''}
      <span class="badge ${r.kind === 'pay_issue' ? 'bad' : 'neutral'}">${escapeHtml(r.kind_label || r.kind)}</span>
      ${showWho ? '' : reqStatus(r)}
      <span class="when">${escapeHtml(String(r.created_at || '').slice(0, 10))}${dates}</span>
    </div>
    <div class="words">“${escapeHtml(r.text)}”</div>
    ${r.coordinator_note ? `<div class="reply">Agency: ${escapeHtml(r.coordinator_note)}</div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ helper and household: requests */

async function reqLoadMine(){
  if(REQ.loading.mine) return;
  REQ.loading.mine = true;
  try { REQ.mine = (await reqJson('/api/me/requests')).requests || []; } catch(e){ REQ.mine = []; }
  REQ.loading.mine = false;
  reqRerender();
}

function reqPickKind(kind){ REQ.form.kind = kind; REQ.err = ''; REQ.msg = ''; reqRerender(); }

/** "Tell the agency" (helper) or "Ask the agency" (household). */
function reqFormCard(role){
  if(REQ.mine === null) setTimeout(reqLoadMine, 0);
  const kinds = REQ_KINDS[role];
  const f = REQ.form;
  if(!kinds.some(k => k[0] === f.kind)) f.kind = kinds[0][0];
  const dated = REQ_DATED.includes(f.kind);
  const list = REQ.mine === null ? '<div class="sub" style="margin-top:10px;">Loading your requests…</div>'
    : REQ.mine.length ? `<div style="margin-top:14px;"><div style="font-size:12px; font-weight:600; color:var(--ink-soft);">Your requests</div>${REQ.mine.map(r => reqItemHtml(r)).join('')}</div>`
    : '';
  return `<div class="section">
    <h2>${role === 'helper' ? 'Tell the agency' : 'Ask the agency'}</h2>
    <div class="card">
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:12px;">${role === 'helper'
        ? 'Ask for leave, say you are running late, or tell the agency about a problem. The agency sees it straight away and remembers it for your next call.'
        : 'Raise a concern, ask for a check-in or cover, or tell the agency about a change. The agency sees it straight away and remembers it.'}</div>
      <form id="reqForm" novalidate>
        <div class="req-chips">${kinds.map(([k, l]) => `<button type="button" class="req-chip ${k === 'pay_issue' ? 'pay' : ''} ${k === f.kind ? 'on' : ''}" onclick="reqPickKind('${k}')">${l}</button>`).join('')}</div>
        ${dated ? `<div class="req-row">
          <label class="auth-field"><span>From</span><input type="date" id="reqFrom" value="${escapeHtml(f.from)}" oninput="REQ.form.from = this.value"></label>
          <label class="auth-field"><span>To</span><input type="date" id="reqTo" value="${escapeHtml(f.to)}" oninput="REQ.form.to = this.value"></label>
        </div>` : ''}
        <label class="auth-field"><span>${f.kind === 'pay_issue' ? 'What happened with your pay?' : 'Message'}</span>
          <textarea id="reqText" rows="3" maxlength="500" placeholder="${escapeHtml(REQ_PLACEHOLDER[f.kind] || '')}" oninput="REQ.form.text = this.value">${escapeHtml(f.text)}</textarea></label>
        ${f.kind === 'pay_issue' ? '<div class="sub" style="font-size:11.5px; margin:-4px 0 8px;">Only the agency coordinator sees this. The household is not told.</div>' : ''}
        ${REQ.err ? `<div class="req-err">${escapeHtml(REQ.err)}</div>` : ''}
        ${REQ.msg ? `<div class="req-ok">${escapeHtml(REQ.msg)}</div>` : ''}
        <button class="btn primary" type="submit">Send to the agency</button>
      </form>
      ${list}
    </div>
  </div>`;
}

async function reqSubmit(event){
  event.preventDefault();
  const f = REQ.form;
  REQ.err = ''; REQ.msg = '';
  const text = String(f.text || '').trim();
  if(text.length < 3){ REQ.err = 'Write at least a few words.'; return reqRerender(); }
  if(REQ_DATED.includes(f.kind) && !f.from){ REQ.err = 'Pick the dates.'; return reqRerender(); }
  const body = {kind: f.kind, text};
  if(f.from){ body.date_from = f.from; body.date_to = f.to || f.from; }
  const btn = event.target.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  try {
    await reqPost('/api/me/requests', body);
    REQ.form = {kind: f.kind, text: '', from: '', to: ''};
    REQ.msg = 'Sent. The agency has it and will remember it.';
    REQ.mine = null;
    await reqLoadMine();
  } catch(e){ REQ.err = e.message; if(btn) btn.disabled = false; reqRerender(); }
}

/* ------------------------------------------------------------------ helper: festival leave, call preferences */

async function reqLoadFestivals(){
  if(REQ.loading.fest) return;
  REQ.loading.fest = true;
  try { REQ.festivals = (await reqJson('/api/me/festivals')).festivals || []; } catch(e){ REQ.festivals = []; }
  REQ.loading.fest = false;
  reqRerender();
}

function reqPlanLeave(key){
  const fest = (REQ.festivals || []).find(x => x.key === key);
  if(!fest) return;
  const d = new Date(fest.date + 'T00:00:00Z');
  const iso = x => x.toISOString().slice(0, 10);
  REQ.form = {kind: 'leave', from: iso(new Date(d.getTime() - 2 * 86400000)), to: iso(new Date(d.getTime() + 3 * 86400000)),
    text: `I would like leave for ${fest.name}. I will come back on ${reqDate(iso(new Date(d.getTime() + 3 * 86400000)))}.`};
  REQ.msg = ''; REQ.err = '';
  reqRerender();
  setTimeout(() => { const el = document.getElementById('reqForm'); if(el && el.scrollIntoView) el.scrollIntoView({behavior: 'smooth', block: 'center'}); }, 50);
}

function reqFestivalCard(){
  if(REQ.festivals === null) setTimeout(reqLoadFestivals, 0);
  const body = REQ.festivals === null ? '<div class="sub">Loading…</div>'
    : REQ.festivals.length ? REQ.festivals.map(f => `<div class="req-fest">
        <div><div style="font-weight:600; font-size:13.5px;">${escapeHtml(f.name)}</div>
          <div class="sub" style="font-size:12px;">${escapeHtml(reqDate(f.date))} · in ${f.days_away} day${f.days_away === 1 ? '' : 's'}</div></div>
        <button class="btn sm" type="button" onclick="reqPlanLeave('${escapeHtml(f.key)}')">Plan leave</button>
      </div>`).join('')
    : '<div class="sub">No festivals in the next two months.</div>';
  return `<div class="section"><h2>Festival leave</h2><div class="card">
    <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:6px;">Going home for a festival? Tell the agency early so the family has cover while you are away.</div>
    ${body}</div></div>`;
}

async function reqLoadPrefs(){
  if(REQ.loading.prefs) return;
  REQ.loading.prefs = true;
  try { REQ.prefs = await reqJson('/api/me/preferences'); } catch(e){ REQ.prefs = {}; }
  REQ.loading.prefs = false;
  reqRerender();
}

function reqPrefsCard(){
  if(REQ.prefs === null) setTimeout(reqLoadPrefs, 0);
  const p = REQ.prefs || {};
  return `<div class="section"><h2>How the agency should call you</h2><div class="card">
    <form id="reqPrefsForm" novalidate>
      <div class="req-row">
        <label class="auth-field"><span>Language</span><select id="reqLang">${REQ_LANGS.map(([v, l]) => `<option value="${v}" ${(p.language || 'en') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="auth-field"><span>Best time to call</span><input id="reqWindow" maxlength="60" value="${escapeHtml(p.call_window || '')}" placeholder="e.g. after 10 AM, not on Sundays"></label>
      </div>
      ${REQ.prefsMsg ? `<div class="${/^Saved/.test(REQ.prefsMsg) ? 'req-ok' : 'req-err'}">${escapeHtml(REQ.prefsMsg)}</div>` : ''}
      <button class="btn" type="submit">Save</button>
    </form></div></div>`;
}

async function reqSavePrefs(event){
  event.preventDefault();
  try {
    REQ.prefs = await reqPost('/api/me/preferences', {language: document.getElementById('reqLang').value, call_window: document.getElementById('reqWindow').value}, 'PUT');
    REQ.prefsMsg = 'Saved. The agency will call you ' + (REQ.prefs.call_window || '') + ', in ' + ((REQ_LANGS.find(l => l[0] === REQ.prefs.language) || [])[1] || 'English') + '.';
  } catch(e){ REQ.prefsMsg = e.message; }
  reqRerender();
}

/* ------------------------------------------------------------------ household: what the next helper should know */

async function reqLoadNotes(){
  if(REQ.loading.notes) return;
  REQ.loading.notes = true;
  try { REQ.notes = await reqJson('/api/me/household-notes'); } catch(e){ REQ.notes = {}; }
  REQ.loading.notes = false;
  reqRerender();
}

function reqNotesCard(){
  if(REQ.notes === null) setTimeout(reqLoadNotes, 0);
  const n = REQ.notes || {};
  const box = (id, label, value, ph) => `<label class="auth-field"><span>${label}</span><textarea id="${id}" rows="2" maxlength="400" placeholder="${ph}">${escapeHtml(value || '')}</textarea></label>`;
  return `<div class="section"><h2>What the next helper should know about your home</h2><div class="card">
    <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:10px;">The agency uses this to brief any new helper before her first day, so she does not have to learn it the hard way.</div>
    <form id="reqNotesForm" novalidate>
      ${box('reqRoutine', 'Daily routine', n.routine, 'e.g. School drop at 8:15; lunch for grandmother at 12:30.')}
      ${box('reqHealth', 'Health and care', n.health, 'e.g. Grandmother is diabetic: no sugar in her tea.')}
      ${box('reqPrefs', 'Preferences', n.preferences, 'e.g. No phone calls during work hours; shoes off inside.')}
      ${REQ.notesMsg ? `<div class="${/^Saved/.test(REQ.notesMsg) ? 'req-ok' : 'req-err'}">${escapeHtml(REQ.notesMsg)}</div>` : ''}
      <button class="btn primary" type="submit">Save</button>
    </form></div></div>`;
}

async function reqSaveNotes(event){
  event.preventDefault();
  try {
    REQ.notes = await reqPost('/api/me/household-notes', {
      routine: document.getElementById('reqRoutine').value,
      health: document.getElementById('reqHealth').value,
      preferences: document.getElementById('reqPrefs').value,
    }, 'PUT');
    REQ.notesMsg = 'Saved; the agency will brief any new helper with this.';
  } catch(e){ REQ.notesMsg = e.message; }
  reqRerender();
}

/** Wire the forms on the helper and household pages (called from their wire functions). */
function reqWire(){
  const pairs = [['reqForm', reqSubmit], ['reqPrefsForm', reqSavePrefs], ['reqNotesForm', reqSaveNotes]];
  for (const [id, fn] of pairs){
    const el = document.getElementById(id);
    if(el && el.addEventListener && !el.dataset.wired){ el.dataset.wired = '1'; el.addEventListener('submit', fn); }
  }
}

/* ------------------------------------------------------------------ coordinator: open requests on the dashboard */

async function reqLoadOpen(){
  if(REQ.loading.open) return;
  REQ.loading.open = true;
  REQ.openAt = Date.now();
  try { REQ.open = (await reqJson('/api/requests?status=open')).requests || []; } catch(e){ REQ.open = []; }
  REQ.loading.open = false;
  if(typeof route !== 'undefined' && route.page === 'dashboard') reqRerender();
}

async function reqAck(id){
  const input = document.getElementById('reqNote_' + id);
  const err = document.getElementById('reqErr_' + id);
  try {
    const d = await reqPost('/api/requests/' + encodeURIComponent(id) + '/ack', {note: input ? input.value : ''});
    if(typeof log === 'function') log('mem', 'MEMORY AGENT', `Acknowledged ${d.request.person_name}'s ${String(d.request.kind_label).toLowerCase()} request.`);
    REQ.open = (REQ.open || []).filter(r => r.id !== id);
    reqRerender();
  } catch(e){ if(err) err.textContent = e.message; }
}

function requestsCard(){
  if(typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role !== 'admin') return '';
  if(REQ.open === null || Date.now() - REQ.openAt > 60000) setTimeout(reqLoadOpen, 0);
  const list = REQ.open || [];
  if(REQ.open !== null && !list.length){
    return `<div class="section"><h2>Requests from helpers and households</h2><div class="card" style="font-size:12.5px; color:var(--ink-soft);">No open requests. Leave requests, pay issues, concerns and check-in requests sent from the helper and household views appear here.</div></div>`;
  }
  if(REQ.open === null) return '';
  return `<div class="section"><h2>Requests from helpers and households <span class="badge warn">${list.length}</span></h2><div class="card">
    ${list.map(r => `<div style="display:flex; gap:12px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; ${r.kind === 'pay_issue' ? 'border-left:3px solid var(--rust); padding-left:10px;' : ''}">
      <div style="flex:1; min-width:260px;">${reqItemHtml(r, {showWho: true})}</div>
      <div style="display:flex; gap:6px; align-items:center; padding-top:10px;">
        <input id="reqNote_${escapeHtml(r.id)}" placeholder="Reply (optional)" maxlength="300" style="width:190px; padding:6px 9px; font-size:12px; border:1px solid var(--line-strong); background:var(--card); color:var(--ink);">
        <button class="btn sm primary" type="button" onclick="reqAck('${escapeHtml(r.id)}')">Acknowledge</button>
        <div class="req-err" id="reqErr_${escapeHtml(r.id)}"></div>
      </div>
    </div>`).join('')}
  </div></div>`;
}

/* ------------------------------------------------------------------ coordinator: a helper's call preference on the Voice Agent form */

async function reqLoadHelperPrefs(){
  if(REQ.loading.hp) return;
  REQ.loading.hp = true;
  try { REQ.helperPrefs = (await reqJson('/api/helper-preferences')).preferences || {}; } catch(e){ REQ.helperPrefs = {}; }
  REQ.loading.hp = false;
  if(typeof route !== 'undefined' && route.page === 'voice') reqRerender();
}

function reqHelperPrefLine(helperId){
  if(REQ.helperPrefs === null) setTimeout(reqLoadHelperPrefs, 0);
  const p = (REQ.helperPrefs || {})[helperId];
  if(!p) return '';
  const lang = (REQ_LANGS.find(l => l[0] === p.language) || [])[1];
  return `<div style="font-size:11.5px; color:var(--teal); margin-top:5px;">She asked to be called ${p.call_window ? escapeHtml(p.call_window) : ''}${lang ? (p.call_window ? ', in ' : 'in ') + escapeHtml(lang) : ''}.</div>`;
}

/** When the coordinator picks a helper, preselect the language she asked for. */
function reqApplyHelperPref(helperId){
  const apply = () => {
    const p = (REQ.helperPrefs || {})[helperId];
    if(p && p.language && window.VOICE_FORM) window.VOICE_FORM.language = p.language;
    reqRerender();
  };
  if(REQ.helperPrefs === null) reqLoadHelperPrefs().then(apply); else apply();
}
