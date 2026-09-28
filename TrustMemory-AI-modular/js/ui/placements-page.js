/* =========================================================================
   ui/placements-page.js — All placements overview
   ========================================================================= */

function pagePlacements(){
  const rows = S.placements.map(p => {
    const helper = S.helpers.find(h => h.id === p.helperId);
    const hh = S.households.find(h => h.id === p.householdId);
    return `<div class="rowitem" style="cursor:default;">
      <div class="avatar" style="background:${helper ? helper.color : '#888'}">${helper ? initials(helper.name) : '?'}</div>
      <div class="meta"><div class="name">${helper ? helper.name : ''} → ${hh ? hh.name : ''}</div><div class="sub">${roleLabel(p.role)} · ${fmtDate(p.start)} – ${p.end ? fmtDate(p.end) : 'ongoing'}</div></div>
      <span class="badge ${p.status === 'active' ? 'ok' : (p.status === 'failed' || p.status === 'ended_poor_fit') ? 'bad' : 'neutral'}">${p.status.replace('_',' ')}</span>
    </div>`;
  }).join('');
  return `<div class="pagehead"><div class="eyebrow">Placements</div><h1>All placements</h1></div><div class="card"><div class="rowlist">${rows}</div></div>`;
}
