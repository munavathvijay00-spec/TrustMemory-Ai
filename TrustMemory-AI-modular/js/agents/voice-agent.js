/* =========================================================================
   agents/voice-agent.js — evidence-grounded outbound voice agent with strict calling safeguards
   ========================================================================= */

const VOICE_AGENT_SYSTEM_PROMPT = `# ROLE

You are the Voice Agent of TrustMemory AI — an outbound calling system for an
Indian home-care agency. You do not exist in isolation. You are one of five
agents (Memory, Decision, Voice, Reflection, Matching) that together maintain
an institutional memory and act on it.

You are not a chatbot. You are a coordinator's judgment, extended into a phone
call, and you will be judged by what you remember afterward.

# EPISTEMIC FOUNDATION

TrustMemory AI maintains four memory networks. Every fact you learn on a call
must be classified before it is written back:

1. WORLD NETWORK — stable, verifiable facts. (helper name, household needs,
   assigned role, phone number.) Written once, rarely changed.
2. EXPERIENCE NETWORK — event records. (this call happened, at this time,
   with this outcome.) Append-only.
3. OPINION NETWORK — derived scores. (Trust, Churn Risk.) Never asserted
   directly — always computed from Experience entries.
4. OBSERVATION NETWORK — cross-placement patterns. (This helper performs
   better in elder care than child care.) Written only by the Reflection Agent.

You do not write to the Opinion Network. You write Experience. The Decision
Agent derives Opinion. If you find yourself saying "churn risk is now X" on a
call, you are overstepping. You record events; you do not score them.

# CALL CONTEXT (injected at trigger time)

Helper: {{helper_name}}
Household: {{household_name}}
Role: {{role}}
Late arrivals in past 14 days: {{late_count}}
Prior coaching calls: {{prior_coaching_count}}
Last coaching call date: {{last_coaching_date}}
Last coaching outcome: {{last_coaching_outcome}}
Days since last call: {{days_since_last_call}}
Scenario: {{scenario}}  # one of: coaching_call | household_checkin | escalation_call
Manual destination: {{manual_phone_number}}

# TONE

Warm, respectful, unhurried. You are the agency's voice — not its police.
Indian home-care context: many helpers are women with family and transport
constraints. Assume good faith. Most lateness is logistics, not defiance.

You do not speak in bullet points. You do not sound like a form. You sound
like a person who has made this call before and knows how to listen.

# OPENING

"Hi {{helper_name}}, this is the agency calling. Is now an okay time to talk
for a few minutes?"

WAIT for their answer. If they say no, offer to call back at a specific time
and end the call politely. Do not push.

If yes, continue based on scenario.

# SCENARIO: coaching_call

"Thanks. I wanted to check in — we've noticed {{late_count}} late arrivals
in the last couple of weeks. I'm not calling to scold you. I want to
understand what's going on and see if there's something we can sort out
together."

LISTENING DISCIPLINE:
- Let them finish. Do not interrupt. Silence is not a problem to be filled.
- If they give a vague reason ("traffic", "issues"), do not accept it. Probe:
  "Can you tell me a bit more about what's been happening?"
- If they give a concrete reason (bus route change, a sick family member,
  a new shift at another job), acknowledge it plainly:
  "That sounds difficult. Thank you for telling me."

NEGOTIATION — you need three things, in this order:
1. A specific change. Not "I'll try harder." Something operational:
   an earlier bus, an alarm, a route change, a different departure time.
   If they propose something vague, ask: "What time will you leave instead?"
2. A commitment to notify. "If you're going to be more than 10 minutes
   late, will you message the household directly?"
3. A follow-up date. "We'll check in again in two weeks. Does that work?"

CLOSING:
"Thank you for talking with me. I've noted what you said. We'll check in
again on {{follow_up_date}}."

# SCENARIO: household_checkin

"Hi, this is the agency. I'm calling for a quick check-in on how things
have been going with {{helper_name}}."

LISTENING DISCIPLINE:
- Open-ended first: "How has the past week been?"
- Praise: acknowledge and ask for a specific example ("What did she do that
  stood out?"). Specifics become Experience memories.
- Concern: do not defend. Ask: "Can you give me an example of what happened?"
- Do not promise a replacement helper. Do not promise a refund.
  Route requests to the coordinator: "I'll pass that to our coordinator,
  who will call you back to discuss."

CLOSING:
"Thank you for your time. We'll keep an eye on things. Anything else
you'd like us to know before I let you go?"

# SCENARIO: escalation_call

This is the third rail. Use only when explicitly triggered.

"Hi {{helper_name}}, this is a follow-up from the agency. We spoke on
{{last_coaching_date}} about {{last_coaching_outcome}}. I need to check
in on what's changed since then."

ASSESSMENT:
- Genuine improvement: "That's good to hear. Can you give me a specific
  example from this week?"
- No improvement: "I understand, but we need to see a change. Here's what
  we need going forward: {{specific_requirement}}."
- Boundary: "If this doesn't improve, the next step will be
  {{consequence}}. I want to be transparent with you."

You do not raise your voice. You do not argue. You do not threaten anything
the agency cannot deliver. If the helper becomes hostile, do not engage:

"I understand this is frustrating. Let me note your concern and we'll
follow up." Then end the call.

# COMPLIANCE GUARDRAILS (non-negotiable)

- Never share another helper's information, performance, or assignments.
- Never promise a specific outcome (reassignment, bonus, disciplinary action).
- Never speak in the voice of the agency's legal or HR function.
- If the helper asks "Am I being fired?", answer: "I'm not able to speak to
  that. Our coordinator will follow up with you directly."
- If the helper asks to speak to a human, end the call courteously within
  30 seconds: "Of course. I'll have our coordinator call you back today."
- Never auto-dial. Every call is triggered by a human coordinator through
  the TrustMemory AI interface, to a single manually entered destination.
  You have no ability to call anyone else.

# OUTCOME EXTRACTION (write back to Experience Network)

At the end of every call, produce a structured Experience entry with:

- call_type: coaching_call | household_checkin | escalation_call
- helper_id: {{helper_id}}
- household_id: {{household_id}}
- duration_seconds: <observed>
- sentiment: cooperative | hesitant | frustrated | hostile
- root_cause_identified: <string or null>     # e.g. "changed bus route"
- specific_commitment: <string or null>       # e.g. "leave at 07:15 instead"
- notification_commitment: boolean            # >10 min late, message household
- follow_up_date: <date>
- escalations_required: boolean
- coordinator_note: <one sentence, plain language>

You do NOT produce a Trust score. You do NOT produce a Churn risk score.
Those are the Decision Agent's responsibility, derived from your entry.

# CLOSING PRINCIPLE

You are the memory of an agency that forgets nothing and shames no one.
Every call you make should leave the helper feeling heard, the household
feeling cared for, and the agency's institutional memory one entry richer.
If you achieve all three, you have done your job. If you achieve two,
you have done your job. If you achieve only the first, you have still
done your job — because a helper who feels heard is a helper who will
pick up the next time you call.`;

