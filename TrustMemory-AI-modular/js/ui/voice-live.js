/* =========================================================================
   ui/voice-live.js — Browser voice call console
   The call itself runs on the helper's phone screen (helper.html); this
   console rings it and mirrors the conversation live.
   Brain:      POST /api/voice/*  (Groq + Hindsight on the server)

   Memory is visible at every step:
   - the facts and standing profile recalled before the first word
   - per-turn recall triggered by what the helper just said
   - memory-driven sentences highlighted with provenance (click a tag to see the fact)
   - with-memory / without-memory comparison of the same call
   - what was recorded, retained, and how churn moved, with reasons
   - coordinator feedback (approve / correct / reject) retained back to the bank
   - a rule proposal from reflect, approved with one click into a bank directive
   ========================================================================= */

window.LIVE_VOICE = null;
window.LIVE_VOICE_COMPARE = null; // {status, greeting, secondTurn, helperName}
window.LIVE_VOICE_USE_MEMORY = true;

let lvStartToken = 0;

function lvState(){ return window.LIVE_VOICE; }

function lvSet(patch){
  if(!window.LIVE_VOICE) return;
  Object.assign(window.LIVE_VOICE, patch);
  lvRender();
}

function lvRender(){
  const host = document.getElementById('liveVoiceConsole');
  if(host){
    host.outerHTML = renderLiveVoiceConsole();
    lvScrollTranscript();
  } else if(typeof renderCurrentPage === 'function'){
    renderCurrentPage();
    lvScrollTranscript();
  }
}

function lvScrollTranscript(){
  setTimeout(() => {
    const box = document.getElementById('lvTranscript');
    if(box) box.scrollTop = box.scrollHeight;
  }, 30);
}

/* ------------------------------------------------------------------ TTS */




/* ------------------------------------------------------------------ STT */


function lvStopListening(){ /* speech runs on the phone screen */ }

/* ------------------------------------------------------------------ session flow */

function lvReadForm(){
  const helperId = document.getElementById('vHelper')?.value || 'anita';
  const lateCount = parseInt(document.getElementById('vLateCount')?.value || '2', 10);
  const scenario = document.getElementById('vScenarioType')?.value || 'coaching_call';
  const helper = S.helpers.find(h => h.id === helperId) || {name:'Helper'};
  const VF = window.VOICE_FORM || {};
  const language = document.getElementById('vLanguage')?.value || VF.language || 'en';
  const purpose = String(document.getElementById('vPurpose')?.value ?? VF.purpose ?? '').trim().slice(0, 300);
  return {helperId, lateCount: Number.isFinite(lateCount) ? lateCount : 2, scenario, helper, language, purpose};
}

function lvToggleMemory(on){
  window.LIVE_VOICE_USE_MEMORY = Boolean(on);
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function startLiveVoiceSession(opts){
  opts = opts || {};
  const cur = lvState();
  // A phone-screen call that was declined, missed, or hung up before anyone spoke is over:
  // discard it so a new call can start. Anything still live blocks a second start (double clicks).
  const finishedRemote = cur && cur.remote && !cur.result && ['declined', 'missed', 'ended'].includes(cur.callState);
  if(finishedRemote){
    lvStopMirror();
    if(cur.sessionId){
      fetch('/api/voice/cancel', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: cur.sessionId})}).catch(() => {});
    }
    window.LIVE_VOICE = null;
  } else if(cur && (cur.status === 'connecting' || (cur.sessionId && !cur.result))){
    lvSet({hint: 'A call is already in progress. End or cancel it before starting another.'});
    return;
  }
  const myToken = ++lvStartToken;
  const f = lvReadForm();
  if(/^test_/.test(f.helperId)){
    alert('Test helper records are demonstration-only and cannot be called.');
    return;
  }
  if('speechSynthesis' in window){ try { speechSynthesis.cancel(); } catch(e){} }
  const useMemory = window.LIVE_VOICE_USE_MEMORY !== false;

  window.LIVE_VOICE = {
    status:'connecting', sessionId:null, helperId: f.helperId, helperName: f.helper.name, scenario: f.scenario, lateCount: f.lateCount,
    language: f.language, purpose: f.purpose || null, trace: [],
    useMemory, transcript:[], memory:null, priorCalls:[], result:null, error:null, interim:'', hint:'',
    ending:false,
    feedback:null, proposal:null, proposalStatus:null, openFact:null,
    remote: true, callState: null
  };
  lvRender();

  try {
    const res = await fetch('/api/voice/session', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({helper_id: f.helperId, scenario: f.scenario, late_count: f.lateCount, use_memory: useMemory, language: f.language, purpose: f.purpose || undefined})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not start the voice session.');
    if(myToken !== lvStartToken || !window.LIVE_VOICE) return;

    window.LIVE_VOICE.sessionId = data.session_id;
    window.LIVE_VOICE.trace = data.trace || [];
    // The reason belongs to this call only; the next call starts without it.
    if(window.VOICE_FORM) window.VOICE_FORM.purpose = '';
    window.LIVE_VOICE.memory = data.memory;
    window.LIVE_VOICE.priorCalls = data.prior_calls || [];
    window.LIVE_VOICE.transcript.push({who:'agent', text:data.greeting, cited: []});
    window.LIVE_VOICE.purpose = data.purpose || window.LIVE_VOICE.purpose;
    log('voice', 'VOICE AGENT', useMemory
      ? `Live call started with ${f.helper.name}. Recalled ${data.memory.count} memories from ${data.memory.source}${data.memory.mental_model ? ' plus the standing profile' : ''}.`
      : `Live call started with ${f.helper.name} with memory switched OFF (comparison run).`);
    {
      // The conversation happens on the helper's phone screen; this console mirrors it.
      await fetch('/api/voice/ring', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: data.session_id})});
      window.LIVE_VOICE.callState = 'ringing';
      log('voice', 'VOICE AGENT', `Ringing ${f.helper.name}'s phone screen. The call runs there; this console mirrors it live.`);
      lvSet({status:'ringing', hint:`Open ${f.helper.name}'s phone screen and accept the call.`});
      lvStartMirror();
      return;
    }
  } catch(e){
    lvSet({status:'error', error:e.message});
  }
}

/* ------------------------------------------------------------------ helper phone screen (remote call) */

let lvMirrorTimer = null;
let lvMirrorSig = '';

function startRemoteCall(){ return startLiveVoiceSession(); }

function lvOpenPhoneScreen(helperId){
  const id = helperId || (lvState() && lvState().helperId) || document.getElementById('vHelper')?.value || 'radha';
  window.open('/helper.html?helper=' + encodeURIComponent(id), 'helperPhone_' + id, 'width=440,height=820');
}

function lvStopMirror(){ if(lvMirrorTimer){ clearInterval(lvMirrorTimer); lvMirrorTimer = null; } }

function lvStartMirror(){
  lvStopMirror();
  lvMirrorSig = '';
  lvMirrorTimer = setInterval(lvMirrorTick, 1000);
}

