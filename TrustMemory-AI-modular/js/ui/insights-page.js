/* =========================================================================
   ui/insights-page.js — what Hindsight has learned across the agency
   (consolidated observations, read live from the bank; nothing simulated)
   ========================================================================= */

function pageInsights(){
  return `
    <div class="pagehead">
      <div class="eyebrow">Insights</div>
      <h1>What the agency has learned</h1>
      <div class="lede">Hindsight consolidates every retained fact into observations: deduplicated beliefs that carry their evidence and are refined, not overwritten, when new calls contradict them.</div>
    </div>
    <div class="section">
      ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock(null, null, {title:'Across all helpers and households'}) : ''}
    </div>
    <div class="section">
      <h2>By helper</h2>
      <div class="grid g2">
        ${S.helpers.map(h => `<div>
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;"><a onclick="nav('helperDetail','${h.id}')" style="cursor:pointer;">${escapeHtml(h.name)}</a></div>
          ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock('helper', h.id, {title:'Observations'}) : ''}
        </div>`).join('')}
      </div>
    </div>
    <div class="section">
      <h2>By household</h2>
      <div class="grid g2">
        ${S.households.map(h => `<div>
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;"><a onclick="nav('householdDetail','${h.id}')" style="cursor:pointer;">${escapeHtml(h.name)}</a></div>
          ${typeof renderObservationsBlock === 'function' ? renderObservationsBlock('household', h.id, {title:'Observations'}) : ''}
        </div>`).join('')}
      </div>
    </div>
  `;
}