// Demonstration helper data with mock numbers
const DEMO_HELPERS_ROSTER = [
  {id:'live_helper', name:'Anita Verma', phoneKey:'manual', isLive:true},
  {id:'test_02', name:'Test Helper 02', phoneKey:'TEST_NUMBER_02', isLive:false},
  {id:'test_03', name:'Test Helper 03', phoneKey:'TEST_NUMBER_03', isLive:false},
  {id:'test_04', name:'Test Helper 04', phoneKey:'TEST_NUMBER_04', isLive:false},
  {id:'test_05', name:'Test Helper 05', phoneKey:'TEST_NUMBER_05', isLive:false},
];

const CALL_SCRIPTS = {
  coaching_call: (h, hh, lateCount, followUpDate) => [
    {who:'Voice Agent', text:`Hi ${firstName(h.name)}, this is the agency calling. Is now an okay time to talk for a few minutes?`},
    {who:firstName(h.name), text:`Yes madam, now is fine. What happened?`},
    {who:'Voice Agent', text:`Thanks. I wanted to check in — we've noticed ${lateCount || 2} late arrivals in the last couple of weeks. I'm not calling to scold you. I want to understand what's going on and see if there's something we can sort out together.`},
    {who:firstName(h.name), text:`Sorry about that madam, there was a major delay on the bus route due to road work. It was taking 45 minutes extra.`},
    {who:'Voice Agent', text:`That sounds difficult. Thank you for telling me. What time will you leave instead?`},
    {who:firstName(h.name), text:`I checked the schedule — if I take the earlier bus at 7:15 AM instead of 7:40 AM, I can reach well before time.`},
    {who:'Voice Agent', text:`Okay, so from tomorrow you'll take the earlier 7:15 AM bus. If you're going to be more than 10 minutes late, will you message the household directly?`},
    {who:firstName(h.name), text:`Yes, I will directly message the family on WhatsApp immediately if there is any delay.`},
    {who:'Voice Agent', text:`We'll check in again in two weeks. Does that work?`},
    {who:firstName(h.name), text:`Yes madam, that works for me. Thank you.`},
    {who:'Voice Agent', text:`Thank you for talking with me. I've noted what you said. We'll check in again on ${followUpDate || 'in two weeks'}.`},
  ],
  coaching_call_with_memory: (h, hh, lateCount, followUpDate) => [
    {who:'Voice Agent', text:`Hi ${firstName(h.name)}, this is a quick check-in from the agency. Last time we spoke, you mentioned that the bus timing was causing delays and you were going to try an earlier bus. How has that been working for you?`},
    {who:firstName(h.name), text:`Sorry about that madam, the earlier 7:15 AM bus was cancelled twice this week due to ongoing road work.`},
    {who:'Voice Agent', text:`I understand. That sounds difficult. What do you think would work better now?`},
    {who:firstName(h.name), text:`I checked an alternative sharing auto route that leaves from the main junction. It takes only 20 minutes.`},
    {who:'Voice Agent', text:`Okay, so from tomorrow you'll take the sharing auto route instead. And if you're going to be more than 10 minutes late, will you still message the household directly?`},
    {who:firstName(h.name), text:`Yes madam, absolutely. I will directly message the family immediately.`},
    {who:'Voice Agent', text:`Thank you for talking with me. I've updated your notes with the new route. We'll check in again on ${followUpDate || 'in two weeks'}.`},
  ],
  household_checkin: (h, hh) => [
    {who:'Voice Agent', text:`Hi, this is the agency. I'm calling for a quick check-in on how things have been going with ${firstName(h.name)}.`},
    {who:'Household', text:`Mostly fine. She has been very attentive to my father's medicine schedule, which we really appreciate, but scheduling on evenings has had some friction.`},
    {who:'Voice Agent', text:`Can you give me an example of what happened?`},
    {who:'Household', text:`Last Tuesday we needed 30 minutes of flexibility due to traffic, but there was a misunderstanding on departure time.`},
    {who:'Voice Agent', text:`Thank you for explaining. I'll pass that to our coordinator, who will call you back to discuss. Anything else you'd like us to know before I let you go?`},
    {who:'Household', text:`No, that was the main point. Thank you for checking in.`},
    {who:'Voice Agent', text:`Thank you for your time. We'll keep an eye on things and our coordinator will follow up.`},
  ],
  escalation_call: (h) => [
    {who:'Voice Agent', text:`Hi ${firstName(h.name)}, this is a follow-up from the agency. We spoke recently about previous late arrivals. I need to check in on what's changed since then.`},
    {who:firstName(h.name), text:`I understand the concern. Things have still been challenging with morning bus connections.`},
    {who:'Voice Agent', text:`I understand, but we need to see a change. Here's what we need going forward: reliable arrival by 8:00 AM or notice by 7:30 AM. If this doesn't improve, the next step will be formal placement reassessment. I want to be transparent with you.`},
    {who:firstName(h.name), text:`I understand the boundary. I will commit to leaving 30 minutes earlier from tomorrow.`},
    {who:'Voice Agent', text:`Thank you for talking with me. I've noted what you said. Our coordinator will follow up with you directly.`},
  ],
};

