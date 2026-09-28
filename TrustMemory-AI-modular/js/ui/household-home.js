/* =========================================================================
   ui/household-home.js — what a signed-in household sees: its details, the
   helper working there, the next check-in, and a feedback form. Feedback is
   stored and retained to Hindsight, tagged to the household and the helper.
   ========================================================================= */

let householdHomeData = null;
let householdFeedbackNote = '';

function pageHouseholdHome(){
  const d = householdHomeData;
  if(!d) return '<div class="card" style="font-size:12.5px; color:var(--ink-soft);">Loading your household…</div>';
  if(d.error) return `<div class="card" style="color:var(--rust); font-size:12.5px;">${escapeHtml(d.error)}</div>`;
  const hh = d.household;
  const date = typeof hhDate === 'function' ? hhDate : (x => x || '');

  const current = d.current.length
    ? d.current.map(p => `<div style="font-size:14px; font-weight:600;">${escapeHtml(p.helper_name || p.helper_id)}</div><div style="font-size:12px; color:var(--ink-soft);">With you since ${escapeHtml(date(p.started_at))}</div>`).join('')
    : '<div style="font-size:13px; color:var(--ink-soft);">No helper is placed with you right now.</div>';

  const past = d.placements.filter(p => !p.active);
  const helpers = [];
  d.placements.forEach(p => { if(!helpers.some(x => x.id === p.helper_id)) helpers.push({id: p.helper_id, name: p.helper_name || p.helper_id, active: p.active}); });

  const feedbackList = d.feedback.length
    ? d.feedback.map(f => `<div style="padding:8px 0; border-top:1px solid var(--line); font-size:12.5px;">
        <b>${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</b> ${f.helper_name ? 'about ' + escapeHtml(f.helper_name) : ''}
        <span style="color:var(--ink-faint); font-family:var(--font-mono); font-size:11px;">${escapeHtml(String(f.created_at || '').slice(0, 10))}</span>
        <div style="margin-top:2px;">${escapeHtml(f.text)}</div></div>`).join('')
    : '';

  return `
    <div class="pagehead">
      <div class="eyebrow">Household</div>
      <h1>${escapeHtml(hh.name)}</h1>
      <div class="lede">${escapeHtml(hh.location || '')} · needs ${escapeHtml(roleLabel(hh.need))}${hh.schedule ? ' · ' + escapeHtml(hh.schedule) : ''}</div>
    </div>
    <div class="grid g2">
      <div class="section"><h2>Your helper</h2><div class="card">${current}
        ${past.length ? `<div style="margin-top:10px; font-size:12px; color:var(--ink-soft);">Earlier: ${past.map(p => escapeHtml(p.helper_name || p.helper_id) + ' (' + escapeHtml(date(p.started_at)) + ' – ' + escapeHtml(date(p.ended_at)) + ')').join(', ')}</div>` : ''}
      </div></div>
      <div class="section"><h2>Next check-in</h2><div class="card">
        <div style="font-size:14px; font-weight:600;">${d.next_check_in ? escapeHtml(date(d.next_check_in)) : 'Not scheduled'}</div>
        <div style="font-size:12px; color:var(--ink-soft);">The agency checks in with your helper about anything agreed on a call, and may call you too.</div>
      </div></div>
    </div>
    <div class="section">
      <h2>Tell the agency how it is going</h2>
      <div class="card">
        <form id="hhFeedbackForm" novalidate>
          <div class="auth-row">
            ${helpers.length ? `<label class="auth-field"><span>About</span><select id="hhfHelper">${helpers.map(h => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)}${h.active ? ' (current)' : ''}</option>`).join('')}</select></label>` : ''}
            <label class="auth-field"><span>Rating</span><select id="hhfRating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} – ${['','Very poor','Poor','Okay','Good','Excellent'][n]}</option>`).join('')}</select></label>
          </div>
          <label class="auth-field"><span>What should the agency know?</span><textarea id="hhfText" rows="3" maxlength="1000" placeholder="e.g. Very patient with our son, but often ten minutes late on Mondays."></textarea></label>
          <div class="auth-error" id="hhfError"></div>
          ${householdFeedbackNote ? `<div style="font-size:12.5px; color:var(--teal); margin-bottom:8px;">${escapeHtml(householdFeedbackNote)}</div>` : ''}
          <button class="btn primary" type="submit">Send feedback</button>
        </form>
        ${feedbackList ? `<div style="margin-top:14px;"><div style="font-size:12px; font-weight:600; color:var(--ink-soft);">Your recent feedback</div>${feedbackList}</div>` : ''}
      </div>
    </div>`;
}

async function loadHouseholdHome(){
  try {
    const res = await fetch('/api/me/household');
    const d = await res.json().catch(() => ({}));
    householdHomeData = res.ok ? d : {error: d.error || 'Could not load your household.'};
  } catch(e){
    householdHomeData = {error: 'Cannot reach the agency server.'};
  }
  if(route.page === 'householdHome') renderCurrentPage();
}

async function submitHouseholdFeedback(event){
  event.preventDefault();
  const err = document.getElementById('hhfError');
  const text = document.getElementById('hhfText').value.trim();
  const sel = document.getElementById('hhfHelper');
  const body = {rating: parseInt(document.getElementById('hhfRating').value, 10), text};
  if(sel && sel.value) body.helper_id = sel.value;
  if(text.length < 3){ if(err) err.textContent = 'Feedback must be 3 to 1000 characters.'; return; }
  const btn = event.target.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  try {
    const res = await fetch('/api/me/feedback', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Could not send your feedback.');
    householdFeedbackNote = 'Thank you. Your feedback was saved and the agency will remember it.';
    await loadHouseholdHome();
  } catch(e){
    if(err) err.textContent = e.message;
    if(btn) btn.disabled = false;
  }
}

function wireHouseholdHome(){
  const f = document.getElementById('hhFeedbackForm');
  if(f && f.addEventListener) f.addEventListener('submit', submitHouseholdFeedback);
  if(!householdHomeData) loadHouseholdHome();
}
