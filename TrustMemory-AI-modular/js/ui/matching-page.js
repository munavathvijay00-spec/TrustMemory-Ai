/* =========================================================================
   ui/matching-page.js — memory-backed matching (Hindsight recall per candidate)
   ========================================================================= */

let matchingState = {role:'child_care', householdId:'h104'};

function pageMatching(){
  return `
  <div class="pagehead"><div class="eyebrow">Matching</div><h1>Find the best match</h1><div class="lede">For every candidate the Matching Agent recalls her history from Hindsight, and for the household it recalls what they expect and why past placements ended. Evidence is shown next to every score.</div></div>
  <div class="card" style="margin-bottom:20px;">
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <select id="mHousehold">${S.households.map(h => `<option value="${h.id}" ${h.id === matchingState.householdId ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}</select>
      <select id="mRole">
        ${['elder_care','child_care','cleaning','cooking'].map(r => `<option value="${r}" ${r === matchingState.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
      </select>
      <button class="btn primary" id="findBtn">Find best match</button>
    </div>
  </div>
  ${typeof renderMatchResults === 'function' ? renderMatchResults() : ''}
  `;
}

function wireMatching(){
  const btn = document.getElementById('findBtn');
  if(btn){
    btn.onclick = () => {
      matchingState.householdId = document.getElementById('mHousehold').value;
      matchingState.role = document.getElementById('mRole').value;
      memuiFindMatches(matchingState.householdId, matchingState.role);
    };
  }
}
