/* =========================================================================
   ui/memory-page.js — Hindsight explorer: live bank stats, recall search,
   directives, and per-entity observations + standing profiles.
   ========================================================================= */

let memSelected = null;

function pageMemory(){
  if(!memSelected) memSelected = route.param || 'anita';
  const isHelper = S.helpers.some(h => h.id === memSelected);
  const kind = isHelper ? 'helper' : 'household';
  return `
  <div class="pagehead"><div class="eyebrow">Hindsight Core</div><h1>Retain · Recall · Reflect</h1><div class="lede">One bank for the agency. Every call, feedback and note is retained; Hindsight extracts facts, links entities and time, consolidates observations, keeps standing profiles current, and enforces directives when it reflects.</div></div>
  <div class="section"><h2>Bank</h2>${typeof renderBankStats === 'function' ? renderBankStats() : ''}</div>
  <div class="section">${typeof renderRecallSearch === 'function' ? renderRecallSearch() : ''}</div>
  <div class="section">${typeof renderDirectivesBlock === 'function' ? renderDirectivesBlock() : ''}</div>
  <div class="section">
    <h2>Inspect by entity</h2>
    <div style="margin-bottom:12px;">
      <select id="memEntitySelect">
        <optgroup label="Helpers">${S.helpers.map(h => `<option value="${h.id}" ${h.id === memSelected ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}</optgroup>
        <optgroup label="Households">${S.households.map(h => `<option value="${h.id}" ${h.id === memSelected ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}</optgroup>
      </select>
    </div>
    <div class="grid g2">
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock(kind, memSelected) : ''}
        ${typeof renderBriefBlock === 'function' ? renderBriefBlock(kind, memSelected) : ''}
      </div>
      <div>${typeof renderMentalModelBlock === 'function' ? renderMentalModelBlock(kind, memSelected) : ''}</div>
    </div>
  </div>
  `;
}

function wireMemory(){
  const sel = document.getElementById('memEntitySelect');
  if(sel){
    sel.onchange = () => { memSelected = sel.value; renderCurrentPage(); };
  }
}
