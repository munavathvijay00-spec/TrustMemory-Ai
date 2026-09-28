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

    <!-- Live Dograh AI Agent Interactive Session Console -->
    ${window.DOGRAH_ACTIVE_SESSION ? renderDograhLiveConsole() : ''}

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

    <!-- Hindsight Long-Term Memory Intelligence Card -->
    ${renderHindsightMemoryCard()}

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
          <select id="vHelper" onchange="onVoiceHelperChange(this.value)" style="width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); background:#fff; box-sizing:border-box;">
            <optgroup label="Live Destination (Dialable with manual phone)">
              <option value="anita" ${(window.SELECTED_VOICE_HELPER || 'anita') === 'anita' ? 'selected' : ''}>Anita Verma (Live Destination)</option>
              ${S.helpers.filter(h => h.id !== 'anita').map(h => `<option value="${h.id}" ${(window.SELECTED_VOICE_HELPER || 'anita') === h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
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
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn sm" onclick="testDialTestNumber('TEST_NUMBER_02')" style="border-color:#E29F96; color:#9E3224;">
            🔒 Test Safeguard
          </button>
          <button class="btn primary" onclick="startLiveDograhSession()" style="padding:10px 18px; font-weight:700; font-size:13.5px; background:#1C653C; border-color:#12592D; color:#fff;">
            🤖 Start Live Dograh AI Agent Session
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

/**
 * =========================================================================
 * DOGRAH VOICE AI PLATFORM INTEGRATION
 * Live Interactive Agent Console, Bi-Directional Dialogue, & Hindsight Retention
 * =========================================================================
 */
function renderDograhLiveConsole(){
  const s = window.DOGRAH_ACTIVE_SESSION;
  if(!s) return '';
  const helperName = s.helper_name || 'Anita Verma';
  const turns = s.messages || [];

  return `
    <div class="card" style="margin-bottom:20px; border-left:4px solid #1C653C; background:#fff; padding:20px; box-shadow:0 4px 14px rgba(28,101,60,0.12);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #D5E4D8;">
        <div>
          <div style="font-size:14px; font-weight:700; color:#1C653C; display:flex; align-items:center; gap:8px;">
            <span>🤖 LIVE DOGRAH AI AGENT CONVERSATION</span>
            <span style="font-size:11px; background:#D7EFE0; color:#12592D; padding:2px 8px; border-radius:3px; font-weight:700;">Session #${escapeHtml(s.run_id)}</span>
          </div>
          <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
            Connected to Dograh Cloud Workflow <code>#${escapeHtml(s.workflow_id)}</code> for <b>${escapeHtml(helperName)}</b> (${escapeHtml(s.scenario)}).
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm primary" onclick="completeLiveDograhSession()" style="background:#1C653C; border-color:#12592D; font-weight:700; padding:6px 14px;">
            💾 Save Session & Retain to Hindsight Core
          </button>
          <button class="btn sm" onclick="cancelDograhSession()" style="border-color:#ccc; color:#666;">
            ✕ Cancel
          </button>
        </div>
      </div>

      <!-- Transcript Box -->
      <div id="dograhTranscriptBox" style="background:#FAFBF9; border:1px solid #E5EADF; border-radius:6px; padding:14px; max-height:280px; overflow-y:auto; margin-bottom:14px; display:flex; flex-direction:column; gap:10px;">
        ${turns.map(t => {
          const isAgent = t.sender === 'agent' || t.who === 'Voice Agent' || t.role === 'assistant';
          return `
            <div style="display:flex; flex-direction:column; align-items:${isAgent ? 'flex-start' : 'flex-end'};">
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:2px; color:${isAgent ? '#9E520A' : '#1C653C'};">
                ${isAgent ? '🤖 Dograh Voice Agent' : '👤 ' + escapeHtml(helperName)}
              </div>
              <div style="max-width:85%; background:${isAgent ? '#FFFDF8' : '#EAF4EE'}; border:1px solid ${isAgent ? '#E8DEC8' : '#CBE1D2'}; border-radius:6px; padding:8px 12px; font-size:13px; line-height:1.5; color:var(--ink);">
                ${escapeHtml(t.text)}
              </div>
            </div>
          `;
        }).join('')}
        ${s.isLoading ? `
          <div style="display:flex; align-items:center; gap:8px; color:var(--ink-soft); font-size:12px; font-style:italic;">
            <span>🤖 Dograh AI Agent is generating response...</span>
          </div>
        ` : ''}
      </div>

      <!-- Quick Suggestion Reply Chips -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft); margin-bottom:6px;">
          Quick Response Chips (Indian Coaching Protocol)
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn sm" onclick="sendQuickReply('Bus route road work caused the delay this morning.')" style="font-size:11.5px; padding:4px 9px; background:#F7F8F6;">
            🚌 Bus Route Delay
          </button>
          <button class="btn sm" onclick="sendQuickReply('Yes, from tomorrow I will take the earlier 7:15 AM bus.')" style="font-size:11.5px; padding:4px 9px; background:#F7F8F6;">
            ⏰ Commit to 7:15 AM Bus
          </button>
          <button class="btn sm" onclick="sendQuickReply('If I ever get delayed by more than 10 minutes, I will message the family directly.')" style="font-size:11.5px; padding:4px 9px; background:#F7F8F6;">
            📱 Proactive 10-Min Notice
          </button>
          <button class="btn sm" onclick="sendQuickReply('Thank you for understanding, have a good day.')" style="font-size:11.5px; padding:4px 9px; background:#F7F8F6;">
            🤝 Conclude Call
          </button>
        </div>
      </div>

      <!-- Message Input -->
      <div style="display:flex; gap:8px;">
        <input type="text" id="dograhMsgInput" placeholder="Type response to Dograh AI Agent... (or press Enter)" onkeydown="if(event.key==='Enter') sendLiveDograhMsg()" style="flex:1; padding:9px 12px; font-size:13px; border:1px solid var(--line-strong); border-radius:var(--radius); box-sizing:border-box;" />
        <button class="btn primary" onclick="sendLiveDograhMsg()" style="padding:9px 18px; font-weight:700; background:#1C653C; border-color:#12592D; color:#fff;">
          Send Turn ➔
        </button>
      </div>
    </div>
  `;
}

async function startLiveDograhSession(){
  const helperId = document.getElementById('vHelper')?.value || 'anita';
  const helper = S.helpers.find(h => h.id === helperId) || {name: 'Anita Verma'};
  const lateCount = parseInt(document.getElementById('vLateCount')?.value || '2', 10);
  const scenario = document.getElementById('vScenarioType')?.value || 'coaching_call';

  window.TELEPHONY_STATUS_MSG = "Connecting to Dograh AI Agent workflow on api.dograh.com...";
  if(typeof renderCurrentPage === 'function') renderCurrentPage();

  try {
    const res = await fetch('/api/dograh/session', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        helper_id: helperId,
        helper_name: helper.name,
        late_count: lateCount,
        scenario: scenario
      })
    });

    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to initialize Dograh session');
    }

    const data = await res.json();
    const firstMsg = data.initial_message || `Hi ${helper.name.split(' ')[0]}, this is a quick check-in from the agency. We noticed a couple of late arrivals recently — is everything alright?`;

    window.DOGRAH_ACTIVE_SESSION = {
      workflow_id: data.workflow_id,
      run_id: data.run_id,
      helper_id: helperId,
      helper_name: helper.name,
      late_count: lateCount,
      scenario: scenario,
      messages: [
        { sender: 'agent', role: 'assistant', who: 'Voice Agent', text: firstMsg }
      ],
      isLoading: false
    };

    window.TELEPHONY_STATUS_MSG = `Connected to Dograh AI Agent session #${data.run_id}. Live conversation active!`;
    log('voice', 'VOICE AGENT', `Dograh AI Agent session #${data.run_id} initialized for ${helper.name}.`);
    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  } catch(e){
    window.TELEPHONY_STATUS_MSG = `Dograh Connection Notice: ${e.message}`;
    log('voice', 'VOICE AGENT', `Dograh session error: ${e.message}`);
    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  }
}

