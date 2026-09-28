/* =========================================================================
   ui/matching-page.js — role-fit-aware Matching UI
   ========================================================================= */

let matchingState = {role:'elder_care', householdId:'h106', results:null, naive:false};

function pageMatching(){
  const results = matchingState.results;
  return `
  <div class="pagehead"><div class="eyebrow">Matching</div><h1>Find the best match</h1><div class="lede">Ranking is never age, gender or a static profile field alone — it draws on memory.</div></div>
  <div class="card" style="margin-bottom:20px;">
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <select id="mHousehold">${S.households.map(h => `<option value="${h.id}" ${h.id === matchingState.householdId ? 'selected' : ''}>${h.name}</option>`).join('')}</select>
      <select id="mRole">
        ${['elder_care','child_care','cleaning','cooking'].map(r => `<option value="${r}" ${r === matchingState.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
      </select>
      <button class="btn primary" id="findBtn">Find best match</button>
    </div>
  </div>
  ${results ? matchingResults(results) : emptyState('No search run yet.', 'Choose a household requirement above and click "Find best match."')}
  `;
}

function matchingResults(results){
  const top = results[0];
  const whyReasons = matchWhy(top, matchingState.role);

  return `
  <div class="section">
    <h2>Recommended match</h2>
    <div class="candidate top" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div><div class="rank">Recommended</div><div class="mname">${top.helper.name}</div></div>
        <div class="mscore">${top.score}<span style="font-size:14px; color:var(--ink-soft);">/100</span></div>
      </div>
      <div class="facts">
        <div>Trust: <b>${top.trust}</b></div><div>Churn risk: <b>${top.churn}</b></div>
        <div>Role fit: <b>${top.roleFit}</b></div><div>Experience: <b>${top.helper.exp} yrs</b></div>
      </div>
      <ul class="why-list">
        ${whyReasons.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
      </ul>
      <div class="hr"></div>
      <div style="font-size:11.5px; color:var(--ink-soft);"><b>Memory evidence</b>
      <div class="timeline" style="margin-top:10px;">
        ${helperEvents(top.helper.id).filter(e => ['positive_feedback','negative_feedback','complaint'].includes(e.type)).slice(0,4).map(e => `<div class="tl-item ${eventTone(e.type)}"><div class="date">${fmtDate(e.date)}</div><div class="txt">${escapeHtml(e.description)}</div></div>`).join('') || '<div style="padding-left:4px;">No feedback events on record yet.</div>'}
      </div></div>
    </div>
  </div>
  <div class="section">
    <h2>Other candidates</h2>
    <div class="grid g3">
      ${results.slice(1,4).map((r, i) => `
        <div class="candidate">
          <div class="rank">Candidate ${i+2}</div>
          <div class="mname">${r.helper.name}</div>
          <div class="mscore" style="font-size:20px;">${r.score}<span style="font-size:12px; color:var(--ink-soft);">/100</span></div>
          <div class="facts"><div>Trust: <b>${r.trust}</b></div><div>Churn: <b>${r.churn}</b></div></div>
        </div>`).join('')}
    </div>
  </div>`;
}

function wireMatching(){
  const btn = document.getElementById('findBtn');
  if(btn){
    btn.onclick = () => {
      matchingState.householdId = document.getElementById('mHousehold').value;
      matchingState.role = document.getElementById('mRole').value;
      matchingState.results = findMatches(matchingState.role, matchingState.householdId, {naive: matchingState.naive});
      renderCurrentPage();
    };
  }
}
