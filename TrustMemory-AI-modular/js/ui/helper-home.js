/* =========================================================================
   ui/helper-home.js — what a signed-in helper sees: her promises and when
   the agency will check in, her recent calls in plain words, and her call
   screen. No trust or churn scores are shown to helpers.
   ========================================================================= */

let helperHomeData = null;

function hhDate(d){
  if(!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
}

function pageHelperHome(){
  const d = helperHomeData;
  if(!d) return '<div class="card" style="font-size:12.5px; color:var(--ink-soft);">Loading your page…</div>';
  if(d.error) return `<div class="card" style="color:var(--rust); font-size:12.5px;">${escapeHtml(d.error)}</div>`;
  const h = d.helper;
  const first = String(h.name).split(' ')[0];

  const promises = d.promises.length
    ? d.promises.map(p => `<div class="rowitem" style="display:block; padding:10px 0; border-top:1px solid var(--line);">
        <div style="font-size:13.5px; font-weight:600;">${escapeHtml(p.text)}</div>
        <div class="sub">You agreed on ${escapeHtml(hhDate(p.made_at))}${p.due_date ? ' · the agency will check in around <b>' + escapeHtml(hhDate(p.due_date)) + '</b>' : ''}</div>
      </div>`).join('')
    : emptyState('No open promises', 'When you agree something with the agency on a call, it is listed here with the date they will check in.');

  const resolved = d.resolved.length
    ? `<div style="margin-top:12px; font-size:12px; color:var(--ink-soft);">Earlier: ${d.resolved.map(r => `${escapeHtml(r.text)} (${r.status === 'kept' ? 'done' : 'not managed'})`).join('; ')}</div>`
    : '';

  const calls = d.calls.length
    ? d.calls.map(c => `<div style="padding:10px 0; border-top:1px solid var(--line);">
        <div style="font-size:11px; color:var(--ink-faint); font-family:var(--font-mono);">${escapeHtml(hhDate(c.date))}</div>
        <div style="font-size:13px; margin-top:2px;">${escapeHtml(c.summary)}</div>
        ${c.agreed ? `<div class="sub" style="font-size:12px; color:var(--ink-soft); margin-top:2px;">Agreed: ${escapeHtml(c.agreed)}</div>` : ''}
      </div>`).join('')
    : emptyState('No calls yet', 'Calls from the agency appear here after they end.');

  return `
    <div class="pagehead">
      <div class="eyebrow">Helper</div>
      <h1>Namaste, ${escapeHtml(first)}</h1>
      <div class="lede">${d.working_at ? 'You are working with the ' + escapeHtml(d.working_at.household) + ' since ' + escapeHtml(hhDate(d.working_at.since)) + '.' : 'You are not placed with a household right now.'} ${escapeHtml(h.location || '')}${h.availability ? ' · ' + escapeHtml(h.availability) : ''}</div>
    </div>
    <div class="section">
      <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
        <div><div style="font-weight:600;">Your call screen</div>
          <div style="font-size:12.5px; color:var(--ink-soft);">Keep it open to receive calls from the agency on this phone.</div></div>
        <a class="btn primary" href="helper.html?helper=${encodeURIComponent(h.id)}">Open my call screen</a>
      </div>
    </div>
    <div class="grid g2">
      <div class="section"><h2>What you agreed</h2><div class="card">${promises}${resolved}</div></div>
      <div class="section"><h2>Your recent calls</h2><div class="card">${calls}</div></div>
    </div>
    <div class="section">
      <div class="card" style="font-size:12.5px; color:var(--ink-soft); line-height:1.6;">
        <b style="color:var(--ink);">What the agency keeps on record.</b> Calls are recorded and remembered so the agency can support you:
        what you said about your situation, what you agreed, and whether it worked out. Ask the agency at any time what it has on record about you, or to correct something.
      </div>
    </div>`;
}

async function wireHelperHome(){
  if(helperHomeData) return;
  try {
    const res = await fetch('/api/me/helper');
    const d = await res.json().catch(() => ({}));
    helperHomeData = res.ok ? d : {error: d.error || 'Could not load your page.'};
  } catch(e){
    helperHomeData = {error: 'Cannot reach the agency server.'};
  }
  if(route.page === 'helperHome') renderCurrentPage();
}