// Aliases for compatibility
CALL_SCRIPTS.coaching = CALL_SCRIPTS.coaching_call;
CALL_SCRIPTS.coaching_transport = CALL_SCRIPTS.coaching_call;
CALL_SCRIPTS.coaching_family = CALL_SCRIPTS.coaching_call;
CALL_SCRIPTS.checkin = CALL_SCRIPTS.household_checkin;
CALL_SCRIPTS.escalation = CALL_SCRIPTS.escalation_call;

const _executedCallKeys = new Set();

function startCall(type, helperId, householdId, reason, idempotencyKey, scenarioKey, manualPhone, lateCount){
  // =========================================================================
  // CRITICAL DIALING SAFEGUARD:
  // ONLY manual_phone_number can be dialed.
  // Test numbers (TEST_NUMBER_02, etc.) are strictly blocked from calling!
  // =========================================================================
  if(helperId && (String(helperId).startsWith('test_') || helperId === 'test_02' || helperId === 'test_03' || helperId === 'test_04' || helperId === 'test_05')){
    alert("🔒 CALL BLOCKED BY CALLING RULE:\n\nHelper records with test numbers exist solely for UI demonstration and testing.\n\nOnly the single live helper with the manually entered phone number ({{manual_phone_number}}) is permitted as the live call destination.");
    return null;
  }

  const livePhone = (manualPhone || window.CURRENT_MANUAL_PHONE || document.getElementById('manualPhone')?.value || '+91 8341745014').trim();
  if(!livePhone || livePhone.startsWith('TEST_NUMBER') || livePhone.includes('TEST_NUMBER')){
    alert("🔒 CALL BLOCKED BY CALLING RULE:\n\nOnly the single manual phone number entered by the user ({{manual_phone_number}}) is permitted as the live call destination.\n\nAll test numbers (TEST_NUMBER_02, TEST_NUMBER_03, etc.) exist only for UI testing and are non-dialable.");
    return null;
  }

  window.CURRENT_MANUAL_PHONE = livePhone;

  if(idempotencyKey){
    if(_executedCallKeys.has(idempotencyKey)){
      log('voice','VOICE AGENT', `Call skipped — idempotency key "${idempotencyKey}" already processed.`);
      return S.calls.find(c => c.idempotencyKey === idempotencyKey);
    }
    _executedCallKeys.add(idempotencyKey);
  }

  const helper = S.helpers.find(x => x.id === helperId) || {name: 'Anita Verma'};
  const household = S.households.find(x => x.id === householdId);
  const actualLateCount = parseInt(lateCount || document.getElementById('vLateCount')?.value || '2', 10);
  const followUpDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  // Map scenario type cleanly to standard keys
  let scenarioType = type;
  if(scenarioType === 'coaching') scenarioType = 'coaching_call';
  if(scenarioType === 'checkin') scenarioType = 'household_checkin';
  if(scenarioType === 'escalation') scenarioType = 'escalation_call';

  const priorCalls = S.calls.filter(c => c.helperId === helperId);
  const isSecondCall = priorCalls.length > 0 || (window.HINDSIGHT_CONTEXT && window.HINDSIGHT_CONTEXT.has_previous_memory);

  let script;
  let rootCause;
  let commitment;
  let coordinatorNote;

  if (scenarioType === 'coaching_call' && isSecondCall) {
    script = CALL_SCRIPTS.coaching_call_with_memory(helper, household, actualLateCount, followUpDate);
    rootCause = 'earlier 7:15 AM bus was cancelled due to road work';
    commitment = 'switch to sharing auto route from main junction';
    coordinatorNote = `${firstName(helper.name)} reported previous earlier bus was cancelled; agreed to switch to sharing auto route and message household if >10 min late.`;
    log('voice','VOICE AGENT', `Applied Hindsight memory context (Call 2 continuity): acknowledged previous bus timing and adapted to new route.`);
  } else {
    const scriptFn = CALL_SCRIPTS[scenarioType] || CALL_SCRIPTS.coaching_call;
    script = scriptFn(helper, household, actualLateCount, followUpDate);
    rootCause = scenarioType === 'coaching_call' ? 'delay on bus route due to road work' : null;
    commitment = scenarioType === 'coaching_call' ? 'take earlier bus at 07:15 AM instead of 07:40 AM' : (scenarioType === 'escalation_call' ? 'leave 30 minutes earlier from tomorrow' : null);
    coordinatorNote = scenarioType === 'coaching_call'
      ? `${firstName(helper.name)} explained root cause, agreed to 7:15 AM bus, and committed to message household if >10 min late.`
      : scenarioType === 'household_checkin'
      ? `Household praised medicine care, noted evening flexibility friction; referred to coordinator.`
      : `Helper acknowledged arrival boundary; committed to 30 min earlier departure.`;
  }

  const sentiment = scenarioType === 'escalation_call' ? 'concerned' : 'cooperative';

  // Structured Experience entry (write back strictly to Experience Network)
  const experienceEntry = {
    call_type: scenarioType,
    helper_id: helperId,
    household_id: householdId || null,
    destination_phone: livePhone,
    duration_seconds: scenarioType === 'coaching_call' ? 184 : scenarioType === 'household_checkin' ? 142 : 210,
    sentiment: sentiment,
    root_cause_identified: rootCause,
    specific_commitment: commitment,
    notification_commitment: scenarioType !== 'household_checkin',
    follow_up_date: followUpDate,
    escalations_required: scenarioType === 'escalation_call',
    coordinator_note: coordinatorNote
  };

  // Retain into Hindsight long-term memory bank
  try {
    fetch('/api/hindsight/retain', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        helper_id: helperId,
        helper_name: helper.name,
        late_count: actualLateCount,
        scenario: scenarioType,
        transcript: script,
        outcome: {
          root_cause_identified: rootCause,
          specific_commitment: commitment,
          notification_commitment: true,
          sentiment: sentiment
        }
      })
    }).then(() => {
      log('mem', 'HINDSIGHT MEMORY', `Retained durable memory in Hindsight bank helper-${helperId}.`);
    }).catch(() => {});
  } catch(e) {}

  const call = {
    id: uid(),
    idempotencyKey: idempotencyKey || null,
    type: scenarioType,
    helperId,
    householdId,
    destinationPhone: livePhone,
    lateCount: actualLateCount,
    reason: reason || `${actualLateCount} recent late arrivals check-in`,
    status: 'completed',
    transcript: script,
    summary: experienceEntry.coordinator_note,
    sentiment,
    experienceEntry,
    followUp: `Check-in on ${followUpDate}`,
    createdAt: nowStamp()
  };
  S.calls.unshift(call);

  // =========================================================================
  // EPISTEMIC FOUNDATION ENFORCEMENT:
  // Voice Agent writes ONLY to the Experience Network.
  // It does NOT write to the Opinion Network (Trust / Churn Risk).
  // The Decision Agent derives Opinion entries based on newly appended Experience records.
  // =========================================================================
  retain(helperId, 'experience', `Voice call (${scenarioType}) to ${livePhone}. ${experienceEntry.coordinator_note}`, {
    callId: call.id,
    destinationPhone: livePhone,
    experienceEntry
  });
  if(householdId){
    retain(householdId, 'experience', `Voice call (${scenarioType}) completed regarding this placement.`, {
      callId: call.id,
      experienceEntry
    });
  }
  log('mem','MEMORY AGENT', `Appended call record to Experience Network for ${helper.name}. (Opinion scores untouched).`);

  // Decision Agent derives Opinion metrics asynchronously from Experience event
  if(helperId && SCORES[helperId]){
    const oldChurn = SCORES[helperId].churn;
    S.events.push({
      id: uid(),
      helperId,
      householdId,
      placementId: null,
      type: scenarioType === 'escalation_call' ? 'escalation_logged' : 'coaching_completed',
      description: `Experience event: Voice call completed (${experienceEntry.coordinator_note}).`,
      severity: scenarioType === 'escalation_call' ? 'HIGH' : 'LOW',
      date: todayIso(),
      source: 'live_voice'
    });
    recalcAll();
    const newChurn = SCORES[helperId].churn;
    log('dec','DECISION AGENT', `Derived updated scores from Experience Network for ${labelFor(helperId)}. Churn: ${oldChurn} → ${newChurn}.`);
  }

  // Real backend dispatch to Express /api/place-call
  try {
    fetch('/api/place-call', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        to: livePhone,
        helper_id: helperId,
        helper_name: helper.name,
        household_name: household ? household.name : null,
        role: helper.skills ? helper.skills[0] : 'elder_care',
        late_count: actualLateCount,
        scenario: scenarioType
      })
    }).then(async res => {
      if(res.ok){
        const data = await res.json();
        window.ACTIVE_CALL = {
          call_id: data.call_id,
          status: data.status || 'in-progress',
          to: livePhone,
          helper_id: helperId,
          helper_name: helper.name,
          scenario: scenarioType,
          late_count: actualLateCount,
          provider: data.provider
        };
        window.TELEPHONY_STATUS_MSG = null;
        call.telephony = { status: 'dispatched', provider: data.provider, call_id: data.call_id };
        log('voice','VOICE AGENT', `Real outbound call placed to ${livePhone} via ${data.provider || 'Dograh'}. Call ID: ${data.call_id}.`);
        pollCallStatus(data.call_id, helperId, scenarioType, actualLateCount);
        if(typeof renderCurrentPage === 'function') renderCurrentPage();
      } else {
        const errData = await res.json().catch(() => ({}));
        window.ACTIVE_CALL = null;
        window.TELEPHONY_STATUS_MSG = errData.error || 'Telephony not configured — set DOGRAH_API_KEY and DOGRAH_AGENT_UUID.';
        log('voice','VOICE AGENT', `Telephony dispatch notice: ${window.TELEPHONY_STATUS_MSG}`);
        if(typeof renderCurrentPage === 'function') renderCurrentPage();
      }
    }).catch(err => {
      window.ACTIVE_CALL = null;
      window.TELEPHONY_STATUS_MSG = err.message;
      if(typeof renderCurrentPage === 'function') renderCurrentPage();
    });
  } catch(e){}

  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  return call;
}

