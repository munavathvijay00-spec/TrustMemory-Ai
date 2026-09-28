/* =========================================================================
   agents/voice-agent.js — entry point for calls started from other pages,
   and the saved-call card.

   Every call goes through the real voice agent (server/voice-agent.js via
   ui/voice-live.js): Groq for the conversation, Hindsight for memory. There
   are no scripted transcripts anywhere in the frontend.
   ========================================================================= */

const CALL_TYPE_TO_SCENARIO = {
  coaching: 'coaching_call',
  coaching_call: 'coaching_call',
  checkin: 'household_checkin',
  household_checkin: 'household_checkin',
  escalation: 'escalation_call',
  escalation_call: 'escalation_call',
  followup: 'followup_call',
  followup_call: 'followup_call',
};

/**
 * Start a real call for a helper from anywhere in the app (helper profile, household page).
 * Opens the Voice Agent page with the form set and rings the helper's phone screen.
 */
function startCall(type, helperId){
  if(!helperId){
    log('voice', 'VOICE AGENT', 'No helper is placed here, so there is nobody to call.');
    return null;
  }
  const scenario = CALL_TYPE_TO_SCENARIO[type] || 'coaching_call';
  window.VOICE_FORM = Object.assign(window.VOICE_FORM || {late: 1}, {helper: helperId, scenario});
  nav('voice');
  setTimeout(() => { if(typeof startRemoteCall === 'function') startRemoteCall(); }, 200);
  return {started: true, helperId, scenario};
}

function callCard(c){
  const helper = S.helpers.find(h => h.id === c.helperId) || {name: labelFor(c.helperId) || 'Helper'};
  const hh = S.households.find(h => h.id === c.householdId);
  const e = c.experienceEntry || {};
  const provider = (c.telephony && c.telephony.provider) || 'Voice agent (Groq + Hindsight)';
  const typeLabel = {coaching_call:'Coaching call', followup_call:'Follow-up call', household_checkin:'Placement check-in', escalation_call:'Escalation call'}[c.type] || 'Call';

  return `<div class="callcard" style="border-left:4px solid var(--brass); background:#fff; margin-bottom:18px;">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <div>
        <span style="font-size:15px; font-weight:700; color:var(--ink);">${typeLabel}</span>
        <span style="font-weight:600; color:var(--brass-dark);"> · ${escapeHtml(helper.name)}</span>
        ${hh ? `<span style="color:var(--ink-soft);"> (${escapeHtml(hh.name)})</span>` : ''}
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <span class="badge neutral">${escapeHtml(c.destinationPhone || provider)}</span>
        ${c.sentiment ? `<span class="badge ${c.sentiment === 'cooperative' ? 'ok' : 'neutral'}">${escapeHtml(c.sentiment)}</span>` : ''}
      </div>
    </div>

    <div style="font-size:12px; color:var(--ink-soft); margin:8px 0 12px;">
      ${escapeHtml(c.reason || 'Attendance check-in')}${c.followUp ? ` · Follow-up: <b>${escapeHtml(c.followUp)}</b>` : ''}${c.createdAt ? ` · ${escapeHtml(c.createdAt)}` : ''}
    </div>

    <div class="transcript" style="background:#FAFBF9; border:1px solid var(--line); border-radius:4px; padding:14px; font-size:13px; line-height:1.6;">
      ${(c.transcript || []).map(t => {
        const isAgent = t.who === 'Agent' || t.who === 'Voice Agent' || t.who === 'agent';
        return `<div style="margin-bottom:8px;">
          <span style="font-weight:700; color:${isAgent ? 'var(--brass-dark)' : 'var(--ink)'}; font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em;">${isAgent ? 'Voice Agent' : escapeHtml(t.who || helper.name)}:</span>
          <div style="margin-top:2px; color:var(--ink);">${escapeHtml(t.text)}</div>
        </div>`;
      }).join('') || '<div style="color:var(--ink-soft);">No transcript.</div>'}
    </div>

    ${c.experienceEntry ? `
      <div style="margin-top:14px; background:#F5F8F6; border:1px solid #D5E4D8; border-radius:4px; padding:12px 14px; font-size:12px;">
        <div style="font-weight:700; color:#1C653C; margin-bottom:8px;">What was extracted from the transcript and retained</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; line-height:1.4;">
          <div><b>Root cause:</b> ${escapeHtml(e.root_cause_identified || 'not identified')}</div>
          <div><b>Commitment:</b> ${escapeHtml(e.specific_commitment || 'none made')}</div>
          <div><b>Will notify household if late:</b> ${e.notification_commitment ? 'yes' : 'no'}</div>
          <div><b>Follow-up date:</b> ${escapeHtml(e.follow_up_date || '')}</div>
          <div><b>Escalation:</b> ${e.escalations_required ? 'required' : 'no'}</div>
          ${e.memory_used !== undefined ? `<div><b>Memory:</b> ${e.memory_citations || 0} sentence${(e.memory_citations || 0) === 1 ? '' : 's'} cited, ${e.memories_recalled || 0} facts recalled</div>` : ''}
        </div>
        ${e.coordinator_note ? `<div style="margin-top:8px; padding-top:6px; border-top:1px dashed #C3D9C7; color:var(--ink);"><b>Coordinator note:</b> ${escapeHtml(e.coordinator_note)}</div>` : ''}
      </div>
    ` : (c.summary ? `<div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line); font-size:12.5px;"><b>Outcome:</b> ${escapeHtml(c.summary)}</div>` : '')}
  </div>`;
}
