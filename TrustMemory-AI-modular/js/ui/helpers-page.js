/* =========================================================================
   ui/helpers-page.js — Helper roster + manual helper registration + detail
   ========================================================================= */

let showAddHelperForm = false;

function toggleAddHelperForm(force){
  showAddHelperForm = typeof force === 'boolean' ? force : !showAddHelperForm;
  const formCard = document.getElementById('addHelperCard');
  const btn = document.getElementById('toggleAddHelperBtn');
  if(formCard){
    formCard.style.display = showAddHelperForm ? 'block' : 'none';
  }
  if(btn){
    btn.innerText = showAddHelperForm ? '✕ Cancel' : '+ Add Helper';
  }
}

function pageHelpers(){
  recalcAll();
  const rows = S.helpers.map(h => {
    const sc = SCORES[h.id] || {trust: 68, churn: 18};
    const hist = SCORE_HISTORY[h.id] || [];
    const churnTrend = hist.map(item => item.churn || 0);

    return `<div class="rowitem" onclick="nav('helperDetail','${h.id}')">
      <div class="avatar" style="background:${h.color}">${initials(h.name)}</div>
      <div class="meta">
        <div class="name">${escapeHtml(h.name)}</div>
        <div class="sub">${escapeHtml(h.location)} · ${h.exp} yrs · ${h.skills.map(roleLabel).join(', ')}</div>
      </div>
      <div class="scores" style="align-items:center;">
        <div class="scorepill"><div class="v">${sc.trust}</div><div class="l">Trust</div></div>
        <div class="scorepill"><div class="v">${hist.length > 1 && hist[hist.length-2].churn !== sc.churn ? `<span style="font-size:10px; color:var(--ink-soft); font-weight:normal;">${hist[hist.length-2].churn}→</span>` : ''}${sc.churn}</div><div class="l">Churn</div></div>
        ${churnTrend.length > 1 ? `<div style="margin-left:6px;">${renderSparkline(churnTrend, 50, 20, sc.churn >= 55 ? 'var(--rust)' : 'var(--teal)')}</div>` : ''}
      </div>
      <span class="badge ${trustBadgeClass(sc.trust)}">${trustBand(sc.trust)}</span>
    </div>`;
  }).join('');

  return `
    <div class="pagehead" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
      <div>
        <div class="eyebrow">Helpers</div>
        <h1>Helper roster</h1>
        <div class="lede">Every profile carries a full memory timeline stored directly in Hindsight Core.</div>
      </div>
      <button class="btn brass" id="toggleAddHelperBtn" onclick="toggleAddHelperForm()">${showAddHelperForm ? '✕ Cancel' : '+ Add Helper'}</button>
    </div>

    <!-- Manual Helper Registration Card -->
    <div class="card" id="addHelperCard" style="display:${showAddHelperForm ? 'block' : 'none'}; margin-bottom:24px; border-left:4px solid var(--brass); background:#FAFBF9;">
      <h3 style="font-size:16px; margin-bottom:6px;">Manually Register New Helper</h3>
      <p style="color:var(--ink-soft); font-size:12.5px; margin-bottom:16px;">
        Profile facts and background notes will be retained into the <b>World Network</b> of Hindsight Core immediately upon registration.
      </p>

      <form id="newHelperForm" onsubmit="handleCreateHelper(event)">
        <div class="grid g2" style="margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Full Name *</label>
            <input type="text" id="nhName" placeholder="e.g. Ramesh Kumar" required style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">City / Locality *</label>
            <input type="text" id="nhLocation" placeholder="e.g. Banjara Hills, Hyderabad" required style="width:100%;">
          </div>
        </div>

        <div class="grid g2" style="margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Years of Experience</label>
            <input type="number" id="nhExp" min="0" max="40" value="4" style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Availability</label>
            <select id="nhAvailability" style="width:100%;">
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Live-in">Live-in</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:6px;">Skills & Specializations (Select all that apply) *</label>
          <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px;">
            <label><input type="checkbox" name="nhSkill" value="elder_care" checked> Elder Care</label>
            <label><input type="checkbox" name="nhSkill" value="child_care"> Child Care</label>
            <label><input type="checkbox" name="nhSkill" value="cleaning" checked> Cleaning</label>
            <label><input type="checkbox" name="nhSkill" value="cooking"> Cooking</label>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">
            Background Institutional Memory (Retained directly into Hindsight Core)
          </label>
          <textarea id="nhBackground" rows="3" placeholder="e.g. 4 years of elder care experience; specialized in post-surgery mobility support and patient medication schedule adherence; speaks Telugu and English." style="width:100%; font-family:inherit; font-size:12.5px; padding:8px 10px; border-radius:var(--radius); border:1px solid var(--line-strong);"></textarea>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button type="submit" class="btn brass">Save & Retain to Hindsight</button>
          <button type="button" class="btn sm" onclick="toggleAddHelperForm(false)">Cancel</button>
        </div>
      </form>
    </div>

    <div class="card"><div class="rowlist">${rows}</div></div>`;
}

