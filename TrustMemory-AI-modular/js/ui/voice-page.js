/* =========================================================================
   ui/voice-page.js — Voice Agent page
   Calls run on the helper's phone screen (helper.html) and are mirrored live
   in the console rendered by ui/voice-live.js. The phone screen speaks and
   listens; the console shows memory, citations and the saved outcome.
   ========================================================================= */

function pageVoice(){
  // The page is redrawn whenever a call changes state; keep what the coordinator picked.
  const VF = window.VOICE_FORM || (window.VOICE_FORM = {helper: 'radha', late: 1, scenario: 'coaching_call'});
  const scenarios = [
    ['coaching_call', 'Coaching call (late arrivals check-in)'],
    ['followup_call', 'Follow-up (did the last commitment hold?)'],
    ['household_checkin', 'Placement check-in (how is it going?)'],
    ['escalation_call', 'Escalation (commitment not kept)'],
  ];
  const languages = [['en', 'English'], ['hi', 'हिन्दी · Hindi'], ['te', 'తెలుగు · Telugu']];
  const labelStyle = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--ink-soft);';
  const fieldStyle = 'width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;';

  return `
    <div class="pagehead">
      <div class="eyebrow">Voice Agent</div>
      <h1>Coaching calls that remember</h1>
      <div class="lede">
        Before the first word the agent recalls what the agency knows about the helper from Hindsight, and it recalls again on every turn from what she just said. After the call the real outcome is extracted from the transcript, retained, and used by the next call.
      </div>
    </div>

    ${window.LIVE_VOICE ? renderLiveVoiceConsole() : ''}

    <div class="card" style="margin-bottom:20px; padding:20px;">
      <div style="font-weight:700; font-size:14px; margin-bottom:14px; color:var(--ink);">Start a call</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:16px;">
        <div>
          <label style="${labelStyle}">Helper</label>
          <select id="vHelper" onchange="window.VOICE_FORM.helper = this.value; if(typeof reqApplyHelperPref === 'function') reqApplyHelperPref(this.value); sinceRefreshSlots()" style="${fieldStyle}">
            ${S.helpers.map(h => `<option value="${h.id}" ${VF.helper === h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
          </select>
          ${typeof reqHelperPrefLine === 'function' ? reqHelperPrefLine(VF.helper) : ''}
        </div>
        <div>
          <label style="${labelStyle}">Late arrivals (past two weeks)</label>
          <input type="number" id="vLateCount" value="${VF.late}" min="0" max="20" oninput="window.VOICE_FORM.late = parseInt(this.value || '0', 10)" style="${fieldStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">Call type</label>
          <select id="vScenarioType" onchange="window.VOICE_FORM.scenario = this.value" style="${fieldStyle}">
            ${scenarios.map(([v, l]) => `<option value="${v}" ${VF.scenario === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="${labelStyle}">Language</label>
          <select id="vLanguage" onchange="window.VOICE_FORM.language = this.value" style="${fieldStyle}">
            ${languages.map(([v, l]) => `<option value="${v}" ${(VF.language || 'en') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="${labelStyle}">Reason for calling today (optional)</label>
        <input type="text" id="vPurpose" maxlength="300" value="${escapeHtml(VF.purpose || '')}" placeholder="e.g. Dussehra is in three weeks; last year she came back nine days late" oninput="window.VOICE_FORM.purpose = this.value" style="${fieldStyle}" />
      </div>
      ${sinceSlot(VF.helper, 'voice')}
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-top:12px; border-top:1px solid var(--line);">
        <div style="font-size:12px; color:var(--ink-soft);">
          The agent records what happened. The Decision Agent scores it. Helpers never hear scores.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          ${typeof renderMemoryToggle === 'function' ? renderMemoryToggle() : ''}
          <button class="btn primary" onclick="startRemoteCall()" style="padding:10px 18px; font-weight:700; font-size:13.5px; background:#1C653C; border-color:#12592D; color:#fff;">
            📱 Ring helper's phone
          </button>
          <button class="btn sm" onclick="lvOpenPhoneScreen()" title="Open the helper's phone screen in a new window">Open phone screen ↗</button>
        </div>
      </div>
    </div>

    <div style="margin-bottom:20px;">${typeof renderLearningMetrics === 'function' ? renderLearningMetrics() : ''}</div>

    <div class="section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h2>Call history</h2>
        <span style="font-size:12px; color:var(--ink-soft);">${S.calls.length} call${S.calls.length === 1 ? '' : 's'} saved</span>
      </div>
      ${S.calls.length
        ? S.calls.map(callCard).join('')
        : `<div class="card">${emptyState('No calls yet.', 'Ring a helper\'s phone to hold the first call.')}</div>`}
    </div>
  `;
}

function wireVoice(){}

/* ------------------------------------------------------------------ what changed since the last call */

// Per helper: {status: 'loading'|'ok'|'error', data, at, open}. Filled in place so a page redraw is not needed.
const SINCE = {};
const SINCE_TTL_MS = 60000;

/** A placeholder the loader fills in; used in the Start-a-call form and on the helper page. */
function sinceSlot(helperId, where){
  if(!helperId) return '';
  setTimeout(() => sinceLoad(helperId), 0);
  return `<div class="since-slot" data-helper="${escapeHtml(helperId)}" data-where="${where}">${sinceHtml(helperId, where)}</div>`;
}

function sinceHtml(helperId, where){
  const st = SINCE[helperId];
  const box = where === 'card'
    ? 'background:var(--card, #fff); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; margin-bottom:24px;'
    : 'background:var(--paper, #F7F6F1); border:1px solid var(--line); border-radius:var(--radius); padding:10px 12px; margin-bottom:16px;';
  const head = '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-soft); margin-bottom:6px;">Since the last call</div>';
  if(!st || st.status === 'loading') return `<div style="${box}">${head}<div style="font-size:12.5px; color:var(--ink-soft);">Checking what changed…</div></div>`;
  if(st.status === 'error') return `<div style="${box}">${head}<div style="font-size:12.5px; color:var(--ink-soft);">${escapeHtml(st.error || 'Could not load what changed.')}</div></div>`;
  const d = st.data;
  const limit = st.open ? d.items.length : 5;
  const items = d.items.slice(0, limit).map(i => `
    <div style="display:flex; gap:10px; align-items:baseline; padding:5px 0; border-top:1px solid var(--line); font-size:12.5px;">
      <span style="flex:none; min-width:74px; font-family:var(--font-mono); font-size:11px; color:var(--ink-soft);">${escapeHtml(sinceDate(i.when))}</span>
      <span style="flex:1;">${escapeHtml(i.what)} <span style="color:var(--ink-faint, #8A93A0); font-size:11px;">· ${escapeHtml(i.source)}</span></span>
    </div>`).join('');
  const more = d.items.length > 5
    ? `<button class="btn sm" style="margin-top:6px;" onclick="sinceToggle('${escapeHtml(helperId)}')">${st.open ? 'Show less' : 'Show all ' + d.items.length}</button>` : '';
  return `<div style="${box}">${head}<div style="font-size:13px; font-weight:600; margin-bottom:${d.items.length ? '6px' : '0'};">${escapeHtml(d.summary)}</div>${items}${more}</div>`;
}

function sinceDate(isoStr){
  const t = Date.parse(isoStr || '');
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
}

async function sinceLoad(helperId, force){
  const st = SINCE[helperId];
  if(st && st.status === 'loading') return;
  if(st && st.status === 'ok' && !force && Date.now() - st.at < SINCE_TTL_MS){ sincePaint(helperId); return; }
  SINCE[helperId] = {status: 'loading', open: st ? st.open : false};
  sincePaint(helperId);
  try {
    const r = await fetch('/api/since?helper=' + encodeURIComponent(helperId));
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Could not load what changed.');
    SINCE[helperId] = {status: 'ok', data: d, at: Date.now(), open: SINCE[helperId].open};
  } catch(e){
    SINCE[helperId] = {status: 'error', error: e.message, at: Date.now()};
  }
  sincePaint(helperId);
}

/** Refill every slot for this helper in place (no full page redraw, so nothing else moves). */
function sincePaint(helperId){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('.since-slot').forEach(el => {
    if(el.getAttribute('data-helper') === helperId) el.innerHTML = sinceHtml(helperId, el.getAttribute('data-where'));
  });
}

function sinceToggle(helperId){
  if(SINCE[helperId]) SINCE[helperId].open = !SINCE[helperId].open;
  sincePaint(helperId);
}

/** The helper picker changed without a redraw: point the form's slot at the new helper. */
function sinceRefreshSlots(){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  const id = (window.VOICE_FORM || {}).helper;
  document.querySelectorAll('.since-slot[data-where="voice"]').forEach(el => {
    el.setAttribute('data-helper', id);
    el.innerHTML = sinceHtml(id, 'voice');
  });
  if(id) sinceLoad(id);
}
