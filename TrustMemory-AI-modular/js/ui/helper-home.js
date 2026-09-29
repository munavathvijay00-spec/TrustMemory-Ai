/* =========================================================================
   ui/helper-home.js — what a signed-in helper sees: her promises and when
   the agency will check in, her recent calls in plain words, and her call
   screen. No trust or churn scores are shown to helpers.
   ========================================================================= */

let helperHomeData = null;
let helperRecord = null;          // what the agency remembers from her own words
let helperRecordOpen = null;      // index of the fact whose "This is wrong" box is open
let helperRecordMsg = '';

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
    ${typeof reqFormCard === 'function' ? reqFormCard('helper') : ''}
    <div class="grid g2">
      <div>${typeof reqFestivalCard === 'function' ? reqFestivalCard() : ''}</div>
      <div>${typeof reqPrefsCard === 'function' ? reqPrefsCard() : ''}</div>
    </div>
    <div class="grid g2">
      <div class="section"><h2>What you agreed</h2><div class="card">${promises}${resolved}</div></div>
      <div class="section"><h2>Your recent calls</h2><div class="card">${calls}</div></div>
    </div>
    ${helperRecordHtml()}
    <div class="section">
      <div class="card" style="font-size:12.5px; color:var(--ink-soft); line-height:1.6;">
        <b style="color:var(--ink);">What the agency keeps on record.</b> Calls are recorded and remembered so the agency can support you:
        what you said about your situation, what you agreed, and whether it worked out. Ask the agency at any time what it has on record about you, or to correct something.
      </div>
    </div>`;
}

/** Her record, from her own words only, with an inline "This is wrong" for each fact. */
function helperRecordHtml(){
  const r = helperRecord;
  let body;
  if(!r) body = '<div style="font-size:12.5px; color:var(--ink-soft);">Reading what the agency has on record…</div>';
  else if(r.error) body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(r.error)}</div>`;
  else if(!r.facts.length) body = emptyState('Nothing on record yet', 'What you tell the agency on calls and in this app will appear here.');
  else body = r.facts.map((f, i) => `<div style="padding:9px 0; border-top:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div style="font-size:13px;">${escapeHtml(f.text)}
          <div style="font-size:11.5px; color:var(--ink-faint); margin-top:2px;">${escapeHtml(f.origin || '')}${f.when ? ' · ' + escapeHtml(hhDate(f.when)) : ''}${f.outdated ? ' · <span class="badge warn">may be out of date</span>' : ''}</div></div>
        <button class="btn sm" data-rec="${i}" style="flex:none;">This is wrong</button>
      </div>
      ${helperRecordOpen === i ? `<form data-recform="${i}" style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" id="recFix${i}" maxlength="400" placeholder="What is right?" style="flex:1;">
        <button class="btn sm primary" type="submit">Send</button></form>` : ''}
    </div>`).join('');
  const corr = r && r.corrections && r.corrections.length
    ? `<div style="margin-top:12px; font-size:12px; color:var(--ink-soft);"><b style="color:var(--ink);">Your corrections:</b> ${r.corrections.map(c => escapeHtml(c.correction) + ' (' + escapeHtml(hhDate(c.created_at)) + ')').join('; ')}</div>`
    : '';
  return `<div class="section"><h2>What the agency has on record</h2>
    <div class="card">
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:6px;">What the agency remembers from what you said yourself. If something is wrong, tell them; your correction replaces it on the next call.</div>
      ${body}${corr}
      ${helperRecordMsg ? `<div style="font-size:12.5px; color:var(--teal); margin-top:8px;">${escapeHtml(helperRecordMsg)}</div>` : ''}
    </div></div>`;
}

async function helperLoadRecord(){
  try {
    const res = await fetch('/api/me/record');
    const d = await res.json().catch(() => ({}));
    helperRecord = res.ok ? d : {error: d.error || 'Could not load your record.'};
  } catch(e){
    helperRecord = {error: 'Cannot reach the agency server.'};
  }
  if(route.page === 'helperHome') renderCurrentPage();
}

function helperWireRecord(){
  document.querySelectorAll('[data-rec]').forEach(b => {
    b.onclick = () => { const i = Number(b.dataset.rec); helperRecordOpen = helperRecordOpen === i ? null : i; helperRecordMsg = ''; renderCurrentPage(); };
  });
  document.querySelectorAll('[data-recform]').forEach(f => {
    f.onsubmit = async e => {
      e.preventDefault();
      const i = Number(f.dataset.recform);
      const fact = helperRecord && helperRecord.facts[i] ? helperRecord.facts[i].text : '';
      const input = document.getElementById('recFix' + i);
      const correction = input ? input.value.trim() : '';
      try {
        const res = await fetch('/api/me/record/correction', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fact, correction})});
        const d = await res.json().catch(() => ({}));
        if(!res.ok) throw new Error(d.error || 'Could not send your correction.');
        helperRecordOpen = null;
        helperRecordMsg = 'Thank you. The agency will use your correction from the next call.';
        helperRecord = null;
        helperLoadRecord();
      } catch(err){ helperRecordMsg = err.message; }
      renderCurrentPage();
    };
  });
}

async function wireHelperHome(){
  if(typeof reqWire === 'function') reqWire();
  helperWireRecord();
  if(!helperRecord) helperLoadRecord();
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