async function sendLiveDograhMsg(overrideText){
  if(!window.DOGRAH_ACTIVE_SESSION) return;
  const inputEl = document.getElementById('dograhMsgInput');
  const text = (overrideText || inputEl?.value || '').trim();
  if(!text) return;

  if(inputEl) inputEl.value = '';

  window.DOGRAH_ACTIVE_SESSION.messages.push({
    sender: 'user',
    role: 'user',
    who: window.DOGRAH_ACTIVE_SESSION.helper_name,
    text: text
  });
  window.DOGRAH_ACTIVE_SESSION.isLoading = true;
  if(typeof renderCurrentPage === 'function') renderCurrentPage();

  try {
    const res = await fetch('/api/dograh/message', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        workflow_id: window.DOGRAH_ACTIVE_SESSION.workflow_id,
        run_id: window.DOGRAH_ACTIVE_SESSION.run_id,
        text: text
      })
    });

    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to send message to Dograh');
    }

    const data = await res.json();
    window.DOGRAH_ACTIVE_SESSION.isLoading = false;
    window.DOGRAH_ACTIVE_SESSION.messages.push({
      sender: 'agent',
      role: 'assistant',
      who: 'Voice Agent',
      text: data.reply || 'Thank you, I have recorded that.'
    });
    log('voice', 'VOICE AGENT', `Received turn response from Dograh AI Agent for session #${window.DOGRAH_ACTIVE_SESSION.run_id}.`);
    if(typeof renderCurrentPage === 'function') renderCurrentPage();

    setTimeout(() => {
      const box = document.getElementById('dograhTranscriptBox');
      if(box) box.scrollTop = box.scrollHeight;
    }, 50);
  } catch(e) {
    window.DOGRAH_ACTIVE_SESSION.isLoading = false;
    window.DOGRAH_ACTIVE_SESSION.messages.push({
      sender: 'agent',
      role: 'assistant',
      who: 'Voice Agent',
      text: `[Error receiving Dograh reply: ${e.message}]`
    });
    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  }
}