function handleCreateHelper(event){
  event.preventDefault();
  const name = document.getElementById('nhName').value.trim();
  const location = document.getElementById('nhLocation').value.trim();
  const exp = parseInt(document.getElementById('nhExp').value, 10) || 0;
  const availability = document.getElementById('nhAvailability').value;
  const bg = document.getElementById('nhBackground').value.trim();

  const skillCheckboxes = document.querySelectorAll('input[name="nhSkill"]:checked');
  const skills = Array.from(skillCheckboxes).map(cb => cb.value);

  if(!name || !location){
    alert('Please enter a name and location.');
    return;
  }
  if(skills.length === 0){
    alert('Please select at least one skill.');
    return;
  }

  // Generate unique ID and avatar color
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) + '_' + uid().slice(0, 4);
  const colors = ['#8F6A2E', '#3F6659', '#5B4A8F', '#A6453A', '#31507A'];
  const color = colors[S.helpers.length % colors.length];

  // Set default role scores based on selected skills
  const roleScores = {
    elder_care: skills.includes('elder_care') ? 80 + Math.min(exp * 2, 15) : 45,
    child_care: skills.includes('child_care') ? 80 + Math.min(exp * 2, 15) : 45,
    cleaning: skills.includes('cleaning') ? 80 + Math.min(exp * 2, 15) : 50,
    cooking: skills.includes('cooking') ? 75 + Math.min(exp * 2, 15) : 40,
  };

  const newHelper = {
    id,
    name,
    location,
    exp,
    skills,
    availability,
    roleScores,
    color
  };

  S.helpers.unshift(newHelper);

  // 1. Retain into Hindsight Core: World Network
  retain(id, 'world', `${name} has ${exp} years of verified experience.`, {entityType: 'helper', source: 'manual_entry'});
  retain(id, 'world', `Skills & capabilities: ${skills.map(roleLabel).join(', ')}.`, {entityType: 'helper'});
  retain(id, 'world', `Based in ${location}. Availability: ${availability}.`, {entityType: 'helper'});

  if(bg){
    retain(id, 'world', bg, {entityType: 'helper', category: 'background_note'});
  }

  // 2. Retain initial profile Opinion
  const bestRole = Object.entries(roleScores).sort((a,b)=>b[1]-a[1])[0];
  retain(id, 'opinion', `Candidate profile established. Primary suitability assessed for ${roleLabel(bestRole[0])} (${bestRole[1]}/100).`, {roleScores});

  // 3. Initialize scores
  SCORES[id] = {
    trust: 68,
    churn: 18
  };
  SCORE_HISTORY[id] = [{
    t: nowStamp(),
    trust: 68,
    churn: 18,
    reason: 'Initial profile registration'
  }];

  // 4. Log to Agent Activity
  log('mem', 'MEMORY AGENT', `Manually registered ${name}. Retained 4 world facts into Hindsight Core.`);

  showAddHelperForm = false;
  nav('helperDetail', id);
}

