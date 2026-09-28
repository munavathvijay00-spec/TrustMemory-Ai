/* =========================================================================
   ui/households-page.js — Household roster + manual residence registration + detail
   ========================================================================= */

let showAddHouseholdForm = false;

function toggleAddHouseholdForm(force){
  showAddHouseholdForm = typeof force === 'boolean' ? force : !showAddHouseholdForm;
  const formCard = document.getElementById('addHouseholdCard');
  const btn = document.getElementById('toggleAddHouseholdBtn');
  if(formCard){
    formCard.style.display = showAddHouseholdForm ? 'block' : 'none';
  }
  if(btn){
    btn.innerText = showAddHouseholdForm ? '✕ Cancel' : '+ Add Residence';
  }
}

function pageHouseholds(){
  recalcAll();
  const rows = S.households.map(h => {
    const sc = SCORES[h.id] || {difficulty: 20};
    const placementCount = S.placements.filter(p => p.householdId === h.id).length;
    return `<div class="rowitem" onclick="nav('householdDetail','${h.id}')">
      <div class="avatar" style="background:#31507A">${initials(h.name)}</div>
      <div class="meta">
        <div class="name">${escapeHtml(h.name)}</div>
        <div class="sub">${escapeHtml(h.location)} · needs ${roleLabel(h.requirement)} · ${placementCount} placement(s) on record</div>
      </div>
      <div class="scores"><div class="scorepill"><div class="v">${sc.difficulty}</div><div class="l">Difficulty</div></div></div>
      <span class="badge ${diffBadgeClass(sc.difficulty)}">${sc.difficulty >= 65 ? 'High difficulty' : sc.difficulty >= 40 ? 'Watch' : 'Stable'}</span>
    </div>`;
  }).join('');

  return `
    <div class="pagehead" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
      <div>
        <div class="eyebrow">Households & Residences</div>
        <h1>Household roster</h1>
        <div class="lede">The system evaluates both sides of every placement relationship using Hindsight institutional memory.</div>
      </div>
      <button class="btn brass" id="toggleAddHouseholdBtn" onclick="toggleAddHouseholdForm()">${showAddHouseholdForm ? '✕ Cancel' : '+ Add Residence'}</button>
    </div>

    <!-- Manual Residence Registration Card -->
    <div class="card" id="addHouseholdCard" style="display:${showAddHouseholdForm ? 'block' : 'none'}; margin-bottom:24px; border-left:4px solid var(--brass); background:#FAFBF9;">
      <h3 style="font-size:16px; margin-bottom:6px;">Manually Register New Residence / Household</h3>
      <p style="color:var(--ink-soft); font-size:12.5px; margin-bottom:16px;">
        Requirements, schedule constraints, and special household preferences will be retained into the <b>World Network</b> of Hindsight Core.
      </p>

      <form id="newHouseholdForm" onsubmit="handleCreateHousehold(event)">
        <div class="grid g2" style="margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Residence / Family Name *</label>
            <input type="text" id="nhhName" placeholder="e.g. Kapoor Residence" required style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">City / Locality *</label>
            <input type="text" id="nhhLocation" placeholder="e.g. Kondapur, Hyderabad" required style="width:100%;">
          </div>
        </div>

        <div class="grid g2" style="margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Primary Role Requirement</label>
            <select id="nhhRequirement" style="width:100%;">
              <option value="elder_care">Elder Care</option>
              <option value="child_care">Child Care</option>
              <option value="cleaning">Cleaning</option>
              <option value="cooking">Cooking</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">Schedule Expectations *</label>
            <input type="text" id="nhhSchedule" placeholder="e.g. Weekday mornings 8am–1pm" required style="width:100%;">
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px;">
            Special Household Requirements & Preferences (Retained to Hindsight World Memory)
          </label>
          <textarea id="nhhNotes" rows="3" placeholder="e.g. Elderly patient requires medication reminders and assistance with mobility. Strictly vegetarian home. Prefers helper fluent in Hindi or Telugu." style="width:100%; font-family:inherit; font-size:12.5px; padding:8px 10px; border-radius:var(--radius); border:1px solid var(--line-strong);"></textarea>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button type="submit" class="btn brass">Save & Retain to Hindsight</button>
          <button type="button" class="btn sm" onclick="toggleAddHouseholdForm(false)">Cancel</button>
        </div>
      </form>
    </div>

    <div class="card"><div class="rowlist">${rows}</div></div>`;
}