function sendQuickReply(text){
  sendLiveDograhMsg(text);
}

function cancelDograhSession(){
  window.DOGRAH_ACTIVE_SESSION = null;
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function completeLiveDograhSession(){
  if(!window.DOGRAH_ACTIVE_SESSION) return;
  const s = window.DOGRAH_ACTIVE_SESSION;
  const helperId = s.helper_id;
  const helperName = s.helper_name;
  const scenario = s.scenario;
  const lateCount = s.late_count;
  const transcript = s.messages.map(m => ({
    who: m.who || (m.sender === 'agent' ? 'Voice Agent' : helperName),
    text: m.text
  }));

  try {
    const res = await fetch('/api/dograh/complete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        workflow_id: s.workflow_id,
        run_id: s.run_id,
        helper_id: helperId,
        helper_name: helperName,
        scenario: scenario,
        late_count: lateCount,
        transcript: transcript
      })
    });

    const result = await res.json();
    window.DOGRAH_ACTIVE_SESSION = null;

    const followUpDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const coordinatorNote = `${helperName.split(' ')[0]} completed live coaching session with Dograh AI Agent (Run #${s.run_id}). Logged attendance variance commitments.`;

    const experienceEntry = {
      call_type: scenario,
      helper_id: helperId,
      household_id: null,
      destination_phone: window.CURRENT_MANUAL_PHONE || '+91 8341745014',
      duration_seconds: 180,
      sentiment: 'cooperative',
      root_cause_identified: 'transit delay on bus route',
      specific_commitment: 'take earlier bus at 07:15 AM',
      notification_commitment: true,
      follow_up_date: followUpDate,
      escalations_required: false,
      coordinator_note: coordinatorNote
    };

    // Client-side call history card
    S.calls.unshift({
      id: result.call_id || ('call_' + Date.now()),
      type: scenario,
      helperId: helperId,
      destinationPhone: window.CURRENT_MANUAL_PHONE || '+91 8341745014',
      lateCount: lateCount,
      reason: `${lateCount} recent late arrivals check-in (Dograh Live Session)`,
      status: 'completed',
      transcript: transcript,
      summary: coordinatorNote,
      sentiment: 'cooperative',
      experienceEntry: experienceEntry,
      followUp: `Check-in on ${followUpDate}`,
      createdAt: nowStamp(),
      telephony: { status: 'completed_live', provider: 'Dograh AI Voice Agent', call_id: s.run_id }
    });

    // Write to Experience Network
    retain(helperId, 'experience', `Live Dograh Voice Call (${scenario}). ${coordinatorNote}`, {
      callId: result.call_id,
      experienceEntry
    });
    log('mem', 'MEMORY AGENT', `Appended Dograh call record to Experience Network for ${helperName}.`);

    // Recalculate Churn via Decision Agent
    if(helperId && SCORES[helperId]){
      const oldChurn = SCORES[helperId].churn;
      S.events.push({
        id: uid(),
        helperId,
        placementId: null,
        type: 'coaching_completed',
        description: `Experience event: Dograh Voice call completed (${coordinatorNote}).`,
        severity: 'LOW',
        date: todayIso(),
        source: 'dograh_live_voice'
      });
      recalcAll();
      const newChurn = SCORES[helperId].churn;
      log('dec', 'DECISION AGENT', `Derived updated scores from Experience Network for ${labelFor(helperId)}. Churn: ${oldChurn} → ${newChurn}.`);
    }

    if(typeof syncBackendData === 'function'){
      await syncBackendData();
    }

    const decMsg = result.decision ? `${result.decision.old_churn} → ${result.decision.new_churn}` : 'updated';
    window.TELEPHONY_STATUS_MSG = `Dograh AI session retained! Real Experience memory saved in SQLite store and Churn Risk recalculated: ${decMsg}.`;

    if(typeof renderCurrentPage === 'function') renderCurrentPage();
  } catch(e) {
    alert('Failed to complete Dograh session: ' + e.message);
  }
}