function pageHelperDetail(id){
  recalcAll();
  const h = S.helpers.find(x => x.id === id);
  if(!h) return emptyState('Helper not found','');
  const sc = SCORES[h.id] || {trust: 68, churn: 18};
  const evs = helperEvents(id).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  const why = churnWhy(h.id, sc.churn);
  const hist = SCORE_HISTORY[h.id] || [];
  const churnTrend = hist.map(item => item.churn || 0);

  return `
  ${CURRENT_USER && CURRENT_USER.role === 'admin' ? '<button class="btn sm" style="margin-bottom:16px;" onclick="nav(\'helpers\')">← Helpers</button>' : ''}
  <div class="detail-head">
    <div class="avatar" style="background:${h.color}">${initials(h.name)}</div>
    <div>
      <h1>${escapeHtml(h.name)}</h1>
      <div class="tags">
        <span class="badge neutral">${escapeHtml(h.location)}</span>
        <span class="badge neutral">${h.exp} yrs experience</span>
        <span class="badge neutral">${h.availability}</span>
        ${h.skills.map(s => `<span class="badge neutral">${roleLabel(s)}</span>`).join('')}
      </div>
    </div>
  </div>
  <div class="grid g3" style="margin-bottom:24px;">
    <div class="metric">
      <div class="label">Trust signal</div>
      <div class="num ${sc.trust < 60 ? 'warn' : 'ok'}">${sc.trust}</div>
      <span class="badge ${trustBadgeClass(sc.trust)}" style="margin-top:8px;">${trustBand(sc.trust)}</span>
    </div>
    <div class="metric">
      <div class="label" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Churn risk</span>
        ${churnTrend.length > 1 ? renderSparkline(churnTrend, 60, 18, sc.churn >= 55 ? 'var(--rust)' : 'var(--teal)') : ''}
      </div>
      <div class="num ${sc.churn >= 55 ? 'warn' : 'ok'}" style="display:flex; align-items:baseline; gap:6px;">
        <span>${sc.churn}</span>
        ${hist.length > 1 && hist[hist.length-2].churn !== sc.churn ? `<span style="font-size:12px; font-weight:400; color:var(--ink-soft);">(${hist[hist.length-2].churn} → ${sc.churn})</span>` : ''}
      </div>
      <span class="badge ${churnBadgeClass(sc.churn)}" style="margin-top:8px;">${sc.churn >= 65 ? 'Critical' : sc.churn >= 40 ? 'Elevated' : 'Low'}</span>
    </div>
    <div class="metric">
      <div class="label">Role-specific fit</div>
      <div style="margin-top:8px; font-size:12px;">
        ${Object.entries(h.roleScores).map(([k,v]) => `<div class="kv"><span class="k">${roleLabel(k)}</span><span>${v}/100</span></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="grid g2">
    <div class="section" style="margin:0;">
      <h2>Memory timeline</h2>
      <div class="card"><div class="timeline">
        ${evs.map(e => `<div class="tl-item ${eventTone(e.type)}"><div class="date">${fmtDate(e.date)}</div><div class="txt">${escapeHtml(e.description)}</div><div class="tag">${e.type.replace('_',' ')}${e.severity ? ' · ' + e.severity : ''}</div></div>`).join('') || '<div style="color:var(--ink-soft); font-size:13px;">No events recorded yet. Simulate an event or add a memory note below.</div>'}
      </div></div>

      <div class="hr"></div>
      <h2>Add Note to Hindsight Memory</h2>
      <div class="card">
        <form id="addMemoryForm" onsubmit="handleAddHelperMemory(event, '${h.id}')">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="memLayer" style="flex:0 0 140px;">
              <option value="world">World Network</option>
              <option value="experience" selected>Experience</option>
              <option value="opinion">Opinion</option>
              <option value="observation">Observation</option>
            </select>
            <input type="text" id="memText" placeholder="e.g. Completed specialized dementia care refresher course." required style="flex:1;">
          </div>
          <button type="submit" class="btn sm brass">Retain to Hindsight</button>
        </form>
      </div>
    </div>

    <div class="section" style="margin:0;">
      <h2>Why this score?</h2>
      <div class="why">
        <h4>Why is churn risk ${sc.churn}?</h4>
        <ul>${why.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
        <div class="action">Recommended action: <b>${sc.churn >= 75 ? 'Escalate to coordinator.' : sc.churn >= 55 ? 'Schedule coaching call.' : 'Continue routine monitoring.'}</b></div>
      </div>
      <div class="hr"></div>
      <h2>Simulate an event</h2>
      <div class="card">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select id="evType">
            <option value="late_arrival">Late arrival</option>
            <option value="complaint">Complaint</option>
            <option value="positive_feedback">Positive feedback</option>
            <option value="placement_failure">Placement failure</option>
            <option value="successful_placement">Successful placement</option>
          </select>
          <button class="btn brass sm" id="simBtn">Simulate new event</button>
        </div>
        <div style="font-size:11.5px; color:var(--ink-soft); margin-top:8px;">Propagates through Memory → Decision → Reflection → Action.</div>
      </div>
      <div class="hr"></div>
      <h2>Actions</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn primary sm" id="coachBtn">Start coaching call</button>
        ${sc.churn >= 75 ? `<button class="btn sm" style="border-color:var(--rust); color:var(--rust);" id="escalateBtn">Escalate to coordinator</button>` : ''}
        <button class="btn sm" onclick="nav('memory','${h.id}')">View in Hindsight Core</button>
      </div>
    </div>
  </div>`;
}

function handleAddHelperMemory(event, helperId){
  event.preventDefault();
  const layer = document.getElementById('memLayer').value;
  const text = document.getElementById('memText').value.trim();
  if(!text) return;

  retain(helperId, layer, text, {source: 'manual_coordinator_entry'});
  document.getElementById('memText').value = '';
  renderCurrentPage();
}

function wireHelpers(){}

function wireHelperDetail(id){
  const btn = document.getElementById('simBtn');
  if(btn) btn.onclick = () => {
    const type = document.getElementById('evType').value;
    const placement = S.placements.find(p => p.helperId === id && p.status === 'active');
    triggerEvent(type, id, placement ? placement.householdId : null);
  };
  const coach = document.getElementById('coachBtn');
  if(coach) coach.onclick = () => {
    const placement = S.placements.find(p => p.helperId === id && p.status === 'active');
    startCall('coaching', id, placement ? placement.householdId : null, 'Manually initiated from profile.');
  };
  const esc = document.getElementById('escalateBtn');
  if(esc) esc.onclick = () => {
    const placement = S.placements.find(p => p.helperId === id && p.status === 'active');
    startCall('escalation', id, placement ? placement.householdId : null, 'Manually escalated from profile — critical churn risk.');
  };
}
