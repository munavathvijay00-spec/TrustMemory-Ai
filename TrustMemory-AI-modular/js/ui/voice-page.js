/* =========================================================================
   ui/voice-page.js — Outbound Voice Coaching Agent center (Vapi / Bland / Indian Agency Persona)
   Strict single manual phone number destination guard + 7-step coaching protocol
   ========================================================================= */

let showPromptDrawer = false;
let showProtocolDrawer = false;
let showCarrierGuide = false;

function toggleCarrierGuide(){
  showCarrierGuide = !showCarrierGuide;
  const el = document.getElementById('carrierGuideDrawer');
  const btn = document.getElementById('toggleCarrierBtn');
  if(el){
    el.style.display = showCarrierGuide ? 'block' : 'none';
  }
  if(btn){
    btn.innerText = showCarrierGuide ? '✕ Hide Setup Guide' : '⚙️ How to Make Phone Ring';
  }
}

function togglePromptDrawer(){
  showPromptDrawer = !showPromptDrawer;
  const el = document.getElementById('promptDrawer');
  const btn = document.getElementById('togglePromptBtn');
  if(el){
    el.style.display = showPromptDrawer ? 'block' : 'none';
  }
  if(btn){
    btn.innerText = showPromptDrawer ? '✕ Hide Agent Prompt Specification' : '📋 View Vapi / Bland System Prompt Specification';
  }
}

function toggleProtocolDrawer(){
  showProtocolDrawer = !showProtocolDrawer;
  const el = document.getElementById('protocolDrawer');
  const btn = document.getElementById('toggleProtocolBtn');
  if(el){
    el.style.display = showProtocolDrawer ? 'block' : 'none';
  }
  if(btn){
    btn.innerText = showProtocolDrawer ? '✕ Hide 7-Step Protocol' : '📖 View 7-Step Conversation Protocol';
  }
}

function copyVoicePrompt(){
  if(navigator && navigator.clipboard){
    navigator.clipboard.writeText(VOICE_AGENT_SYSTEM_PROMPT).then(() => {
      alert("Voice Agent System Prompt copied to clipboard!");
    });
  } else {
    alert("Voice Agent System Prompt ready in the specification box.");
  }
}

function testDialTestNumber(testNumberKey){
  alert(`🔒 CALL BLOCKED BY CALLING RULE:\n\nAttempted destination: ${testNumberKey}\n\nCalling Rule Enforced: The application provides ONE phone number manually entered by the user (the manual destination). ONLY this number is the live call destination.\n\nAll test records (${testNumberKey}) exist strictly for demonstration and UI testing and must NEVER be dialed.`);
}

function updateRosterLivePhone(val){
  const el = document.getElementById('rosterLivePhoneDisplay');
  if(el){
    el.innerText = val.trim() || 'Manual Phone Number';
  }
  window.CURRENT_MANUAL_PHONE = val.trim();
}