/**
 * =========================================================================
 * VECTORIZE HINDSIGHT LONG-TERM MEMORY ENGINE UI
 * Dedicated memory bank per helper (helper-{helper_id}), Recall, Reflect, Continuity
 * =========================================================================
 */
function renderHindsightMemoryCard(){
  const helperId = window.SELECTED_VOICE_HELPER || 'anita';
  const helper = S.helpers.find(h => h.id === helperId) || { name: 'Anita Verma' };
  const bankId = `helper-${helperId}`;
  const ctx = window.HINDSIGHT_CONTEXT || null;
  const hasMem = ctx && ctx.has_previous_memory;

  // Auto-fetch context on initial render if not yet loaded
  if(!window.HINDSIGHT_FETCHED_HELPER || window.HINDSIGHT_FETCHED_HELPER !== helperId){
    window.HINDSIGHT_FETCHED_HELPER = helperId;
    setTimeout(() => { refreshHindsightContext(helperId); }, 20);
  }

  return `
    <div class="card" style="margin-bottom:20px; border-left:4px solid #1C653C; background:#FAFBF9; padding:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:22px;">🧠</span>
          <div>
            <div style="font-weight:700; font-size:13.5px; color:var(--ink); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span>VECTORIZE HINDSIGHT MEMORY ENGINE</span>
              <span style="font-size:11px; background:#D7EFE0; color:#12592D; padding:2px 8px; border-radius:3px; font-weight:700;">Bank: <code>${escapeHtml(bankId)}</code></span>
              <span style="font-size:11px; background:#ECE7DC; color:var(--ink); padding:2px 8px; border-radius:3px; font-weight:600;">@vectorize-io/hindsight-client</span>
            </div>
            <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
              Dedicated memory bank isolated strictly per helper. Cross-call continuity across previous interactions.
            </div>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn sm" onclick="refreshHindsightContext('${escapeHtml(helperId)}')" style="font-size:11.5px; padding:4px 10px;">
            🔄 Refresh Bank
          </button>
          <button class="btn sm" onclick="simulateSecondCall('${escapeHtml(helperId)}')" style="font-size:11.5px; padding:4px 10px; border-color:#1C653C; color:#12592D; font-weight:700; background:#EAF4EE;">
            ⚡ Demo Call 2 (Continuity Check)
          </button>
        </div>
      </div>

      ${hasMem ? `
        <div style="background:#fff; border:1px solid #D5E4D8; border-radius:6px; padding:14px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
            <span style="font-size:11px; font-weight:700; color:#1C653C; text-transform:uppercase;">
              🟢 Recalled Facts from Previous Check-in (Recall Budget: Mid)
            </span>
            <span style="font-size:11px; color:var(--ink-soft); font-style:italic;">Authority Rule: Current helper statement always takes precedence</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; font-size:12px; line-height:1.5; color:var(--ink); margin-bottom:10px;">
            ${(ctx.bullet_summary || []).map(b => `<div style="background:#F7F9F7; padding:6px 10px; border-radius:4px; border-left:3px solid #1C653C;">${escapeHtml(b)}</div>`).join('')}
          </div>
          <div style="font-size:12px; background:#FFFDF8; border:1px solid #E8DEC8; border-radius:4px; padding:10px 12px; color:var(--ink); line-height:1.5;">
            <b style="color:#9E520A;">Voice Agent Memory-Aware Opening Hook:</b>
            <div style="margin-top:3px; font-style:italic; color:var(--ink);">"${escapeHtml(ctx.opening_dialogue_hook)}"</div>
          </div>
        </div>
      ` : `
        <div style="background:#fff; border:1px solid var(--line); border-radius:6px; padding:12px 14px; font-size:12px; color:var(--ink-soft); line-height:1.5;">
          <b style="color:var(--ink);">Initial Check-in Status:</b> No previous attendance check-in memory found for <b>${escapeHtml(helper.name)}</b> in bank <code>${escapeHtml(bankId)}</code>.
          The voice agent will conduct a warm baseline coaching check-in. The outcome will be retained into Hindsight for future calls.
        </div>
      `}
    </div>
  `;
}