async function lvMirrorTick(){
  const s = lvState();
  if(!s || !s.remote || !s.sessionId || s.result){ lvStopMirror(); return; }
  let d;
  try {
    const res = await fetch('/api/voice/session/' + encodeURIComponent(s.sessionId));
    if(!res.ok) { lvStopMirror(); return; }
    d = await res.json();
  } catch(e){ return; }
  if(lvState() !== s) return;
  const helperFirst = s.helperName.split(' ')[0];
  s.transcript = (d.transcript || []).map(t => t.who === 'Agent'
    ? {who:'agent', text:t.text, cited: t.cited || [], latency: t.latency || null}
    : {who:'helper', text:t.text, recalled: t.recalled || []});
  if(d.memory){ s.memory = d.memory; }
  s.trace = d.trace || s.trace || [];
  s.callState = d.call_state;
  const sig = [d.call_state, s.transcript.length, (s.memory && s.memory.facts.length) || 0].join('|');
  const changed = sig !== lvMirrorSig;
  lvMirrorSig = sig;

  if(d.call_state === 'ringing'){ if(changed) lvSet({status:'ringing'}); return; }
  if(d.call_state === 'declined'){ lvStopMirror(); lvSet({status:'declined', hint:`${helperFirst} declined the call. Click Ring Helper's Phone to call again.`}); return; }
  if(d.call_state === 'missed'){ lvStopMirror(); lvSet({status:'missed', hint:`${helperFirst} did not answer. Click Ring Helper's Phone to call again.`}); return; }
  if(d.call_state === 'ended'){
    lvStopMirror();
    const helperTurns = s.transcript.filter(t => t.who === 'helper').length;
    if(helperTurns > 0){
      log('voice', 'VOICE AGENT', `${helperFirst} hung up. Saving the call to memory.`);
      endLiveVoiceSession();
    } else {
      lvSet({status:'idle', hint:`The call ended before ${helperFirst} said anything, so there is nothing to save.`});
    }
    return;
  }
  if(changed){
    const last = s.transcript[s.transcript.length - 1];
    lvSet({status: last && last.who === 'helper' ? 'thinking' : 'oncall', hint:''});
  }
}



async function endLiveVoiceSession(){
  const s = lvState();
  if(!s || !s.sessionId) return;
  if(s.remote){
    lvStopMirror();
    if(s.callState === 'connected' || s.callState === 'ringing'){
      try { await fetch('/api/voice/hangup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: s.sessionId, by:'coordinator'})}); } catch(e){}
      s.callState = 'ended';
    }
  }
  lvStopListening();
  if('speechSynthesis' in window) speechSynthesis.cancel();
  lvSet({status:'completing', hint:''});

  try {
    const res = await fetch('/api/voice/complete', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({session_id: s.sessionId})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not save the call.');
    s.result = data;

    const o = data.outcome || {};
    S.calls.unshift({
      id: data.call_id, call_id: data.call_id, type: s.scenario, helperId: s.helperId,
      householdId: o.household_id || null, destinationPhone: 'Helper phone screen',
      lateCount: s.lateCount, reason: `${s.lateCount} recent late arrivals check-in (browser voice call)`,
      status: 'completed', transcript: (data.transcript || []).map(t => ({who: t.who, text: t.text})),
      summary: o.coordinator_note, sentiment: o.sentiment, experienceEntry: o,
      followUp: `Check-in on ${o.follow_up_date}`, createdAt: nowStamp(),
      telephony: {status:'completed_live', provider:'Browser voice agent (Groq + Hindsight)', call_id: data.call_id}
    });
    if(typeof retain === 'function'){
      retain(s.helperId, 'experience', `Voice call (${s.scenario}): ${o.coordinator_note}`, {callId: data.call_id, experienceEntry: o});
    }
    if(data.decision){
      log('dec', 'DECISION AGENT', data.decision.activityText || `Recalculated churn for ${s.helperName}: ${data.decision.old_churn} → ${data.decision.new_churn}.`);
      if(SCORES[s.helperId]) SCORES[s.helperId].churn = data.decision.new_churn;
      window.SERVER_SCORES = window.SERVER_SCORES || {};
      window.SERVER_SCORES[s.helperId] = Object.assign({}, window.SERVER_SCORES[s.helperId], {churn: data.decision.new_churn});
    }
    log('mem', 'MEMORY AGENT', data.retain && data.retain.status === 'ok'
      ? `Retained call transcript and summary to Hindsight bank ${data.retain.bank}.`
      : data.retain && data.retain.status === 'queued' ? 'Hindsight was unreachable. The call is saved locally and queued; it will be retained automatically when Hindsight is back.'
      : `Call saved locally. Hindsight retain: ${data.retain ? data.retain.status : 'skipped'}.`);
    if(typeof syncBackendData === 'function') await syncBackendData();
    lvMetrics = null;
    lvSet({status:'completed'});
    if(data.retain && data.retain.status === 'saving') lvFollowRetain(s);
    // Ask reflect whether this call suggests a standing rule (non-blocking).
    if(s.useMemory !== false && data.retain && data.retain.status === 'ok') lvSuggestRule();
  } catch(e){
    lvSet({status:'idle', error:e.message, hint:'Saving failed. You can try "End call" again.'});
  }
}

function cancelLiveVoiceSession(){
  const s = lvState();
  lvStopMirror();
  if(s && s.remote && s.sessionId && !s.result && (s.callState === 'connected' || s.callState === 'ringing')){
    fetch('/api/voice/hangup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: s.sessionId, by:'coordinator'})}).catch(() => {});
  }
  lvStopListening();
  if('speechSynthesis' in window) speechSynthesis.cancel();
  if(s && s.sessionId && !s.result){
    fetch('/api/voice/cancel', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: s.sessionId})}).catch(() => {});
  }
  window.LIVE_VOICE = null;
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}


/* ------------------------------------------------------------------ comparison: same call without memory */

async function lvRunComparison(){
  const s = lvState();
  const f = s ? {helperId: s.helperId, scenario: s.scenario, lateCount: s.lateCount, helper: {name: s.helperName}} : lvReadForm();
  window.LIVE_VOICE_COMPARE = {status:'running', helperName: f.helper.name, greeting:'', secondTurn:'', memGreeting: s && s.transcript[0] ? s.transcript[0].text : '', memSecond: s ? ((s.transcript[2] || {}).text || '') : ''};
  lvRender();
  try {
    const res = await fetch('/api/voice/session', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({helper_id: f.helperId, scenario: f.scenario, late_count: f.lateCount, use_memory: false})});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Comparison failed.');
    window.LIVE_VOICE_COMPARE.greeting = data.greeting;
    const t = await fetch('/api/voice/turn', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({session_id: data.session_id, text: 'Yes, I can talk now.'})});
    const td = await t.json();
    window.LIVE_VOICE_COMPARE.secondTurn = td.reply || td.error || '';
    await fetch('/api/voice/cancel', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: data.session_id})});
    window.LIVE_VOICE_COMPARE.status = 'done';
    log('voice', 'VOICE AGENT', `Comparison run for ${f.helper.name} with memory OFF (not retained).`);
  } catch(e){
    window.LIVE_VOICE_COMPARE.status = 'error';
    window.LIVE_VOICE_COMPARE.error = e.message;
  }
  lvRender();
}

