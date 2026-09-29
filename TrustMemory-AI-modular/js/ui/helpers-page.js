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
        <div class="lede">Open a profile to see what the agency has learned about her, her promises, and her standing profile.</div>
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

async function handleCreateHelper(event){
  event.preventDefault();
  const form = event.target;
  const body = {
    name: document.getElementById('nhName').value.trim(),
    location: document.getElementById('nhLocation').value.trim(),
    experience_years: parseInt(document.getElementById('nhExp').value, 10),
    availability: document.getElementById('nhAvailability').value,
    background: document.getElementById('nhBackground').value.trim(),
    skills: Array.from(document.querySelectorAll('input[name="nhSkill"]:checked')).map(cb => cb.value),
  };
  const btn = form.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  try {
    const res = await fetch('/api/helpers', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Could not save the helper.');
    upsertHelperFromServer(d);
    window.SERVER_SCORES = window.SERVER_SCORES || {};
    window.SERVER_SCORES[d.id] = {trust: d.trust, churn: d.churn};
    log('mem', 'MEMORY AGENT', `Registered ${d.name}; profile saved and retained to Hindsight.`);
    showAddHelperForm = false;
    nav('helperDetail', d.id);
  } catch(e){
    alert(e.message);
    if(btn) btn.disabled = false;
  }
}

function pageHelperDetail(id){
  recalcAll();
  const h = S.helpers.find(x => x.id === id);
  if(!h) return emptyState('Helper not found','');
  const sc = SCORES[h.id] || {trust: 68, churn: 18};
  const evs = helperEvents(id).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  // Explain the score with the Decision Agent's own reasons from its latest Opinion entry.
  const lastOpinion = (memOf(h.id).opinion || []).find(o => /^Churn risk recalculated/.test(o.text || ''));
  const because = lastOpinion && (lastOpinion.text.match(/Because: (.*?)\. Source:/) || [])[1];
  const why = because ? because.split('; ').map(r => r.replace(/\s*\(([+-]\d+)\)$/, ' ($1)')) : churnWhy(h.id, sc.churn);
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
      <div class="label">Roles</div>
      <div style="margin-top:8px; font-size:12px;">
        ${(h.skills || []).map(k => `<div class="kv"><span class="k">${roleLabel(k)}</span></div>`).join('') || '<span style="color:var(--ink-soft);">Not recorded</span>'}
        <div style="font-size:11px; color:var(--ink-soft); margin-top:6px;">Fit for a household is judged from memory on the Matching page.</div>
      </div>
    </div>
  </div>
  <div class="section">
    <h2>Hindsight memory for ${escapeHtml(h.name)}</h2>
    <div class="grid g2">
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock('helper', h.id) : ''}
        ${typeof renderBriefBlock === 'function' ? renderBriefBlock('helper', h.id) : ''}
      </div>
      <div>
        ${typeof renderCommitmentsBlock === 'function' ? renderCommitmentsBlock(h.id) : ''}
        <div style="height:12px;"></div>
        ${typeof renderMentalModelBlock === 'function' ? renderMentalModelBlock('helper', h.id) : ''}
      </div>
    </div>
  </div>
  <div class="grid g2">
    <div class="section" style="margin:0;">
      <h2>Add a coordinator note</h2>
      <div class="card">
        <form id="addMemoryForm" onsubmit="memuiAddNote(event, 'helper', '${h.id}', 'memText')">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" id="memText" placeholder="e.g. Completed a dementia care refresher course." required maxlength="1000" style="flex:1;">
          </div>
          <button type="submit" class="btn sm brass">Retain to Hindsight</button>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:6px;">Hindsight extracts the facts and links them to ${escapeHtml(h.name)}. The next call can use them.</div>
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
      <h2>Actions</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn primary sm" id="coachBtn">Start coaching call</button>
        ${sc.churn >= 75 ? `<button class="btn sm" style="border-color:var(--rust); color:var(--rust);" id="escalateBtn">Escalate to coordinator</button>` : ''}
        <button class="btn sm" onclick="nav('memory','${h.id}')">View in Hindsight Core</button>
      </div>
    </div>
  </div>
  ${typeof careHelperPanel === 'function' ? careHelperPanel(h.id) : ''}
  ${forgetPanelHtml(h)}`;
}

let forgetMsg = {};

/** Coordinator only: delete every memory about this helper, confirmed by typing her full name. */
function forgetPanelHtml(h){
  if(!CURRENT_USER || CURRENT_USER.role !== 'admin') return '';
  const msg = forgetMsg[h.id];
  return `<div class="section" style="margin-top:28px;">
    <h2>Forget this helper</h2>
    <div class="card" style="border-color:var(--rust);">
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:10px;">Deletes everything the agency remembers about her: every Hindsight memory tagged to her, her standing profile, her calls, promises, requests and safety notes. Her name is removed from the roster. This cannot be undone.</div>
      <form id="forgetForm" style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="text" id="forgetName" placeholder="Type her full name to confirm" style="flex:1; min-width:220px;">
        <button class="btn sm" type="submit" style="border-color:var(--rust); color:var(--rust);">Forget everything about her</button>
      </form>
      ${msg ? `<div style="font-size:12.5px; margin-top:8px; color:${msg.ok ? 'var(--teal)' : 'var(--rust)'};">${escapeHtml(msg.text)}</div>` : ''}
    </div>
  </div>`;
}

function wireForgetPanel(id){
  const form = document.getElementById('forgetForm');
  if(!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const name = (document.getElementById('forgetName') || {}).value || '';
    try {
      const res = await fetch('/api/record/' + encodeURIComponent(id) + '/forget', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({confirm_name: name})});
      const d = await res.json().catch(() => ({}));
      if(!res.ok) throw new Error(d.error || 'Could not forget this helper.');
      const local = Object.values(d.local || {}).reduce((a, b) => a + b, 0);
      forgetMsg[id] = {ok: true, text: `Forgotten: ${d.documents} memory documents, ${local} local records${d.standing_profile ? ', and her standing profile' : ''}.`};
      const h = S.helpers.find(x => x.id === id);
      if(h){ h.name = 'Forgotten helper'; h.location = ''; }
      if(typeof log === 'function') log('mem', 'MEMORY AGENT', 'Forgot all memory about a helper at the coordinator\'s request.');
    } catch(err){ forgetMsg[id] = {ok: false, text: err.message}; }
    renderCurrentPage();
  };
}

function handleAddHelperMemory(event, helperId){
  return memuiAddNote(event, 'helper', helperId, 'memText');
}

function wireHelpers(){}

function wireHelperDetail(id){
  if(typeof careWireHelper === 'function') careWireHelper(id);
  wireForgetPanel(id);
  const coach = document.getElementById('coachBtn');
  if(coach) coach.onclick = () => {
    window.VOICE_FORM = Object.assign(window.VOICE_FORM || {late: 1, scenario: 'coaching_call'}, {helper: id});
    nav('voice');
    setTimeout(() => { const sel = document.getElementById('vHelper'); if(sel) sel.value = id; if(typeof startLiveVoiceSession === 'function') startLiveVoiceSession(); }, 250);
  };
  const esc = document.getElementById('escalateBtn');
  if(esc) esc.onclick = () => {
    const placement = S.placements.find(p => p.helperId === id && p.status === 'active');
    startCall('escalation', id, placement ? placement.householdId : null, 'Manually escalated from profile — critical churn risk.');
  };
}
