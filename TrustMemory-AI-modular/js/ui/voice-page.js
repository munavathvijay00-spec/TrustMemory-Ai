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
          <select id="vHelper" onchange="window.VOICE_FORM.helper = this.value" style="${fieldStyle}">
            ${S.helpers.map(h => `<option value="${h.id}" ${VF.helper === h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
          </select>
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
      </div>
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