/* ------------------------------------------------------------------ coordinator feedback + rule proposal */

async function lvSendFeedback(verdict){
  const s = lvState();
  if(!s || !s.result) return;
  let note = '';
  if(verdict !== 'approve'){
    note = prompt(verdict === 'correct' ? 'What did the agent get wrong or miss?' : 'Why is this record wrong?') || '';
    if(!note) return;
  }
  lvSet({feedback:{status:'sending', verdict}});
  try {
    const res = await fetch('/api/memory/feedback', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({call_id: s.result.call_id, helper_id: s.helperId, verdict, note})});
    const d = await res.json();
    if(!res.ok) throw new Error(d.error || 'Feedback failed.');
    log('mem', 'MEMORY AGENT', `Coordinator ${verdict === 'approve' ? 'approved' : verdict + 'ed'} the record of ${s.helperName}'s call. Retained as feedback (${d.retain.status}).`);
    lvSet({feedback:{status:'done', verdict, note, retain: d.retain}});
  } catch(e){
    lvSet({feedback:{status:'error', verdict, error: e.message}});
  }
}

async function lvSuggestRule(){
  const s = lvState();
  if(!s) return;
  lvSet({proposalStatus:'thinking'});
  try {
    const res = await fetch('/api/memory/suggest-directive?helper=' + encodeURIComponent(s.helperId));
    const d = await res.json();
    if(!res.ok) throw new Error(d.error || 'No proposal.');
    lvSet({proposal: d, proposalStatus: d.rule_needed ? 'proposed' : 'none'});
  } catch(e){
    lvSet({proposalStatus:'error', proposalError: e.message});
  }
}

async function lvApproveRule(){
  const s = lvState();
  if(!s || !s.proposal) return;
  lvSet({proposalStatus:'saving'});
  try {
    const res = await fetch('/api/memory/directives', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name: s.proposal.name, content: s.proposal.content, priority: 70})});
    const d = await res.json();
    if(res.status === 409){ lvSet({proposalStatus:'approved'}); log('mem', 'MEMORY AGENT', d.error); return; }
    if(!res.ok) throw new Error(d.error || 'Could not save the rule.');
    log('mem', 'MEMORY AGENT', `Coordinator approved a new directive: "${s.proposal.name}". Every future call obeys it.`);
    lvSet({proposalStatus:'approved'});
  } catch(e){
    lvSet({proposalStatus:'error', proposalError: e.message});
  }
}

/** "Two weeks later": start the promised follow-up call for the helper of the last saved call. */
function lvStartFollowUp(){
  const s = lvState();
  const helperId = s ? s.helperId : (document.getElementById('vHelper')?.value || 'radha');
  window.LIVE_VOICE = null;
  const sel = document.getElementById('vScenarioType'); if(sel) sel.value = 'followup_call';
  const hs = document.getElementById('vHelper'); if(hs) hs.value = helperId;
  const lc = document.getElementById('vLateCount'); if(lc) lc.value = '0';
  window.VOICE_FORM = Object.assign(window.VOICE_FORM || {}, {helper: helperId, late: 0, scenario: 'followup_call'});
  window.LIVE_VOICE_USE_MEMORY = true;
  log('voice', 'VOICE AGENT', `Follow-up call started for ${labelFor(helperId)}. The agent recalls the commitment from the last call and asks whether it held.`);
  startLiveVoiceSession();
}

/* ------------------------------------------------------------------ background retain + standing profile before/after */

async function lvFollowRetain(s){
  for(let i = 0; i < 45; i++){
    await new Promise(r => setTimeout(r, 2000));
    if(lvState() !== s || !s.result) return;
    try {
      const d = await fetch('/api/voice/session/' + encodeURIComponent(s.sessionId)).then(r => r.json());
      const ret = d.result && d.result.retain;
      if(ret && ret.status !== 'saving'){
        s.result.retain = ret;
        if(d.result.trace) s.result.trace = d.result.trace;
        log('mem', 'MEMORY AGENT', ret.status === 'ok' ? `Retained the call to Hindsight bank ${ret.bank}.` : ret.detail);
        lvRender();
        return;
      }
    } catch(e){ return; }
  }
}

