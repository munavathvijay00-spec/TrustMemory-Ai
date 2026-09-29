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
  ${typeof careHouseholdPanel === 'function' ? careHouseholdPanel(hh.id) : ''}
  ${sidesPanel(hh.id)}`;
}

function handleAddHouseholdMemory(event, householdId){
  return memuiAddNote(event, 'household', householdId, 'hhMemText');
}


function wireHouseholds(){}

function wireHouseholdDetail(id){
  if(typeof careWireHousehold === 'function') careWireHousehold(id);
  sidesWire(id);
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

/* ------------------------------------------------------------------ both sides of the story */

const SIDES = {};   // householdId -> {helper, loading, data, error}

/** Helpers placed at this household, current placement first. */
function sidesHelpers(householdId){
  const seen = new Set();
  return S.placements.filter(p => p.householdId === householdId)
    .sort((a, b) => (b.status === 'active') - (a.status === 'active') || String(b.start || '').localeCompare(String(a.start || '')))
    .filter(p => !seen.has(p.helperId) && seen.add(p.helperId))
    .map(p => ({id: p.helperId, name: (S.helpers.find(h => h.id === p.helperId) || {}).name || p.helperId, status: p.status}));
}

function sidesState(householdId){
  if(!SIDES[householdId]){
    const first = sidesHelpers(householdId)[0];
    SIDES[householdId] = {helper: first ? first.id : '', loading: false, data: null, error: ''};
  }
  return SIDES[householdId];
}

function sidesBadge(status){
  const m = {agree: ['ok', 'Agree'], differ: ['bad', 'Differ'], one_side: ['neutral', 'One side'], both: ['warn', 'Both sides']};
  const b = m[status] || m.one_side;
  return `<span class="badge ${b[0]}">${b[1]}</span>`;
}

function sidesSaid(x){
  if(!x || !x.says) return '<span style="color:var(--ink-faint); font-size:12px;">Nothing on record</span>';
  return `${x.when ? `<div style="font-family:var(--font-mono); font-size:11px; color:var(--ink-faint);">${escapeHtml(x.when)}</div>` : ''}<div style="font-size:12.5px;">${escapeHtml(x.says)}</div>`;
}

function sidesResult(householdId){
  const st = sidesState(householdId);
  if(st.loading) return '<div style="font-size:12.5px; color:var(--ink-soft); margin-top:12px;">Asking Hindsight what each side has said…</div>';
  if(st.error) return `<div style="font-size:12.5px; color:var(--rust); margin-top:12px;">${escapeHtml(st.error)}</div>`;
  const d = st.data;
  if(!d) return '';
  const rows = d.topics.length ? d.topics.map(t => `<tr style="border-bottom:1px solid var(--line);">
      <td style="padding:8px 6px; vertical-align:top; font-weight:600; font-size:12.5px;">${escapeHtml(t.topic)}<div style="margin-top:4px;">${sidesBadge(t.status)}</div></td>
      <td style="padding:8px 6px; vertical-align:top;">${sidesSaid(t.household)}</td>
      <td style="padding:8px 6px; vertical-align:top;">${sidesSaid(t.helper)}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:10px 6px; font-size:12.5px; color:var(--ink-soft);">Neither side has said anything on record about this placement yet.</td></tr>`;
  return `<div style="margin-top:14px;">
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
      <span class="badge ${d.source === 'hindsight' ? 'ok' : 'warn'}">${d.source === 'hindsight' ? 'From Hindsight memory' : 'From local records'}</span>
      <span style="font-size:12px; color:var(--ink-soft);">${escapeHtml(d.household_name)} and ${escapeHtml(d.helper_name)}. Neither side is judged; this is what each said.</span>
    </div>
    ${d.note ? `<div style="font-size:12px; color:var(--ink-soft); margin-bottom:8px;">${escapeHtml(d.note)}</div>` : ''}
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--line); text-align:left; font-size:11px; text-transform:uppercase; color:var(--ink-soft);">
        <th style="padding:6px; width:18%;">Topic</th><th style="padding:6px;">The household says</th><th style="padding:6px;">The helper says</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${d.questions.length ? `<div style="margin-top:12px;"><div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--brass-dark); margin-bottom:4px;">Neutral questions for a mediation call</div>
      <ul style="margin:0; padding-left:18px; font-size:13px; line-height:1.5;">${d.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul></div>` : ''}
    ${d.based_on && d.based_on.length ? `<details style="margin-top:10px; font-size:12px;"><summary>Based on ${d.based_on.length} memor${d.based_on.length === 1 ? 'y' : 'ies'}</summary>
      <ul style="padding-left:18px; color:var(--ink-soft);">${d.based_on.map(m => `<li>${m.when ? '<b>' + escapeHtml(m.when) + '</b> ' : ''}${escapeHtml(m.text)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

function sidesPanel(householdId){
  const helpers = sidesHelpers(householdId);
  const st = sidesState(householdId);
  const body = helpers.length
    ? `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <select id="sidesHelper">${helpers.map(h => `<option value="${escapeHtml(h.id)}" ${h.id === st.helper ? 'selected' : ''}>${escapeHtml(h.name)}${h.status === 'active' ? ' (current)' : ''}</option>`).join('')}</select>
        <button class="btn sm primary" id="sidesBtn" ${st.loading ? 'disabled' : ''}>Compare what each side said</button>
      </div>
      <div id="sidesOut">${sidesResult(householdId)}</div>`
    : `<div style="font-size:12.5px; color:var(--ink-soft);">No helper has been placed here yet, so there is nothing to compare.</div>`;
  return `<div class="section" style="margin-top:20px;">
    <h2>Both sides of the story</h2>
    <div class="card">
      <div style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Lines up what the household and the helper each said about this placement, topic by topic, so a mediation call starts from both accounts. It never decides who is right.</div>
      ${body}
    </div>
  </div>`;
}

async function sidesLoad(householdId){
  const st = sidesState(householdId);
  st.loading = true; st.error = ''; st.data = null;
  if(typeof renderCurrentPage === 'function' && route.page === 'householdDetail') renderCurrentPage();
  try {
    const r = await fetch('/api/sides?household=' + encodeURIComponent(householdId) + '&helper=' + encodeURIComponent(st.helper));
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Could not compare the two sides.');
    st.data = d;
  } catch(e){ st.error = e.message; }
  st.loading = false;
  if(typeof renderCurrentPage === 'function' && route.page === 'householdDetail') renderCurrentPage();
}

function sidesWire(householdId){
  const st = sidesState(householdId);
  const sel = document.getElementById('sidesHelper');
  const btn = document.getElementById('sidesBtn');
  if(sel) sel.onchange = () => { st.helper = sel.value; st.data = null; st.error = ''; };
  if(btn) btn.onclick = () => sidesLoad(householdId);
}
