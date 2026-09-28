/* =========================================================================
   demo.js — 3 scripted end-to-end demo scenarios
   ========================================================================= */

const FLOW_STAGES = ['Event','Memory','Reasoning','Risk','Action','Outcome','Learning'];
let demoRunning = false;

function pageDemo(){
  return `<div class="pagehead"><div class="eyebrow">Demo Mode</div><h1>Remember → Understand → Predict → Act → Learn</h1><div class="lede">Three controlled, end-to-end stories. Each one runs the full agent chain and updates real state across the app.</div></div>
  <div class="grid g3" style="margin-bottom:28px;">
    <button class="scenario-btn" data-scn="1"><div class="snum">Scenario 1</div><h3>Save the placement</h3><div class="stag">Prevent churn before it happens</div></button>
    <button class="scenario-btn" data-scn="2"><div class="snum">Scenario 2</div><h3>Fair blame</h3><div class="stag">Maybe the household is the problem</div></button>
    <button class="scenario-btn" data-scn="3"><div class="snum">Scenario 3</div><h3>Learn the role</h3><div class="stag">Memory makes matching smarter</div></button>
  </div>
  <div class="flow" id="flowBar">${FLOW_STAGES.map(s => `<div class="fstep" data-stage="${s}">${s}</div>`).join('')}</div>
  <div id="demoBody">
    <div class="narration" id="narration"><div class="ln sys">Choose a scenario above to begin.</div></div>
  </div>`;
}

function wireDemo(){
  document.querySelectorAll('.scenario-btn').forEach(b => {
    b.onclick = () => {
      if(demoRunning) return;
      const n = b.dataset.scn;
      if(n === '1') runScenario1();
      if(n === '2') runScenario2();
      if(n === '3') runScenario3();
    };
  });
}

function setStage(stage){
  document.querySelectorAll('#flowBar .fstep').forEach(el => {
    const idx = FLOW_STAGES.indexOf(el.dataset.stage);
    const cur = FLOW_STAGES.indexOf(stage);
    el.classList.toggle('active', el.dataset.stage === stage);
    el.classList.toggle('done', idx < cur);
  });
}

function narrate(line, cls){
  const n = document.getElementById('narration');
  if(!n) return;
  const div = document.createElement('div');
  div.className = 'ln' + (cls ? (' ' + cls) : '');
  div.innerHTML = line;
  n.appendChild(div);
  n.scrollTop = n.scrollHeight;
}

function resetNarration(){
  const n = document.getElementById('narration');
  if(n) n.innerHTML = '';
}

function step(fn, delay){
  return new Promise(res => setTimeout(() => { fn(); res(); }, delay));
}

async function runScenario1(){
  demoRunning = true;
  resetNarration();
  const helperId = 'anita';
  const placement = S.placements.find(p => p.helperId === helperId && p.status === 'active');
  const householdId = placement.householdId;
  recalcAll();
  const before = SCORES[helperId].churn;

  setStage('Event');
  narrate(`<b>SCENARIO 1 — Save the Placement.</b> Starting state: ${labelFor(helperId)} — Trust ${SCORES[helperId].trust}, Churn risk ${before}.`, 'sys');
  await step(() => {}, 500);
  narrate(`<span class="agent-tag">EVENT</span> Late arrival reported.`);
  const r1 = triggerEvent('late_arrival', helperId, householdId);
  await step(() => {}, 700);

  setStage('Memory');
  narrate(`<span class="agent-tag">MEMORY AGENT</span> Retained event to ${labelFor(helperId)}'s experience memory.`);
  await step(() => {}, 600);
  narrate(`<span class="agent-tag">EVENT</span> Second late arrival, this time with a complaint.`);
  const r2 = triggerEvent('complaint', helperId, householdId);
  await step(() => {}, 700);

  setStage('Reasoning');
  narrate(`<span class="agent-tag">DECISION AGENT</span> Recalled full history and classified severity: MEDIUM.`);
  await step(() => {}, 600);

  setStage('Risk');
  narrate(`<span class="agent-tag">DECISION AGENT</span> Churn risk recalculated: ${before} → ${SCORES[helperId].churn}.`);
  await step(() => {}, 400);
  narrate(`<span class="agent-tag">DECISION AGENT</span> Score written into the Opinion Network — a derived belief, not a raw fact.`);
  await step(() => {}, 500);
  const why = churnWhy(helperId, SCORES[helperId].churn);
  narrate(`<span class="agent-tag">WHY?</span> ${why.join(' ')}`);
  await step(() => {}, 700);

  setStage('Action');
  narrate(`<span class="agent-tag">REFLECTION AGENT</span> Deteriorating attendance trend confirmed against history.`);
  await step(() => {}, 500);
  const isCritical = SCORES[helperId].churn >= 75;
  narrate(`<span class="agent-tag">VOICE AGENT</span> Recommended action: ${isCritical ? 'escalate to the coordinator.' : 'initiate coaching call.'}`);
  await step(() => {}, 800);
  narrate(`<span class="agent-tag">VOICE AGENT</span> Placing ${isCritical ? 'escalation' : 'coaching'} call — voice simulation mode.`);
  const call = startCall(isCritical ? 'escalation' : 'coaching', helperId, householdId, 'Triggered by churn-risk escalation (Demo Scenario 1).');
  await step(() => {}, 900);
  if(S.stagedBackups.find(b => b.householdId === householdId && b.status === 'staged')){
    const b = S.stagedBackups.find(x => x.householdId === householdId && x.status === 'staged');
    const backup = S.helpers.find(h => h.id === b.backupHelperId);
    narrate(`<span class="agent-tag">MATCHING AGENT</span> Read the Observation Network and pre-staged ${backup ? backup.name : 'a backup helper'} in case this placement needs replacement.`);
    await step(() => {}, 700);
  }

  setStage('Outcome');
  narrate(`<span class="agent-tag">OUTCOME</span> ${call.summary}`);
  await step(() => {}, 600);

  setStage('Learning');
  narrate(`<span class="agent-tag">MEMORY AGENT</span> Call outcome and coaching commitments retained into Experience Network.`);
  narrate(`<b>Future decisions</b> — the next event for ${labelFor(helperId)} will be evaluated against this updated history, including the coaching commitment.`, 'sys');
  narrate(`<a href="#" onclick="nav('helperDetail','${helperId}'); return false;" style="color:#fff; text-decoration:underline;">Open ${labelFor(helperId)}'s profile to see the full timeline →</a>`, 'sys');
  demoRunning = false;
}

