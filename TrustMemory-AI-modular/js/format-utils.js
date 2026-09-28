/* =========================================================================
   format-utils.js — labelFor / initials / fmtDate / escapeHtml etc.
   ========================================================================= */

function labelFor(id){
  const h = S.helpers.find(x=>x.id===id); if(h) return h.name;
  const hh = S.households.find(x=>x.id===id); if(hh) return hh.name;
  return id;
}

function labelForShort(id){
  return labelFor(id).split(' ')[0];
}

function firstName(n){
  return n.split(' ')[0];
}

function initials(n){
  return n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', {day:'2-digit', month:'short'});
}

function roleLabel(r){
  return {elder_care:'elder care', child_care:'child care', cleaning:'cleaning', cooking:'cooking'}[r] || r;
}

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function trustBand(v){
  return v>=80 ? 'Strong' : v>=60 ? 'Stable' : v>=40 ? 'Needs Attention' : 'Critical';
}

function trustBadgeClass(v){
  return v>=80 ? 'ok' : v>=60 ? 'ok' : v>=40 ? 'warn' : 'bad';
}

function churnBadgeClass(v){
  return v>=65 ? 'bad' : v>=40 ? 'warn' : 'ok';
}

function diffBadgeClass(v){
  return v>=65 ? 'bad' : v>=40 ? 'warn' : 'ok';
}

function eventTone(type){
  if(['complaint','negative_feedback','placement_failure'].includes(type)) return type==='placement_failure' ? 'bad' : 'warn';
  if(type==='positive_feedback' || type==='successful_placement' || type==='coaching_completed') return 'ok';
  return '';
}

function emptyState(title, sub){
  return `<div class="empty"><h3>${title}</h3><p>${sub}</p></div>`;
}