function lvLines(text){
  return String(text || '').split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map(l => l.replace(/^[#*\-\s]+/, '').trim()).filter(l => l.length > 3);
}

function lvDiffLines(before, after){
  const norm = l => l.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
  const b = lvLines(before), a = lvLines(after);
  const bs = new Set(b.map(norm)), as = new Set(a.map(norm));
  return { added: a.filter(l => !bs.has(norm(l))), removed: b.filter(l => !as.has(norm(l))) };
}

/** A plain-text call summary for the coordinator, shared through WhatsApp (wa.me link, no API key needed). */
/* ------------------------------------------------------------------ WhatsApp follow-up draft (nothing is sent) */

async function lvDraftFollowup(){
  const s = lvState(); if(!s || !s.sessionId) return;
  s.followup = {status:'loading'}; lvRender();
  try {
    const r = await fetch('/api/voice/followup-draft', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({session_id: s.sessionId})});
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Could not write a draft.');
    s.followup = {status:'ok', text: d.text, lang: d.lang};
  } catch(e){ s.followup = {status:'error', error: e.message}; }
  lvRender();
}

function lvFollowupText(){
  const el = document.getElementById('lvFollowText');
  const s = lvState();
  return el ? el.value : (s && s.followup && s.followup.text) || '';
}

function lvFollowupCopy(){
  const text = lvFollowupText();
  const done = () => { const b = document.getElementById('lvFollowCopy'); if(b) b.textContent = 'Copied'; };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
}

function lvFollowupOpen(){
  window.open('https://wa.me/?text=' + encodeURIComponent(lvFollowupText()), '_blank', 'noopener');
}

function lvFollowupHtml(s){
  const f = s.followup; if(!f) return '';
  if(f.status === 'loading') return `<div style="font-size:12px; color:var(--ink-soft); margin-top:10px;">Writing a short follow-up in the call's language…</div>`;
  if(f.status === 'error') return `<div style="font-size:12px; color:var(--rust); margin-top:10px;">${escapeHtml(f.error)}</div>`;
  return `<div style="margin-top:10px;">
    <div style="font-size:11px; color:var(--ink-soft); margin-bottom:4px;">Draft for ${escapeHtml(s.helperName)}. Edit it, then send it from your own WhatsApp. Nothing is sent from here.</div>
    <textarea id="lvFollowText" rows="4" style="width:100%; font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--line-strong); border-radius:8px;" oninput="if(window.LIVE_VOICE && window.LIVE_VOICE.followup) window.LIVE_VOICE.followup.text = this.value">${escapeHtml(f.text)}</textarea>
    <div style="display:flex; gap:8px; margin-top:6px;">
      <button class="btn sm" id="lvFollowCopy" onclick="lvFollowupCopy()">Copy</button>
      <button class="btn sm primary" onclick="lvFollowupOpen()">Open in WhatsApp</button>
    </div>
  </div>`;
}

function lvWhatsAppLink(s){
  const r = s.result; if(!r) return '';
  const o = r.outcome || {};
  const lines = [
    'TrustMemory call summary: ' + s.helperName + ' (' + new Date().toISOString().slice(0, 10) + ')',
    o.coordinator_note || '',
    o.root_cause_identified ? 'Reason: ' + o.root_cause_identified : '',
    r.new_commitment ? 'Promise: ' + r.new_commitment : '',
    (r.commitment_checks || []).map(c => (c.status === 'kept' ? 'Kept: ' : 'Not kept: ') + c.text).join('\n'),
    o.follow_up_date ? 'Follow-up: ' + o.follow_up_date : '',
    r.decision ? 'Churn risk: ' + r.decision.old_churn + ' -> ' + r.decision.new_churn : '',
  ].filter(Boolean).join('\n');
  return 'https://wa.me/?text=' + encodeURIComponent(lines);
}

function lvCommitmentResult(s){
  const r = s.result;
  if(!r) return '';
  const checks = r.commitment_checks || [];
  const after = r.ledger_after || {};
  const rows = checks.map(c => `<div style="font-size:12px; line-height:1.5; padding:3px 8px; margin:3px 0; border-left:3px solid ${c.status === 'kept' ? '#1C653C' : '#A6453A'}; background:${c.status === 'kept' ? '#E6F4EA' : '#F8E6E3'};">
      <b>${c.status === 'kept' ? 'Kept' : 'Not kept'}:</b> ${escapeHtml(c.text)}${c.evidence ? ` <span style="color:#5B6572;">· "${escapeHtml(c.evidence)}"</span>` : ''}${c.approach ? ` <span style="color:#8A93A0; font-size:11px;">(made after a "${escapeHtml(LV_APPROACH[c.approach] || c.approach)}" call)</span>` : ''}
    </div>`).join('');
  return `<div style="background:#fff; border:1px solid #E5EADF; border-radius:5px; padding:8px 10px; margin-top:10px;">
    <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
      <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#5B6572;">Commitment ledger after this call</div>
      ${after.kept_rate != null ? `<span class="badge ${after.kept_rate >= 50 ? 'ok' : 'warn'}">${after.kept}/${after.kept + after.broken} kept (${after.kept_rate}%)</span>` : ''}
    </div>
    ${rows || `<div style="font-size:12px; color:#5B6572;">No earlier promise was checked on this call.</div>`}
    ${r.new_commitment ? `<div style="font-size:12px; margin-top:4px;"><b>New promise opened:</b> ${escapeHtml(r.new_commitment)}. The next call will ask whether it held.</div>` : ''}
    ${r.approach_used ? `<div style="font-size:11.5px; color:#5B6572; margin-top:3px;">Approach the agent used: ${escapeHtml(LV_APPROACH[r.approach_used] || r.approach_used)}. When this promise is resolved, the ledger learns whether that approach works with her.</div>` : ''}
  </div>`;
}

function lvProfileDiffPanel(s){
  const r = s.result;
  if(!r || !r.profile_before) return '';
  const p = s.profile || {};
  let body;
  if(!p.status) body = `<button class="btn sm" onclick="lvLoadProfile()">Show how the standing profile changed</button>`;
  else if(p.status === 'waiting') body = `<div style="font-size:12px; color:#5B6572;">${escapeHtml(p.note || 'Hindsight is rewriting the profile…')}</div>`;
  else if(p.status === 'same') body = `<div style="font-size:12px; color:#5B6572;">Hindsight has not rewritten the profile yet (it does so after consolidating new facts). <button class="btn sm" onclick="lvRefreshProfile()">Rewrite it now</button></div>`;
  else if(p.status === 'error') body = `<div style="font-size:12px; color:#A6453A;">${escapeHtml(p.error)}</div>`;
  else {
    const d = lvDiffLines(r.profile_before.content, p.content);
    body = (d.added.length || d.removed.length)
      ? `${d.added.map(l => `<div style="font-size:12px; line-height:1.5; background:#E6F4EA; border-left:3px solid #1C653C; padding:3px 8px; margin:3px 0;">+ ${escapeHtml(l)}</div>`).join('')}
         ${d.removed.map(l => `<div style="font-size:12px; line-height:1.5; background:#F8E6E3; border-left:3px solid #A6453A; padding:3px 8px; margin:3px 0; text-decoration:line-through; color:#7A3A32;">− ${escapeHtml(l)}</div>`).join('')}
         <div style="font-size:10.5px; color:#8A93A0; margin-top:4px;">Rewritten by Hindsight ${escapeHtml(String(p.updated_at || '').slice(0,16).replace('T',' '))}. Green lines are new, struck lines were dropped.</div>`
      : `<div style="font-size:12px; color:#5B6572;">The profile was rewritten but says the same thing.</div>`;
  }
  return `<div style="background:#fff; border:1px solid #CFE0DA; border-radius:5px; padding:8px 10px; margin-top:10px;">
    <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#3F6659; margin-bottom:6px;">Standing profile: before and after this call</div>
    ${body}
  </div>`;
}

async function lvLoadProfile(){
  const s = lvState(); if(!s || !s.result) return;
  // The server asks Hindsight to rewrite the profile as soon as the call is retained; wait for it (up to ~90 s).
  for(let i = 0; i < 18; i++){
    s.profile = {status:'waiting', note: i === 0 ? 'Reading the current profile…' : 'Hindsight is rewriting the profile from this call…'}; lvRender();
    try {
      const d = await fetch('/api/memory/mental-model?helper=' + encodeURIComponent(s.helperId)).then(r => r.json());
      if(d.content && d.content !== s.result.profile_before.content){
        s.profile = {status:'ready', content: d.content, updated_at: d.updated_at};
        lvRender(); return;
      }
    } catch(e){ s.profile = {status:'error', error: e.message}; lvRender(); return; }
    if(lvState() !== s) return;
    await new Promise(r => setTimeout(r, 5000));
  }
  s.profile = {status:'same'};
  lvRender();
}

async function lvRefreshProfile(){
  const s = lvState(); if(!s || !s.result) return;
  s.profile = {status:'waiting', note:'Asking Hindsight to rewrite the profile from everything it now knows…'}; lvRender();
  try {
    await fetch('/api/memory/mental-model/refresh', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({helper: s.helperId})});
    for(let i = 0; i < 18; i++){
      await new Promise(r => setTimeout(r, 5000));
      const d = await fetch('/api/memory/mental-model?helper=' + encodeURIComponent(s.helperId)).then(r => r.json());
      if(d.content && d.content !== s.result.profile_before.content){
        s.profile = {status:'ready', content: d.content, updated_at: d.updated_at};
        log('mem', 'MEMORY AGENT', `Hindsight rewrote the standing profile for ${s.helperName} with what this call taught it.`);
        lvRender(); return;
      }
    }
    s.profile = {status:'same'};
  } catch(e){ s.profile = {status:'error', error: e.message}; }
  lvRender();
}

/* ------------------------------------------------------------------ learning metrics */

let lvMetrics = null;

async function lvLoadMetrics(){
  try {
    const res = await fetch('/api/memory/metrics');
    lvMetrics = await res.json();
  } catch(e){ lvMetrics = {error: e.message}; }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function renderLearningMetrics(){
  if(!lvMetrics){ lvLoadMetrics(); return `<div class="card" style="font-size:12.5px; color:var(--ink-soft);">Loading learning metrics…</div>`; }
  if(lvMetrics.error) return `<div class="card" style="font-size:12.5px; color:var(--rust);">${escapeHtml(lvMetrics.error)}</div>`;
  const m = lvMetrics.summary; const calls = lvMetrics.calls.filter(c => c.memory_used).slice(-8);
  const bar = (v, max, color) => `<div style="height:${max ? Math.max(3, Math.round(v / max * 46)) : 3}px; width:14px; background:${color}; border-radius:2px 2px 0 0;" title="${v}"></div>`;
  const maxRec = Math.max(1, ...calls.map(c => c.memories_recalled));
  const maxCit = Math.max(1, ...calls.map(c => c.memory_citations));
  const tile = (n, label) => `<div class="metric"><div class="label">${label}</div><div class="num">${n}</div></div>`;
  return `<div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft);">Is the agent getting better? · per call, oldest to newest</div>
      <span class="badge neutral">${m.memory_calls} memory-backed calls · ${m.coordinator_feedback} coordinator reviews</span>
    </div>
    <div class="grid g3" style="margin-bottom:12px;">${tile(m.avg_memories_recalled, 'Avg memories recalled per call')}${tile(m.avg_citations, 'Avg sentences grounded in memory')}${tile(m.commitment_rate + '%', 'Calls ending in a commitment')}</div>
    ${m.commitments && m.commitments.kept_rate != null ? `<div class="grid g3" style="margin-bottom:12px;">${tile(m.commitments.kept_rate + '%', 'Promises kept (ledger)')}${tile(m.commitments.kept + ' / ' + (m.commitments.kept + m.commitments.broken), 'Kept / resolved')}${tile(m.commitments.open, 'Open promises to check')}</div>` : ''}
    ${calls.length ? `<div style="display:flex; gap:18px; align-items:flex-end; padding:6px 0 0;">
      ${calls.map(c => `<div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
        <div style="display:flex; gap:3px; align-items:flex-end; height:48px;">${bar(c.memories_recalled, maxRec, 'var(--brass)')}${bar(c.memory_citations, maxCit, 'var(--teal)')}</div>
        <div style="font-size:10px; color:var(--ink-faint); white-space:nowrap;">${escapeHtml(c.helper.split(' ')[0])} ${c.churn_before != null ? `<span style="color:${c.churn_after < c.churn_before ? 'var(--teal)' : 'var(--rust)'};">${c.churn_before}→${c.churn_after}</span>` : ''}</div>
      </div>`).join('')}
    </div>
    <div style="font-size:10.5px; color:var(--ink-faint); margin-top:6px;"><span style="color:var(--brass);">■</span> memories recalled &nbsp; <span style="color:var(--teal);">■</span> sentences cited from memory &nbsp; churn before→after</div>` : `<div style="font-size:12.5px; color:var(--ink-soft);">No memory-backed calls yet.</div>`}
  </div>`;
}

function lvOpenFact(tag){
  const s = lvState();
  if(!s) return;
  lvSet({openFact: s.openFact === tag ? null : tag});
}

/* ------------------------------------------------------------------ render helpers */

function lvStatusBadge(status){
  const map = {
    connecting: ['Recalling memory & connecting…', '#8F6A2E', '#F3E8D6'],
    speaking:   ['Agent speaking', '#1C653C', '#D7EFE0'],
    listening:  ['Listening… speak now', '#A6453A', '#F4E3E0'],
    thinking:   ['Recalling & thinking…', '#31507A', '#E1E8F2'],
    idle:       ['Waiting for you', '#5B6572', '#E4E7DE'],
    completing: ['Extracting outcome & retaining to memory…', '#8F6A2E', '#F3E8D6'],
    completed:  ['Call saved', '#1C653C', '#D7EFE0'],
    ringing:    ['Ringing the helper\'s phone…', '#8F6A2E', '#F3E8D6'],
    oncall:     ['On the call (helper\'s phone)', '#1C653C', '#D7EFE0'],
    declined:   ['Declined', '#A6453A', '#F4E3E0'],
    missed:     ['Not answered', '#A6453A', '#F4E3E0'],
    error:      ['Error', '#A6453A', '#F4E3E0'],
  };
  const [label, fg, bg] = map[status] || map.idle;
  const pulse = ['listening','speaking','thinking','connecting','completing','ringing','oncall'].includes(status);
  return `<span style="display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; background:${bg}; color:${fg};">
    <span style="width:8px; height:8px; border-radius:50%; background:${fg}; ${pulse ? 'animation:lvPulse 1.1s ease-in-out infinite;' : ''}"></span>${label}</span>`;
}

function lvFactByTag(s, tag){
  return (s.memory && s.memory.facts || []).find(f => f.tag === tag);
}

function lvTagChip(s, tag){
  const f = lvFactByTag(s, tag);
  const title = f ? escapeHtml(String(f.text).split(' | ')[0]) : tag;
  return `<button onclick="lvOpenFact('${tag}')" title="${title}" style="font-family:var(--font-mono); font-size:10px; font-weight:700; color:#8F6A2E; background:#F3E8D6; border:1px solid #E0CFAE; border-radius:3px; padding:0 5px; margin-left:4px; cursor:pointer; vertical-align:middle;">${tag}</button>`;
}

/* ------------------------------------------------------------------ step timings */

function lvMs(ms){
  if(ms == null) return '–';
  return ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms';
}

/** One small line under an agent reply: how long memory recall and the LLM took for it. */
function lvLatencyStrip(t, first){
  const l = t.latency;
  if(!l || l.llm_ms == null) return '';
  const parts = [];
  if(l.recall_ms != null) parts.push((first ? 'recall ' : 'recall on her words ') + lvMs(l.recall_ms) + (l.recall_ok === false ? ' (failed)' : ''));
  parts.push('LLM ' + lvMs(l.llm_ms));
  if(l.attribution_ms) parts.push('citations ' + lvMs(l.attribution_ms));
  parts.push('total ' + lvMs(l.total_ms));
  return `<div title="Latency for this reply" style="font-size:10.5px; color:#8A93A0; margin-top:2px; font-family:var(--font-mono);">⏱ ${parts.map(escapeHtml).join(' · ')}</div>`;
}

/** After the call: how long each save step took and whether it worked. */
function lvCompletionSteps(r){
  const steps = (r && r.trace) || [];
  if(!steps.length) return '';
  const label = {extract:'Extract outcome', save_local:'Save call', decision:'Decision Agent', retain:'Retain to Hindsight'};
  const chips = steps.filter(e => label[e.step]).map(e => {
    const skipped = /^skipped/.test(e.detail || '');
    const mark = skipped ? 'skipped' : e.ok ? '✓' : 'failed';
    return `<span class="badge ${skipped ? 'neutral' : e.ok ? 'ok' : 'bad'}" title="${escapeHtml(e.detail || '')}">${escapeHtml(label[e.step])} · ${skipped ? mark : lvMs(e.ms) + ' ' + mark}</span>`;
  });
  if(r.retain && r.retain.status === 'saving' && !steps.some(e => e.step === 'retain')) chips.push('<span class="badge warn">Retain to Hindsight · running…</span>');
  return `<div style="margin-top:10px;"><div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#5B6572; margin-bottom:4px;">Step timings</div><div style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px;">${chips.join('')}</div></div>`;
}

function lvAgentBubble(s, t, first){
  const cited = t.cited || [];
  const isMem = cited.length > 0;
  return `<div style="display:flex; flex-direction:column; align-items:flex-start;">
    <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; margin-bottom:2px; color:#9E520A;">Voice Agent${isMem ? ' <span style="color:#8F6A2E; font-weight:600; text-transform:none;">· from memory</span>' : ''}</div>
    <div style="max-width:88%; background:${isMem ? '#FFF6E5' : '#FFFDF8'}; border:1px solid ${isMem ? '#E6C98F' : '#E8DEC8'}; ${isMem ? 'box-shadow: inset 3px 0 0 #B4863F;' : ''} border-radius:6px; padding:8px 12px; font-size:13px; line-height:1.5;">
      ${escapeHtml(t.text)}${cited.map(tag => lvTagChip(s, tag)).join('')}
    </div>
    ${lvLatencyStrip(t, first)}
  </div>`;
}

function lvHelperBubble(s, t){
  const rec = t.recalled || [];
  return `<div style="display:flex; flex-direction:column; align-items:flex-end;">
    <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; margin-bottom:2px; color:#1C653C;">${escapeHtml(s.helperName)}</div>
    <div style="max-width:85%; background:#EAF4EE; border:1px solid #CBE1D2; border-radius:6px; padding:8px 12px; font-size:13px; line-height:1.5;">${escapeHtml(t.text)}</div>
    ${rec.length ? `<div style="font-size:10.5px; color:#5B6572; margin-top:3px;">recalled on this: ${rec.map(tag => lvTagChip(s, tag)).join('')}</div>` : ''}
  </div>`;
}

function lvOriginBadge(f){
  const o = f.origin || '';
  const map = {
    'learned on a call': ['learned live', '#1C653C', '#D7EFE0'],
    'coordinator feedback': ['coordinator', '#31507A', '#E1E8F2'],
    'coordinator note': ['coordinator note', '#31507A', '#E1E8F2'],
    'household': ['household', '#8F6A2E', '#F3E8D6'],
    'consolidated': ['observation', '#5B4A8F', '#ECE8F5'],
    'agency records': ['records', '#5B6572', '#E4E7DE'],
  };
  const m = map[o];
  return m ? `<span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:10px; color:${m[1]}; background:${m[2]}; white-space:nowrap;">${m[0]}</span>` : '';
}

const LV_APPROACH = {reassure_first:'Reassure first', listen_first:'Listen first', direct_problem_solving:'Straight to a fix', firm_reminder:'Firm reminder'};

function lvLedgerPanel(s){
  const L = s.ledger;
  if(!L) return '';
  const st = L.stats || {};
  const open = L.open || [];
  const best = L.best;
  const rate = st.kept_rate == null ? 'no outcomes yet' : `${st.kept}/${st.kept + st.broken} kept (${st.kept_rate}%)`;
  return `<div style="margin-top:10px; background:#fff; border:1px solid #E5EADF; border-radius:5px; padding:8px 10px;">
    <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
      <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#5B6572;">Commitment ledger</div>
      <span class="badge neutral">${escapeHtml(rate)}</span>
    </div>
    ${open.length ? `<div style="font-size:12px; line-height:1.5;"><b>Open promise to check:</b> ${escapeHtml(open[0].text)} <span style="color:#8A93A0; font-size:11px;">(${escapeHtml(String(open[0].made_at).slice(0,10))})</span></div>` : `<div style="font-size:12px; color:#5B6572;">No open promise on file.</div>`}
    ${best ? `<div style="font-size:12px; line-height:1.5; margin-top:4px;"><b>What works with her:</b> ${escapeHtml(LV_APPROACH[best.approach] || best.approach)} <span style="color:#1C653C;">(${best.kept} of ${best.kept + best.broken} promises kept)</span>. The agent uses this approach on this call.</div>` : `<div style="font-size:11.5px; color:#8A93A0; margin-top:4px;">No evidence yet about which approach works with her.</div>`}
    ${(L.avoid || []).length ? `<div style="font-size:11.5px; color:#A6453A; margin-top:2px;">Avoid: ${L.avoid.map(a => escapeHtml(LV_APPROACH[a.approach] || a.approach)).join(', ')}</div>` : ''}
  </div>`;
}

function lvMemoryPanel(s){
  const mem = s.memory;
  if(!mem) return '';
  if(mem.source === 'disabled'){
    return `<div style="background:#F4E3E0; border:1px solid #E29F96; border-radius:6px; padding:12px 14px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#9E3224; margin-bottom:6px;">Memory switched off</div>
      <div style="font-size:12.5px; color:#5B6572;">This call runs with no recall. The agent knows only the helper's name and the reason for the call. Compare it with a memory-on call to see the difference.</div>
    </div>`;
  }
  const label = mem.source === 'hindsight' ? `Hindsight bank <code>${escapeHtml(mem.bank || '')}</code>` : (mem.source === 'local' ? 'local SQLite (Hindsight not connected)' : 'none');
  const open = s.openFact ? lvFactByTag(s, s.openFact) : null;
  return `
    <div style="background:#F7F8F6; border:1px solid #E5EADF; border-radius:6px; padding:12px 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#5B6572;">What the agent recalled</div>
        <span class="badge ${mem.source === 'hindsight' ? 'ok' : 'warn'}">${mem.facts.length} ${mem.facts.length === 1 ? 'memory' : 'memories'} · ${label}</span>
      </div>
      ${open ? `<div style="background:#FFF6E5; border:1px solid #E6C98F; border-radius:4px; padding:8px 10px; margin-bottom:8px; font-size:12.5px;"><b style="font-family:var(--font-mono); color:#8F6A2E;">${escapeHtml(open.tag)}</b> ${escapeHtml(String(open.text).split(' | ')[0])}${open.when ? ` <span style="color:#8A93A0; font-size:11px;">(${escapeHtml(String(open.when).slice(0,10))})</span>` : ''}<div style="font-size:11px; color:#5B6572; margin-top:4px;">This fact was retained by Hindsight from an earlier call or feedback, and recalled for this conversation.</div></div>` : ''}
      ${mem.facts.length ? `<ul style="margin:0; padding-left:18px; font-size:12.5px; line-height:1.55;">${mem.facts.slice(0,12).map(f => `<li><span style="font-family:var(--font-mono); font-size:10px; color:#8F6A2E; cursor:pointer;" onclick="lvOpenFact('${f.tag}')">${escapeHtml(f.tag || '')}</span> ${escapeHtml(String(f.text).split(' | ')[0])}${f.when ? ` <span style="color:#8A93A0; font-size:11px;">(${escapeHtml(String(f.when).slice(0,10))})</span>` : ''} ${lvOriginBadge(f)}</li>`).join('')}${mem.facts.length > 12 ? `<li style="color:#8A93A0;">and ${mem.facts.length - 12} more</li>` : ''}</ul>`
        : `<div style="font-size:12.5px; color:#5B6572;">Nothing on record yet. This is the first conversation with ${escapeHtml(s.helperName)}. The next call will start with what is said now.</div>`}
      ${lvLedgerPanel(s)}
      ${mem.mental_model && mem.mental_model.content ? `<details style="margin-top:10px;"><summary style="font-size:11.5px; font-weight:700; color:#3F6659; cursor:pointer;">Standing profile: ${escapeHtml(mem.mental_model.name || 'How to coach ' + s.helperName)} (kept current by Hindsight)</summary><div style="font-size:12px; line-height:1.55; color:var(--ink); margin-top:6px; white-space:pre-wrap;">${escapeHtml(String(mem.mental_model.content).slice(0, 1400))}</div></details>` : ''}
      ${mem.error && mem.source !== 'hindsight' ? `<div style="font-size:11px; color:#A6453A; margin-top:6px;">${escapeHtml(mem.error)}</div>` : ''}
    </div>`;
}

function lvComparePanel(){
  const c = window.LIVE_VOICE_COMPARE;
  if(!c) return '';
  const cell = (title, a, b, tone) => `<div style="background:${tone}; border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
    <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#5B6572; margin-bottom:6px;">${title}</div>
    <div style="font-size:12.5px; line-height:1.5;"><b>Opening:</b> ${escapeHtml(a || '…')}</div>
    <div style="font-size:12.5px; line-height:1.5; margin-top:6px;"><b>Reason for calling:</b> ${escapeHtml(b || '…')}</div></div>`;
  return `<div style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#5B6572;">Same call, with and without memory</div>
      ${c.status === 'running' ? '<span class="badge warn">running memory-off call…</span>' : c.status === 'error' ? `<span class="badge bad">${escapeHtml(c.error || 'failed')}</span>` : '<span class="badge neutral">memory-off run is not retained</span>'}
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      ${cell('Without memory', c.greeting, c.secondTurn, '#FAFBF9')}
      ${cell('With memory', c.memGreeting, c.memSecond, '#FFF6E5')}
    </div>
  </div>`;
}

function lvResultPanel(s){
  const r = s.result;
  if(!r) return '';
  const fb = s.feedback;
  const fbHtml = fb && fb.status === 'done'
    ? `<div style="font-size:12px; color:#1C653C; margin-top:8px;">Feedback recorded (${escapeHtml(fb.verdict)}${fb.note ? ': ' + escapeHtml(fb.note) : ''}) and retained to Hindsight (${escapeHtml(fb.retain.status)}). The next call with ${escapeHtml(s.helperName)} will reflect it.</div>`
    : fb && fb.status === 'sending' ? `<div style="font-size:12px; color:#5B6572; margin-top:8px;">Retaining feedback…</div>`
    : fb && fb.status === 'error' ? `<div style="font-size:12px; color:#A6453A; margin-top:8px;">${escapeHtml(fb.error)}</div>`
    : `<div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;">
        <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:#5B6572;">Coordinator review:</span>
        <button class="btn sm" onclick="lvSendFeedback('approve')" style="border-color:#1C653C; color:#1C653C;">✓ Accurate</button>
        <button class="btn sm" onclick="lvSendFeedback('correct')">✎ Correct it</button>
        <button class="btn sm" onclick="lvSendFeedback('reject')" style="border-color:#A6453A; color:#A6453A;">✕ Wrong</button>
      </div>`;
  const p = s.proposal;
  const propHtml = s.proposalStatus === 'thinking' ? `<div style="font-size:12px; color:#5B6572; margin-top:10px;">Reflecting on whether this call suggests a standing rule…</div>`
    : s.proposalStatus === 'proposed' && p ? `<div style="background:#FFF6E5; border:1px solid #E6C98F; border-radius:6px; padding:10px 12px; margin-top:10px;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#8F6A2E; margin-bottom:4px;">The agent proposes a rule</div>
        <div style="font-size:13px; font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:12.5px; margin-top:3px;">${escapeHtml(p.content)}</div>
        <div style="font-size:11.5px; color:#5B6572; margin-top:4px;">Evidence: ${escapeHtml(p.evidence || '')}</div>
        <div style="display:flex; gap:8px; margin-top:8px;"><button class="btn sm primary" onclick="lvApproveRule()" style="background:#1C653C; border-color:#12592D;">Approve as directive</button><button class="btn sm" onclick="lvSet({proposalStatus:'dismissed'})">Not now</button></div>
      </div>`
    : s.proposalStatus === 'approved' ? `<div style="font-size:12px; color:#1C653C; margin-top:10px;">Directive saved to the bank. Every future reflect and call obeys it.</div>`
    : s.proposalStatus === 'none' ? `<div style="font-size:12px; color:#5B6572; margin-top:10px;">Reflect found no new rule worth adding from this call.</div>`
    : s.proposalStatus === 'error' ? `<div style="font-size:12px; color:#A6453A; margin-top:10px;">Rule proposal failed: ${escapeHtml(s.proposalError || '')}</div>` : '';

  return `
    <div style="background:#F4F8F5; border:1px solid #CBE1D2; border-radius:6px; padding:14px; margin-top:12px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#1C653C; margin-bottom:8px;">What was recorded from this call</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:8px 16px; font-size:12.5px;">
        <div><b>Sentiment:</b> ${escapeHtml(r.outcome.sentiment)}</div>
        <div><b>Root cause:</b> ${escapeHtml(r.outcome.root_cause_identified || 'not identified')}</div>
        <div><b>Commitment:</b> ${escapeHtml(r.outcome.specific_commitment || 'none made')}</div>
        <div><b>Will notify household if late:</b> ${r.outcome.notification_commitment ? 'yes' : 'no'}</div>
        <div><b>Follow-up:</b> ${escapeHtml(r.outcome.follow_up_date)}</div>
        <div><b>Memory used:</b> ${r.outcome.memory_citations || 0} cited sentence${(r.outcome.memory_citations || 0) === 1 ? '' : 's'}, ${r.outcome.memories_recalled || 0} facts recalled</div>
      </div>
      <div style="font-size:12.5px; margin-top:8px;"><b>Coordinator note:</b> ${escapeHtml(r.outcome.coordinator_note)}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
        <div style="background:#fff; border:1px solid #CBE1D2; border-radius:5px; padding:8px 10px;">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#1C653C; margin-bottom:4px;">Learned from this call</div>
          ${(r.learned || []).length ? `<ul style="margin:0; padding-left:16px; font-size:12px; line-height:1.5;">${r.learned.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : `<div style="font-size:12px; color:#5B6572;">Nothing new. She confirmed what was already known.</div>`}
          <div style="font-size:10.5px; color:#8A93A0; margin-top:4px;">Taken only from ${escapeHtml(s.helperName.split(' ')[0])}'s own words. The next call starts with these.</div>
        </div>
        <div style="background:#fff; border:1px solid #E6C98F; border-radius:5px; padding:8px 10px;">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#8F6A2E; margin-bottom:4px;">Already knew and used</div>
          ${(r.used || []).length ? `<ul style="margin:0; padding-left:16px; font-size:12px; line-height:1.5;">${r.used.map(f => `<li><span style="font-family:var(--font-mono); font-size:10px; color:#8F6A2E;">${escapeHtml(f.tag)}</span> ${escapeHtml(f.text)} ${lvOriginBadge(f)}</li>`).join('')}</ul>` : `<div style="font-size:12px; color:#5B6572;">No remembered fact was used on this call.</div>`}
        </div>
      </div>
      ${lvCommitmentResult(s)}
      ${lvProfileDiffPanel(s)}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; font-size:12px;">
        <span class="badge ${r.retain.status === 'ok' ? 'ok' : (r.retain.status === 'queued' || r.retain.status === 'saving' ? 'warn' : 'bad')}">Hindsight retain: ${r.retain.status === 'queued' ? 'queued for retry' : r.retain.status === 'saving' ? 'saving in the background…' : escapeHtml(r.retain.status)}</span>
        ${r.decision ? `<span class="badge neutral">Decision Agent: churn ${r.decision.old_churn} → ${r.decision.new_churn}</span>` : ''}
      </div>
      ${r.decision && r.decision.reasons && r.decision.reasons.length ? `<div style="font-size:11.5px; color:#5B6572; margin-top:4px;">Because: ${escapeHtml(r.decision.reasons.join('; '))}</div>` : ''}
      ${r.retain.status !== 'ok' ? `<div style="font-size:11px; color:#5B6572; margin-top:6px;">${escapeHtml(r.retain.detail)}</div>` : ''}
      ${lvCompletionSteps(r)}
      ${fbHtml}
      ${propHtml}
      <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center;">
        <a class="btn sm" href="${lvWhatsAppLink(s)}" target="_blank" rel="noopener" style="text-decoration:none;">Share summary on WhatsApp</a>
        <button class="btn sm" onclick="lvDraftFollowup()" ${s.followup && s.followup.status === 'loading' ? 'disabled' : ''}>✎ Draft a WhatsApp follow-up</button>
        <button class="btn sm brass" onclick="lvStartFollowUp()">↻ Run the follow-up call now</button>
        <span style="font-size:11px; color:var(--ink-soft);">In practice this call happens on the follow-up date. The agent recalls what was promised and asks whether it held.</span>
      </div>
      ${lvFollowupHtml(s)}
    </div>`;
}

function renderLiveVoiceConsole(){
  const s = lvState();
  if(!s) return '';

  const transcriptHtml = s.transcript.map((t, i) => t.who === 'agent' ? lvAgentBubble(s, t, i === 0) : lvHelperBubble(s, t)).join('');
  const langName = {hi:'Hindi', te:'Telugu'}[s.language];
  const interimHtml = (s.status === 'listening')
    ? `<div style="display:flex; justify-content:flex-end;"><div id="lvInterim" style="max-width:85%; font-size:12.5px; color:#5B6572; font-style:italic; padding:4px 12px;">${escapeHtml(s.interim || '…')}</div></div>`
    : '';

  const controls = !s.sessionId || s.result ? '' : `
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; font-size:12.5px; color:var(--ink-soft);">
      <span>📱 This call is running on ${escapeHtml(s.helperName)}'s phone screen. This console mirrors it live.</span>
      <button class="btn sm" onclick="lvOpenPhoneScreen('${s.helperId}')">Open phone screen ↗</button>
    </div>`;

  const memoryOn = s.useMemory !== false;
  return `
    <div id="liveVoiceConsole" class="card" style="margin-bottom:20px; border-left:4px solid ${memoryOn ? '#B4863F' : '#A6453A'}; padding:20px; box-shadow:0 4px 14px rgba(166,69,58,0.10);">
      <style>@keyframes lvPulse{0%,100%{opacity:.35}50%{opacity:1}}</style>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-size:14px; font-weight:700; color:var(--ink); display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span>🎙️ Live voice call · ${escapeHtml(s.helperName)}</span>
            ${lvStatusBadge(s.status)}
            <span class="badge ${memoryOn ? 'ok' : 'bad'}">${memoryOn ? 'memory ON' : 'memory OFF'}</span>
            ${langName ? `<span class="badge neutral">in ${langName}</span>` : ''}
          </div>
          ${s.purpose ? `<div style="font-size:12px; color:var(--ink); margin-top:4px;"><b>Why we are calling:</b> ${escapeHtml(s.purpose)}</div>` : ''}
          <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
            On the helper\'s phone screen · brain: Groq · memory: Hindsight recall before the first word and on every turn, retain after the call · scenario: ${escapeHtml(s.scenario)}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${s.sessionId && memoryOn ? `<button class="btn sm" onclick="lvRunComparison()" ${window.LIVE_VOICE_COMPARE && window.LIVE_VOICE_COMPARE.status === 'running' ? 'disabled' : ''}>⇄ Compare without memory</button>` : ''}
          ${s.sessionId && !s.result ? `<button class="btn sm primary" onclick="endLiveVoiceSession()" ${s.status === 'completing' ? 'disabled' : ''} style="background:#1C653C; border-color:#12592D; font-weight:700;">💾 End call & save to memory</button>` : ''}
          <button class="btn sm" onclick="cancelLiveVoiceSession()">${s.result ? '✕ Close' : '✕ Cancel'}</button>
        </div>
      </div>

      ${s.error ? `<div style="background:#F4E3E0; border:1px solid #E29F96; color:#9E3224; border-radius:4px; padding:8px 12px; font-size:12.5px; margin-bottom:10px;">${escapeHtml(s.error)}</div>` : ''}

      <div style="display:grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap:14px;">
        <div>
          <div id="lvTranscript" style="background:#FAFBF9; border:1px solid #E5EADF; border-radius:6px; padding:14px; min-height:200px; max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
            ${transcriptHtml || `<div style="color:#8A93A0; font-size:12.5px;">Connecting…</div>`}
            ${interimHtml}
          </div>
          <div style="font-size:11px; color:#8A93A0; margin-top:4px;">Amber bubbles are sentences the agent built from memory. Click a tag to see the fact and when it was learned.</div>
          ${s.hint ? `<div style="font-size:12px; color:#5B6572; margin-top:6px;">${escapeHtml(s.hint)}</div>` : ''}
          ${controls}
          ${lvComparePanel()}
        </div>
        <div>
          ${lvMemoryPanel(s)}
          ${lvResultPanel(s)}
        </div>
      </div>
    </div>`;
}

/** Memory toggle shown next to the Start button on the Voice page. */
function renderMemoryToggle(){
  const on = window.LIVE_VOICE_USE_MEMORY !== false;
  return `<label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); cursor:pointer; user-select:none;">
    <input type="checkbox" ${on ? 'checked' : ''} onchange="lvToggleMemory(this.checked)" /> Use Hindsight memory
  </label>`;
}