async function runScenario2(){
  demoRunning = true;
  resetNarration();
  const householdId = 'h104';
  setStage('Event');
  narrate(`<b>SCENARIO 2 — Fair Blame.</b> Household: ${labelFor(householdId)}. Three placements on record, three different helpers, three replacements.`, 'sys');
  await step(() => {}, 600);

  setStage('Memory');
  narrate(`<span class="agent-tag">MEMORY AGENT</span> Recalling placement history across Sunita Devi, Kavita Reddy and Fatima Sheikh.`);
  await step(() => {}, 700);

  setStage('Reasoning');
  narrate(`<span class="agent-tag">REFLECTION AGENT</span> Comparing complaint themes across all three placements.`);
  const refl = reflectOnHousehold(householdId);
  await step(() => {}, 700);
  narrate(`<span class="agent-tag">PATTERN DETECTED</span> ${refl.insight}`);
  await step(() => {}, 700);

  setStage('Risk');
  narrate(`<span class="agent-tag">DECISION AGENT</span> Household Difficulty Score: ${SCORES[householdId].difficulty}/100.`);
  await step(() => {}, 600);

  setStage('Action');
  narrate(`<span class="agent-tag">SYSTEM</span> The system evaluates both sides of the placement relationship.`);
  document.getElementById('demoBody').insertAdjacentHTML('beforeend', compareBlock());
  await step(() => {}, 700);

  setStage('Outcome');
  narrate(`<span class="agent-tag">OUTCOME</span> Household flagged for coordinator review — evidence-based, not accusatory.`);
  await step(() => {}, 600);

  setStage('Learning');
  narrate(`<span class="agent-tag">MEMORY AGENT</span> Observation stored to ${labelFor(householdId)}'s memory for future matching decisions.`);
  narrate(`<a href="#" onclick="nav('householdDetail','${householdId}'); return false;" style="color:#fff; text-decoration:underline;">Open ${labelFor(householdId)}'s profile →</a>`, 'sys');
  demoRunning = false;
}

function compareBlock(){
  return `<div class="compare">
    <div class="box old"><h4>Previous approach</h4><p style="font-size:13px;">"Replace the helper."</p></div>
    <div class="box new"><h4>TrustMemory approach</h4><p style="font-size:13px;">"Investigate the relationship pattern — three different helpers reported the same schedule friction."</p></div>
  </div>`;
}

async function runScenario3(){
  demoRunning = true;
  resetNarration();
  const helperId = 'priya';
  const householdId = 'h106';
  setStage('Event');
  narrate(`<b>SCENARIO 3 — Memory Makes Matching Smarter.</b> New requirement at ${labelFor(householdId)}: elder care.`, 'sys');
  await step(() => {}, 600);

  setStage('Memory');
  narrate(`<span class="agent-tag">MATCHING AGENT</span> Interaction 1 — generic ranking, ignoring role-specific history.`);
  const naive = findMatches('elder_care', householdId, {naive:true});
  await step(() => {}, 700);
  narrate(`<span class="agent-tag">RESULT</span> Top candidate (generic): ${naive[0].helper.name}, ${labelForShort(helperId)} ranked #${naive.findIndex(r => r.helper.id === helperId) + 1}.`);
  await step(() => {}, 800);

  setStage('Reasoning');
  narrate(`<span class="agent-tag">REFLECTION AGENT</span> Comparing ${labelFor(helperId)}'s outcomes by role.`);
  const refl = reflectOnRoleFit(helperId);
  await step(() => {}, 600);
  narrate(`<span class="agent-tag">OBSERVATION</span> ${refl.insight}`);
  await step(() => {}, 700);

  setStage('Risk');
  narrate(`<span class="agent-tag">MATCHING AGENT</span> Interaction 20 — re-ranking with role-specific memory.`);
  const smart = findMatches('elder_care', householdId, {naive:false});
  matchingState = {role:'elder_care', householdId, results:smart, naive:false};
  await step(() => {}, 700);

  setStage('Action');
  narrate(`<span class="agent-tag">RESULT</span> ${smart[0].helper.name} rises to top match, score ${smart[0].score}/100.`);
  await step(() => {}, 700);

  setStage('Outcome');
  narrate(`<span class="agent-tag">WHY?</span> Recommended because historical memory shows strong elder-care outcomes, low churn risk, and consistent positive feedback.`);
  await step(() => {}, 600);

  setStage('Learning');
  narrate(`<span class="agent-tag">MEMORY AGENT</span> Role-fit observation stored — future elder-care requirements will use this evidence automatically.`);
  narrate(`<a href="#" onclick="nav('matching'); return false;" style="color:#fff; text-decoration:underline;">Open Matching to see the full recommendation →</a>`, 'sys');
  demoRunning = false;
}