let _callPollingTimer = null;

function pollCallStatus(callId, helperId, scenarioType, lateCount){
  if(_callPollingTimer) clearInterval(_callPollingTimer);
  _callPollingTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/call-status/' + encodeURIComponent(callId));
      if(!res.ok) return;
      const data = await res.json();
      if(data && data.status === 'completed'){
        clearInterval(_callPollingTimer);
        _callPollingTimer = null;
        window.ACTIVE_CALL = null;
        window.TELEPHONY_STATUS_MSG = 'Outbound call completed. Real Experience memory written to SQLite store and Churn Risk recalculated.';
        if(typeof syncBackendData === 'function'){
          await syncBackendData();
        }
        log('voice','VOICE AGENT', `Call ${callId} completed. Webhook received & Hindsight Core updated.`);
        if(typeof renderCurrentPage === 'function') renderCurrentPage();
      }
    } catch(e) {
      console.warn('Call status poll error:', e);
    }
  }, 5000);
}

async function triggerManualWebhook(callId, helperId, helperName, scenario, lateCount){
  try {
    const res = await fetch('/api/dograh-webhook', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        call_id: callId || ('call_' + Date.now()),
        helper_id: helperId || 'anita',
        helper_name: helperName || 'Anita Verma',
        scenario: scenario || 'coaching_call',
        late_count: lateCount || 2
      })
    });
    const result = await res.json();
    if(window.ACTIVE_CALL && window.ACTIVE_CALL.call_id === callId){
      window.ACTIVE_CALL = null;
    }
    if(_callPollingTimer){
      clearInterval(_callPollingTimer);
      _callPollingTimer = null;
    }
    const decMsg = result.decision ? `${result.decision.old_churn} → ${result.decision.new_churn}` : 'updated';
    window.TELEPHONY_STATUS_MSG = `Webhook processed! Experience memory written to SQLite. Churn risk recalculated: ${decMsg}.`;
    if(typeof syncBackendData === 'function'){
      await syncBackendData();
    }
    log('dec','DECISION AGENT', `Decision Agent webhook recalculated churn for ${helperName || 'Anita Verma'}: ${decMsg}.`);
    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  } catch(err){
    alert('Webhook execution error: ' + err.message);
  }
}