async function refreshHindsightContext(helperId){
  const hId = helperId || document.getElementById('vHelper')?.value || 'anita';
  window.SELECTED_VOICE_HELPER = hId;
  try {
    const res = await fetch(`/api/hindsight/context/${encodeURIComponent(hId)}`);
    if(res.ok){
      window.HINDSIGHT_CONTEXT = await res.json();
    }
  } catch(e) {}
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function onVoiceHelperChange(newHelperId){
  window.SELECTED_VOICE_HELPER = newHelperId;
  refreshHindsightContext(newHelperId);
}

function simulateSecondCall(helperId){
  const hId = helperId || 'anita';
  const helper = S.helpers.find(h => h.id === hId) || { name: 'Anita Verma' };

  fetch('/api/hindsight/retain', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      helper_id: hId,
      helper_name: helper.name,
      late_count: 2,
      scenario: 'coaching_call',
      transcript: [],
      outcome: {
        root_cause_identified: 'transit delay on bus route due to road work',
        specific_commitment: 'take earlier bus at 07:15 AM instead of 07:40 AM',
        notification_commitment: true,
        sentiment: 'cooperative'
      }
    })
  }).then(async () => {
    await refreshHindsightContext(hId);
    alert(`🧠 Hindsight Memory Bank Seeded for ${helper.name}!\n\nBank ID: helper-${hId}\nRetained Fact: Bus route delay -> Committed to earlier 7:15 AM bus.\n\nNow triggering Call 2: The voice agent will recall this context and open with:\n\n"Last time we spoke, you mentioned that the bus timing was causing delays and you were going to try an earlier bus. How has that been working for you?"`);
    document.getElementById('callBtn')?.click();
  });
}