function pageVoice(){
  const defaultPhone = window.CURRENT_MANUAL_PHONE || '+91 8341745014';
  const defaultLateCount = 2;

  return `
    <div class="pagehead" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
      <div>
        <div class="eyebrow">Outbound Voice Agent — Indian Home-Care Coaching Persona</div>
        <h1>Coaching, check-ins and late arrival resolution</h1>
        <div class="lede">
          Conduct short, respectful check-ins about recent late arrivals, identify root causes, secure concrete commitments, and retain outcomes directly into Hindsight Core.
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn sm" id="toggleCarrierBtn" onclick="toggleCarrierGuide()" style="border-color:#D9822B; color:#9E520A; font-weight:600;">
          ${showCarrierGuide ? '✕ Hide Setup Guide' : '⚙️ How to Make Phone Ring'}
        </button>
        <button class="btn sm" id="toggleProtocolBtn" onclick="toggleProtocolDrawer()">
          ${showProtocolDrawer ? '✕ Hide 7-Step Protocol' : '📖 View 7-Step Conversation Protocol'}
        </button>
        <button class="btn sm brass" id="togglePromptBtn" onclick="togglePromptDrawer()">
          ${showPromptDrawer ? '✕ Hide Agent Prompt Specification' : '📋 View Vapi / Bland System Prompt Specification'}
        </button>
      </div>
    </div>

    <!-- Active Call Banner (When call in progress) -->
    ${window.ACTIVE_CALL ? `
      <div class="card" style="margin-bottom:16px; border-left:4px solid #1C653C; background:#F4F8F5; padding:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#1C653C; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
              <span>📞 OUTBOUND CALL IN PROGRESS (TELEPHONY ACTIVE)</span>
              <span style="font-size:11px; background:#D7EFE0; color:#12592D; padding:2px 8px; border-radius:3px; font-weight:700;">Provider: ${escapeHtml(window.ACTIVE_CALL.provider || 'Dograh')}</span>
            </div>
            <div style="font-size:12.5px; color:var(--ink); line-height:1.5;">
              Calling live destination: <code style="font-family:var(--font-mono); font-weight:700; background:#E5F0E9; padding:2px 6px; border-radius:3px;">${escapeHtml(window.ACTIVE_CALL.to || defaultPhone)}</code> for <b>${escapeHtml(window.ACTIVE_CALL.helper_name || 'Anita Verma')}</b>.
              <br/><span style="color:var(--ink-soft); font-size:11.5px;">Call ID: <code>${escapeHtml(window.ACTIVE_CALL.call_id)}</code> · Status: <b>${escapeHtml(window.ACTIVE_CALL.status || 'in-progress')}</b> · Polling every 5s...</span>
            </div>
          </div>
          <button class="btn sm primary" onclick="triggerManualWebhook('${window.ACTIVE_CALL.call_id}', '${window.ACTIVE_CALL.helper_id}', '${escapeHtml(window.ACTIVE_CALL.helper_name)}', '${window.ACTIVE_CALL.scenario}', ${window.ACTIVE_CALL.late_count})" style="background:#1C653C; border-color:#12592D; font-weight:700; padding:8px 16px;">
            ⚡ Finish Call & Trigger Webhook (Instant)
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Telephony Status / Notice Banner -->
    ${window.TELEPHONY_STATUS_MSG ? `
      <div class="card" style="margin-bottom:16px; border-left:4px solid var(--brass); background:#FFFDF8; padding:14px 18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="font-size:12.5px; color:var(--ink); line-height:1.4;">
            <b style="color:var(--brass-dark);">Telephony Gateway Status:</b> ${escapeHtml(window.TELEPHONY_STATUS_MSG)}
          </div>
          <button class="btn sm" onclick="triggerManualWebhook('demo_' + Date.now(), 'anita', 'Anita Verma', 'coaching_call', 2)" style="border-color:var(--brass); color:var(--brass-dark); font-weight:600;">
            ⚡ Trigger Demo Webhook & Memory Write
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Carrier Connectivity Notice -->
    <div class="card" style="margin-bottom:16px; border-left:4px solid #D9822B; background:#FFFBF4; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <div style="font-size:22px; line-height:1;">📱</div>
          <div>
            <div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:4px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span>TELEPHONY GATEWAY: DOGRAH OUTBOUND CALL ENGINE</span>
              <span style="font-size:11px; background:#D7EFE0; color:#12592D; padding:2px 8px; border-radius:3px; font-weight:700;">Backend Active on Port 3000</span>
            </div>
            <div style="font-size:12.5px; color:var(--ink-soft); line-height:1.5;">
              Real outbound telephony via <b>Dograh</b> (or Bland AI). Dials strictly to your manually entered destination (<code style="background:#ECE7DC; padding:2px 5px; border-radius:3px; font-family:var(--font-mono);">${escapeHtml(defaultPhone)}</code>).
            </div>
          </div>
        </div>
        <button class="btn sm" onclick="toggleCarrierGuide()" style="border-color:#D9822B; color:#9E520A; font-weight:600; white-space:nowrap;">
          Read 3-Step Setup Guide
        </button>
      </div>
    </div>

    <!-- Carrier Guide Drawer -->
    <div id="carrierGuideDrawer" class="card" style="display:${showCarrierGuide ? 'block' : 'none'}; margin-bottom:20px; border-left:4px solid #D9822B; background:#FAFBF9; padding:18px;">
      <div style="font-weight:700; font-size:13.5px; color:var(--ink); margin-bottom:6px;">
        How to make your mobile phone physically ring:
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:14px; line-height:1.5;">
        Just like email OTPs required your real Gmail App Password to send real emails, calling an actual physical phone number requires a Voice Telephony Gateway (PSTN bridge).
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; font-size:12px; line-height:1.5;">
        <div style="background:#fff; padding:12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:#9E520A;">Step 1: Sign up at Bland AI</b>
          <p style="margin:4px 0 0; color:var(--ink);">
            Create a free account on <a href="https://bland.ai" target="_blank" style="color:var(--teal); text-decoration:underline; font-weight:600;">https://bland.ai</a> (it natively dials Indian mobile numbers with natural voices).
          </p>
        </div>
        <div style="background:#fff; padding:12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:#9E520A;">Step 2: Copy your API Key</b>
          <p style="margin:4px 0 0; color:var(--ink);">
            In Bland AI, open Developer Settings and copy your <b>API Key</b> (starts with <code>org_...</code>).
          </p>
        </div>
        <div style="background:#fff; padding:12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:#9E520A;">Step 3: Paste in backend/.env</b>
          <p style="margin:4px 0 0; color:var(--ink);">
            In <code>backend/.env</code>, set: <br/><code style="font-family:var(--font-mono); background:#ECE7DC; padding:2px 4px; border-radius:3px;">BLAND_API_KEY="your_api_key_here"</code>
          </p>
        </div>
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin-top:12px; margin-bottom:0;">
        Once configured, clicking <b>"Place Call to Live Destination"</b> will physically ring your phone <b>${escapeHtml(defaultPhone)}</b> within 5 seconds!
      </p>
    </div>

    <!-- Calling Rule & Single Destination Safeguard Banner -->
    <div class="card" style="margin-bottom:20px; border-left:4px solid var(--brass); background:#FFFDF8; padding:16px;">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:22px; line-height:1;">🛡️</div>
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:4px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>STRICT CALLING SAFEGUARD ENFORCED</span>
            <span style="font-size:11px; background:#E5F0E9; color:#1C653C; padding:2px 8px; border-radius:3px; font-weight:600;">Single Live Destination Rule</span>
          </div>
          <div style="font-size:12.5px; color:var(--ink-soft); line-height:1.5;">
            The application provides <b>ONE live destination</b> manually entered by the user (<code style="background:#ECE7DC; padding:2px 5px; border-radius:3px; font-family:var(--font-mono);">${escapeHtml(defaultPhone)}</code>).
            All other helper records with test numbers (<code style="background:#ECE7DC; padding:2px 5px; border-radius:3px; font-family:var(--font-mono);">TEST_NUMBER_02</code>, etc.) exist solely for demonstration and UI testing and are <b>strictly blocked from dialing</b>. The system never auto-dials or iterates through helpers.
          </div>
        </div>
      </div>
    </div>

    <!-- 7-Step Protocol Drawer -->
    <div id="protocolDrawer" class="card" style="display:${showProtocolDrawer ? 'block' : 'none'}; margin-bottom:20px; border-left:4px solid var(--teal); background:#FAFBF9;">
      <div style="font-weight:700; font-size:13.5px; color:var(--ink); margin-bottom:8px;">
        7-Step Coaching Conversation Protocol
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; font-size:12px; line-height:1.5;">
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 1: Opening</b>
          <div style="margin-top:4px; color:var(--ink);">"Hi {{helper_name}}, this is a quick check-in from the agency. We noticed a couple of late arrivals recently — is everything alright?"</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 2: Listen & Acknowledge</b>
          <div style="margin-top:4px; color:var(--ink);">Calm, respectful validation: "I understand, that sounds difficult." / "Okay, thank you for explaining."</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 3: Handle Vague Explanations Gently</b>
          <div style="margin-top:4px; color:var(--ink);">"Can you help me understand what specifically caused the delay? Was it transportation or something at home?"</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 4: Identify Practical Solutions</b>
          <div style="margin-top:4px; color:var(--ink);">"What do you think would help make the timing easier going forward?" (e.g. taking 7:15 AM bus).</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 5: Secure Specific Commitment</b>
          <div style="margin-top:4px; color:var(--ink);">"Okay, so from tomorrow you'll take the earlier 7:15 AM bus. Is that something you can commit to?"</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 6: Proactive Delay Communication</b>
          <div style="margin-top:4px; color:var(--ink);">"If you expect that you'll be more than 10 minutes late, could you message the household directly as early as possible?"</div>
        </div>
        <div style="background:#fff; padding:10px 12px; border:1px solid var(--line); border-radius:4px;">
          <b style="color:var(--brass-dark);">Step 7: Follow-up & Retain into Hindsight</b>
          <div style="margin-top:4px; color:var(--ink);">"Thank you — I've logged that commitment. We'll check in again in two weeks." (Saved to Hindsight Core).</div>
        </div>
      </div>
    </div>

    <!-- System Prompt Specification Drawer -->
    <div id="promptDrawer" class="card" style="display:${showPromptDrawer ? 'block' : 'none'}; margin-bottom:24px; border-left:4px solid var(--brass); background:#FAFBF9;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-weight:700; font-size:13px; color:var(--ink);">
          Production Voice Agent Persona & Conversation Protocol
        </div>
        <button class="btn sm" onclick="copyVoicePrompt()">Copy Prompt</button>
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:12px;">
        Configure this system prompt directly into your Vapi or Bland AI assistant for outbound coaching.
      </p>
      <pre style="background:#1C2530; color:#EDE9DF; padding:16px; border-radius:4px; font-family:var(--font-mono); font-size:11.5px; line-height:1.5; white-space:pre-wrap; max-height:360px; overflow-y:auto;">${escapeHtml(VOICE_AGENT_SYSTEM_PROMPT)}</pre>
    </div>

    <!-- Call Control & Input Card -->
    <div class="card" style="margin-bottom:20px; padding:20px;">
      <div style="font-weight:700; font-size:14px; margin-bottom:14px; color:var(--ink); display:flex; justify-content:space-between; align-items:center;">
        <span>Outbound Call Configuration</span>
        <span style="font-size:11.5px; color:var(--ink-soft); font-weight:normal;">Live destination strictly constrained to input</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:16px;">
        <!-- Manual Phone Number Input -->
        <div>
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--brass-dark);">
            Manual Phone Number *
          </label>
          <input type="text" id="manualPhone" value="${escapeHtml(defaultPhone)}" oninput="updateRosterLivePhone(this.value)" placeholder="+91 98765 43210" style="width:100%; padding:9px 12px; font-size:13.5px; font-family:var(--font-mono); border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;" />
          <span style="display:block; font-size:11px; color:var(--ink-soft); margin-top:4px;">ONLY this live number will ever be called.</span>
        </div>

        <!-- Late Count Input -->
        <div>
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--ink-soft);">
            Recent Late Arrivals
          </label>
          <input type="number" id="vLateCount" value="${defaultLateCount}" min="1" max="10" style="width:100%; padding:9px 12px; font-size:13.5px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;" />
          <span style="display:block; font-size:11px; color:var(--ink-soft); margin-top:4px;">Past two weeks arrival variance count.</span>
        </div>

        <!-- Helper Selector -->
        <div>
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--ink-soft);">
            Target Helper
          </label>
          <select id="vHelper" style="width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;">
            <optgroup label="Live Destination (Dialable with manual phone)">
              <option value="anita" selected>Anita Verma (Live Destination)</option>
              ${S.helpers.filter(h => h.id !== 'anita').map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('')}
            </optgroup>
            <optgroup label="Demonstration Records (Blocked from dialing)">
              <option value="test_02">Test Helper 02 (TEST_NUMBER_02)</option>
              <option value="test_03">Test Helper 03 (TEST_NUMBER_03)</option>
              <option value="test_04">Test Helper 04 (TEST_NUMBER_04)</option>
              <option value="test_05">Test Helper 05 (TEST_NUMBER_05)</option>
            </optgroup>
          </select>
          <span style="display:block; font-size:11px; color:var(--ink-soft); margin-top:4px;">Test helpers trigger dialing block.</span>
        </div>

        <!-- Scenario Selector -->
        <div>
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--ink-soft);">
            Call Scenario
          </label>
          <select id="vScenarioType" onchange="handleCallTypeChange()" style="width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;">
            <option value="coaching_call" selected>Coaching Call (Late Arrivals Check-in)</option>
            <option value="household_checkin">Household Check-in (Placement Feedback)</option>
            <option value="escalation_call">Escalation Call (Follow-up on Commitments)</option>
          </select>
          <span style="display:block; font-size:11px; color:var(--ink-soft); margin-top:4px;">Select conversational scenario.</span>
        </div>

        <!-- Focus Context -->
        <div id="scenarioSelectWrap">
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:5px; color:var(--ink-soft);">
            Coaching Context Focus
          </label>
          <select id="vScenario" style="width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;">
            <option value="coaching_transport">Transit Delay (Route road work)</option>
            <option value="coaching_family">Morning Routine (Family / School Prep)</option>
          </select>
          <span style="display:block; font-size:11px; color:var(--ink-soft); margin-top:4px;">Appends structured event to Experience Network.</span>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-top:12px; border-top:1px solid var(--line);">
        <div style="font-size:12px; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">
          <span style="font-weight:700; color:#1C653C;">Epistemic Rule:</span> Voice Agent appends strictly to <b>Experience Network</b>. The Decision Agent derives Opinion scores (Trust & Churn Risk).
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_02')" style="border-color:#E29F96; color:#9E3224;">
            🔒 Test Safeguard (Attempt Test Number)
          </button>
          <button class="btn primary" id="callBtn" style="padding:10px 22px; font-weight:700; font-size:13.5px; background:var(--brass); border-color:var(--brass-dark); color:#fff;">
            📞 Place Call to Live Destination
          </button>
        </div>
      </div>
    </div>

    <!-- Demonstration Helper Roster Card -->
    <div class="card" style="margin-bottom:20px; padding:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div style="font-weight:700; font-size:13px; color:var(--ink);">
          Demonstration Helper Records & Destination Audit
        </div>
        <span style="font-size:11.5px; color:var(--ink-soft);">
          Only Helper 1 maps to live calling destination
        </span>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr style="border-bottom:2px solid var(--line); text-align:left; background:#FAFBF9;">
              <th style="padding:8px 10px; font-weight:700;">Record</th>
              <th style="padding:8px 10px; font-weight:700;">Helper Name</th>
              <th style="padding:8px 10px; font-weight:700;">Assigned Phone Destination</th>
              <th style="padding:8px 10px; font-weight:700;">Authorization Status</th>
              <th style="padding:8px 10px; font-weight:700; text-align:right;">Safeguard Action</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line); background:#F4F8F5;">
              <td style="padding:10px; font-weight:700; color:var(--brass-dark);">Helper 1</td>
              <td style="padding:10px; font-weight:600;">Anita Verma</td>
              <td style="padding:10px; font-family:var(--font-mono); font-weight:700; color:#1C653C;">
                <span id="rosterLivePhoneDisplay">${escapeHtml(defaultPhone)}</span>
              </td>
              <td style="padding:10px;">
                <span style="display:inline-block; font-size:11px; background:#D7EFE0; color:#12592D; padding:2px 8px; border-radius:3px; font-weight:700;">
                  🟢 LIVE CALL DESTINATION (DIALABLE)
                </span>
              </td>
              <td style="padding:10px; text-align:right;">
                <button class="btn sm primary" onclick="document.getElementById('callBtn').click()" style="padding:4px 10px; font-size:11px;">
                  Call Live Number
                </button>
              </td>
            </tr>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px; color:var(--ink-soft);">Helper 2</td>
              <td style="padding:10px;">Test Helper 02</td>
              <td style="padding:10px; font-family:var(--font-mono); color:var(--ink-soft);">TEST_NUMBER_02</td>
              <td style="padding:10px;">
                <span style="display:inline-block; font-size:11px; background:#F8EBEA; color:#9E3224; padding:2px 8px; border-radius:3px; font-weight:600;">
                  🔒 DEMONSTRATION ONLY (BLOCKED)
                </span>
              </td>
              <td style="padding:10px; text-align:right;">
                <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_02')" style="padding:4px 8px; font-size:11px;">
                  Test Dial
                </button>
              </td>
            </tr>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px; color:var(--ink-soft);">Helper 3</td>
              <td style="padding:10px;">Test Helper 03</td>
              <td style="padding:10px; font-family:var(--font-mono); color:var(--ink-soft);">TEST_NUMBER_03</td>
              <td style="padding:10px;">
                <span style="display:inline-block; font-size:11px; background:#F8EBEA; color:#9E3224; padding:2px 8px; border-radius:3px; font-weight:600;">
                  🔒 DEMONSTRATION ONLY (BLOCKED)
                </span>
              </td>
              <td style="padding:10px; text-align:right;">
                <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_03')" style="padding:4px 8px; font-size:11px;">
                  Test Dial
                </button>
              </td>
            </tr>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px; color:var(--ink-soft);">Helper 4</td>
              <td style="padding:10px;">Test Helper 04</td>
              <td style="padding:10px; font-family:var(--font-mono); color:var(--ink-soft);">TEST_NUMBER_04</td>
              <td style="padding:10px;">
                <span style="display:inline-block; font-size:11px; background:#F8EBEA; color:#9E3224; padding:2px 8px; border-radius:3px; font-weight:600;">
                  🔒 DEMONSTRATION ONLY (BLOCKED)
                </span>
              </td>
              <td style="padding:10px; text-align:right;">
                <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_04')" style="padding:4px 8px; font-size:11px;">
                  Test Dial
                </button>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; color:var(--ink-soft);">Helper 5</td>
              <td style="padding:10px;">Test Helper 05</td>
              <td style="padding:10px; font-family:var(--font-mono); color:var(--ink-soft);">TEST_NUMBER_05</td>
              <td style="padding:10px;">
                <span style="display:inline-block; font-size:11px; background:#F8EBEA; color:#9E3224; padding:2px 8px; border-radius:3px; font-weight:600;">
                  🔒 DEMONSTRATION ONLY (BLOCKED)
                </span>
              </td>
              <td style="padding:10px; text-align:right;">
                <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_05')" style="padding:4px 8px; font-size:11px;">
                  Test Dial
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Call History Section -->
    <div class="section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h2>Call history & Logged Commitments</h2>
        <span style="font-size:12px; color:var(--ink-soft);">${S.calls.length} call(s) logged</span>
      </div>
      ${S.calls.length
        ? S.calls.map(callCard).join('')
        : `<div class="card">${emptyState('No calls yet.', 'Configure the manual phone number above and click "Place Call to Live Destination" to conduct a warm coaching session.')}</div>`}
    </div>
  `;
}

function handleCallTypeChange(){
  const scenarioType = document.getElementById('vScenarioType')?.value;
  const wrap = document.getElementById('scenarioSelectWrap');
  if(wrap){
    wrap.style.display = (scenarioType === 'coaching_call') ? 'block' : 'none';
  }
}

function wireVoice(){
  const btn = document.getElementById('callBtn');
  if(btn){
    btn.onclick = () => {
      const helperId = document.getElementById('vHelper')?.value || 'anita';
      const manualPhone = document.getElementById('manualPhone')?.value || '+91 8341745014';
      const lateCount = document.getElementById('vLateCount')?.value || 2;
      const scenarioType = document.getElementById('vScenarioType')?.value || 'coaching_call';
      const scenarioFocus = document.getElementById('vScenario')?.value || 'coaching_transport';
      const placement = S.placements.find(p => p.helperId === helperId && p.status === 'active');

      startCall(
        scenarioType,
        helperId,
        placement ? placement.householdId : null,
        `${lateCount} recent late arrivals check-in`,
        null,
        scenarioFocus,
        manualPhone,
        lateCount
      );
    };
  }
}