async function handleCreateHousehold(event){
  event.preventDefault();
  const form = event.target;
  const body = {
    name: document.getElementById('nhhName').value.trim(),
    location: document.getElementById('nhhLocation').value.trim(),
    requirement: document.getElementById('nhhRequirement').value,
    schedule: document.getElementById('nhhSchedule').value.trim(),
    notes: document.getElementById('nhhNotes').value.trim(),
  };
  const btn = form.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  try {
    const res = await fetch('/api/households', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Could not save the household.');
    upsertHouseholdFromServer(d);
    window.SERVER_DIFFICULTY = window.SERVER_DIFFICULTY || {};
    window.SERVER_DIFFICULTY[d.id] = d.difficulty;
    log('mem', 'MEMORY AGENT', `Registered ${d.name}; profile saved and retained to Hindsight.`);
    showAddHouseholdForm = false;
    nav('householdDetail', d.id);
  } catch(e){
    alert(e.message);
    if(btn) btn.disabled = false;
  }
}

function pageHouseholdDetail(id){
  recalcAll();
  const hh = S.households.find(x => x.id === id);
  if(!hh) return emptyState('Household not found','');
  const sc = SCORES[hh.id] || {difficulty: 20};
  const placements = S.placements.filter(p => p.householdId === id);
  const evs = householdEvents(id).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  const reflections = S.reflections.filter(r => r.entityId === id);
  const replacements = placements.filter(p => p.status === 'failed' || p.status === 'ended_poor_fit').length;

  return `
  ${CURRENT_USER && CURRENT_USER.role === 'admin' ? '<button class="btn sm" style="margin-bottom:16px;" onclick="nav(\'households\')">← Households</button>' : ''}
  <div class="detail-head">
    <div class="avatar" style="background:#31507A">${initials(hh.name)}</div>
    <div><h1>${escapeHtml(hh.name)}</h1>
      <div class="tags">
        <span class="badge neutral">${escapeHtml(hh.location)}</span>
        <span class="badge neutral">Needs ${roleLabel(hh.requirement)}</span>
        <span class="badge neutral">${escapeHtml(hh.schedule)}</span>
      </div>
    </div>
  </div>
  <div class="section">
    <h2>Hindsight memory for ${escapeHtml(hh.name)}</h2>
    <div class="grid g2">
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock('household', hh.id) : ''}
        ${typeof renderBriefBlock === 'function' ? renderBriefBlock('household', hh.id) : ''}
      </div>
      <div>${typeof renderMentalModelBlock === 'function' ? renderMentalModelBlock('household', hh.id) : ''}</div>
    </div>
  </div>
  <div class="grid g3" style="margin-bottom:24px;">
    <div class="metric"><div class="label">Household difficulty</div><div class="num ${sc.difficulty >= 55 ? 'warn' : 'ok'}">${sc.difficulty}</div><span class="badge ${diffBadgeClass(sc.difficulty)}" style="margin-top:8px;">${sc.difficulty>=65?'High':sc.difficulty>=40?'Watch':'Stable'}</span></div>
    <div class="metric"><div class="label">Placements on record</div><div class="num">${placements.length}</div></div>
    <div class="metric"><div class="label">Replacements requested</div><div class="num ${replacements >= 2 ? 'warn' : ''}">${replacements}</div></div>
  </div>
  <div class="grid g2">
    <div class="section" style="margin:0;">
      <h2>Placement history</h2>
      <div class="card"><div class="rowlist">
        ${placements.map(p => {
          const helper = S.helpers.find(x => x.id === p.helperId);
          return `<div class="rowitem" style="cursor:pointer;" onclick="nav('helperDetail','${p.helperId}')">
            <div class="avatar" style="background:${helper ? helper.color : '#888'}">${helper ? initials(helper.name) : '?'}</div>
            <div class="meta"><div class="name">${helper ? escapeHtml(helper.name) : p.helperId}</div><div class="sub">${roleLabel(p.role)} · ${fmtDate(p.start)} – ${p.end ? fmtDate(p.end) : 'ongoing'}</div></div>
            <span class="badge ${p.status === 'active' ? 'ok' : (p.status === 'failed' || p.status === 'ended_poor_fit') ? 'bad' : 'neutral'}">${p.status.replace('_',' ')}</span>
          </div>`;
        }).join('') || '<div style="color:var(--ink-soft); font-size:13px;">No placements recorded yet.</div>'}
      </div></div>

      <div class="hr"></div>
      <h2>Add a coordinator note</h2>
      <div class="card">
        <form id="addHhMemoryForm" onsubmit="memuiAddNote(event, 'household', '${hh.id}', 'hhMemText')">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" id="hhMemText" placeholder="e.g. Schedule moved to evening hours; now needs pet care." required maxlength="1000" style="flex:1;">
          </div>
          <button type="submit" class="btn sm brass">Retain to Hindsight</button>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:6px;">Retained to the agency's memory for ${escapeHtml(hh.name)}. Matching and calls use it.</div>
        </form>
      </div>
    </div>

    <div class="section" style="margin:0;">
      <h2>Voice Agent</h2>
      <div class="card">
        <div style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Household check-in calls are an event source in their own right — the outcome is retained into memory the same as an app or WhatsApp event.</div>
        <button class="btn sm" id="checkinBtn">Ring the placed helper for a check-in</button>
      </div>
    </div>
  </div>
  ${typeof careHouseholdPanel === 'function' ? careHouseholdPanel(hh.id) : ''}`;
}

function handleAddHouseholdMemory(event, householdId){
  return memuiAddNote(event, 'household', householdId, 'hhMemText');
}


function wireHouseholds(){}

function wireHouseholdDetail(id){
  if(typeof careWireHousehold === 'function') careWireHousehold(id);
  const b1 = document.getElementById('runReflectBtn');
  const b2 = document.getElementById('runReflectBtn2');
  [b1, b2].forEach(b => {
    if(b) b.onclick = () => reflectOnHousehold(id);
  });
  const ci = document.getElementById('checkinBtn');
  if(ci) ci.onclick = () => {
    const placement = S.placements.find(p => p.householdId === id && p.status === 'active');
    startCall('checkin', placement ? placement.helperId : null, id, 'Voice check-in call — event source.');
  };
}