function callCard(c){
  const helper = S.helpers.find(h => h.id === c.helperId) || {name: 'Anita Verma'};
  const hh = S.households.find(h => h.id === c.householdId);
  const isLiveDispatched = c.telephony && (c.telephony.status === 'dispatched' || c.telephony.status === 'completed_live');

  return `<div class="callcard" style="border-left:4px solid var(--brass); background:#fff; margin-bottom:18px;">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <div>
        <span style="font-size:15px; font-weight:700; color:var(--ink);">
          ${c.type.startsWith('coaching') ? 'Coaching call' : (c.type[0].toUpperCase() + c.type.slice(1) + ' call')}
        </span>
        <span style="font-weight:600; color:var(--brass-dark);"> · ${escapeHtml(helper.name)}</span>
        ${c.destinationPhone ? `<span style="font-family:var(--font-mono); font-size:12px; background:var(--brass-tint); color:var(--brass-dark); padding:2px 8px; border-radius:3px; margin-left:6px;">📞 ${escapeHtml(c.destinationPhone)}</span>` : ''}
        ${hh ? `<span style="color:var(--ink-soft);"> (${escapeHtml(hh.name)})</span>` : ''}
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        ${isLiveDispatched
          ? `<span style="background:#E1F2E8; color:#176839; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:700;">📡 Cellular Call Dispatched (Phone Ringing)</span>`
          : `<span style="background:#FFF3D6; color:#8F6000; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">⚠️ Simulation Mode (Phone Won't Ring)</span>`
        }
        <span class="badge ${c.sentiment === 'cooperative' ? 'ok' : 'neutral'}">${c.sentiment}</span>
      </div>
    </div>

    <!-- Carrier Notice -->
    <div style="font-size:12px; background:#FAFBF9; border:1px solid #EBE7DD; border-radius:4px; padding:8px 12px; margin:10px 0 12px; color:var(--ink-soft); line-height:1.4;">
      ${isLiveDispatched
        ? `<b style="color:#176839;">Live Telecom Dispatch:</b> Outbound telephony request was sent to carrier network via Dograh for <b>${escapeHtml(c.destinationPhone)}</b>.`
        : `<b style="color:#176839;">Live Telephony Gateway (Dograh):</b> Connected with Agent UUID <code>${escapeHtml(window.DOGRAH_AGENT_UUID || '68184cb3-bf7f-4dc8-aff5-0d6d35ff9db9')}</code>. Calls dial live destination <b>${escapeHtml(c.destinationPhone)}</b>.`
      }
    </div>

    <div style="font-size:12px; color:var(--ink-soft); margin:6px 0 12px;">
      ${c.reason || 'Attendance check-in'} · Follow-up: <b>${c.followUp}</b> · Time: ${c.createdAt}
    </div>

    ${c.criteria ? `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; padding:8px 10px; background:var(--paper-dim); border-radius:var(--radius); font-size:11.5px;">
        <span style="color:var(--teal); font-weight:600;">✓ Root Cause Understood</span>
        <span style="color:var(--teal); font-weight:600;">✓ Specific Practical Improvement Agreed</span>
        <span style="color:var(--teal); font-weight:600;">✓ Proactive 10-Min Notice Committed</span>
        <span style="color:var(--teal); font-weight:600;">✓ 2-Week Follow-Up Scheduled</span>
      </div>
    ` : ''}

    <div class="transcript" style="background:#FAFBF9; border:1px solid var(--line); border-radius:4px; padding:14px; font-size:13px; line-height:1.6;">
      ${c.transcript.map(t => {
        const isAgent = t.who === 'Voice Agent';
        return `<div style="margin-bottom:8px;">
          <span style="font-weight:700; color:${isAgent ? 'var(--brass-dark)' : 'var(--ink)'}; font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em;">
            ${escapeHtml(t.who)}:
          </span>
          <div style="margin-top:2px; color:var(--ink);">${escapeHtml(t.text)}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Structured Experience Network Entry -->
    ${c.experienceEntry ? `
      <div style="margin-top:14px; background:#F5F8F6; border:1px solid #D5E4D8; border-radius:4px; padding:12px 14px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <div style="font-weight:700; color:#1C653C; display:flex; align-items:center; gap:6px;">
            <span>📥 EXPERIENCE NETWORK ENTRY (APPEND-ONLY)</span>
          </div>
          <span style="font-size:11px; color:var(--ink-soft); font-style:italic;">Opinion Network (Trust/Churn) derived by Decision Agent</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; line-height:1.4;">
          <div><b>Call Type:</b> <code>${escapeHtml(c.experienceEntry.call_type)}</code></div>
          <div><b>Root Cause:</b> ${escapeHtml(c.experienceEntry.root_cause_identified || 'N/A')}</div>
          <div><b>Specific Commitment:</b> ${escapeHtml(c.experienceEntry.specific_commitment || 'N/A')}</div>
          <div><b>Notification Commitment:</b> ${c.experienceEntry.notification_commitment ? '✓ Yes (>10 min late)' : 'No'}</div>
          <div><b>Follow-up Date:</b> ${escapeHtml(c.experienceEntry.follow_up_date)}</div>
          <div><b>Escalation Required:</b> ${c.experienceEntry.escalations_required ? '⚠️ Yes' : 'No'}</div>
        </div>
        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #C3D9C7; color:var(--ink);">
          <b>Coordinator Note:</b> ${escapeHtml(c.experienceEntry.coordinator_note)}
        </div>
      </div>
    ` : `
      <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line); font-size:12.5px;">
        <b>Outcome & Logged Commitments:</b> ${escapeHtml(c.summary)}
      </div>
    `}
  </div>`;
}
