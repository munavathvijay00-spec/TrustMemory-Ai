/* =========================================================================
   ui/memory-page.js — Hindsight Core explorer (World, Experience, Opinion, Observation)
   ========================================================================= */

let memSelected = null;
let memTab = 'world';

function pageMemory(){
  ensureWorldMemory();
  if(!memSelected) memSelected = route.param || 'anita';
  const m = memOf(memSelected);
  const tabs = ['world','experience','opinion','observation'];
  return `
  <div class="pagehead"><div class="eyebrow">Hindsight Core</div><h1>Retain · Recall · Reflect</h1><div class="lede">One write path — Retain — fans out into four networks, each with a different epistemic status. This is the differentiator over a plain database.</div></div>
  <div class="netgrid">
    ${tabs.map(t => `<div class="netcyl ${t === memTab ? 'active-net' : ''}"><div class="nicon"></div><div class="nname">${NETWORK_META[t].name}</div><div class="ncount">${globalNetworkCount(t)}</div><div class="ndesc">${NETWORK_META[t].desc}</div></div>`).join('')}
  </div>
  <div class="section" style="margin-bottom:12px;"><h2 style="font-size:13px; color:var(--ink-soft); font-weight:600;">Inspect by entity</h2></div>
  <div style="margin-bottom:16px;">
    <select id="memEntitySelect">
      <optgroup label="Helpers">${S.helpers.map(h => `<option value="${h.id}" ${h.id === memSelected ? 'selected' : ''}>${h.name}</option>`).join('')}</optgroup>
      <optgroup label="Households">${S.households.map(h => `<option value="${h.id}" ${h.id === memSelected ? 'selected' : ''}>${h.name}</option>`).join('')}</optgroup>
    </select>
  </div>
  <div class="tabs">${tabs.map(t => `<button data-tab="${t}" class="${t === memTab ? 'active' : ''}">${NETWORK_META[t].name} <span style="color:var(--ink-faint); font-weight:400;">(${m[t].length})</span></button>`).join('')}</div>
  <div class="card" id="memBody">${memBody(m, memTab)}</div>
  `;
}

function memBody(m, tab){
  const desc = {
    world: 'Stable facts — who they are, what they do, what a household needs.',
    experience: 'Things that happened — attendance, complaints, feedback, calls.',
    opinion: 'Derived assessments the system holds — treated as beliefs, not absolute truth.',
    observation: 'Higher-level patterns discovered by the Reflection Agent across many experiences.',
  };
  const entries = m[tab];
  return `<div style="font-size:12px; color:var(--ink-soft); margin-bottom:12px;">${desc[tab]}</div>
    ${entries.length ? entries.slice().reverse().map(e => `<div class="mem-entry"><div class="k">${e.t || ''}</div><div>${escapeHtml(e.text)}</div></div>`).join('') : emptyState('No ' + tab + ' memory yet.', tab === 'world' ? 'World facts are seeded from the profile.' : 'Trigger an event, run reflection, or place a call to populate this layer.')}`;
}

function wireMemory(){
  ensureWorldMemory();
  const sel = document.getElementById('memEntitySelect');
  if(sel){
    sel.onchange = () => { memSelected = sel.value; renderCurrentPage(); };
  }
  document.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => { memTab = b.dataset.tab; renderCurrentPage(); };
  });
}
