/* =========================================================================
   care-ui.js — private safety checks (dashboard + helper page) and the
   handover brief for the next helper (household page). Data: /api/care/*.
   ========================================================================= */

let careSafety = null;          // {open:[...]} or {error}
let careSafetyLoading = false;
let careSafetyAt = 0;
const careHelperSafety = {};    // helperId -> {loading, at, data: {signals, flags} | {error}}
const careBriefs = {};          // householdId -> {helper, lang, loading, data, error}
let careSpeaking = false;

const CARE_LANGS = [['en', 'English', 'en-IN'], ['hi', 'हिन्दी', 'hi-IN'], ['te', 'తెలుగు', 'te-IN']];
const CARE_SECTION_TITLES = {
  en: {routine: 'Daily routine', health_and_care: 'Health and care', preferences: 'What the family prefers', what_went_wrong_before: 'What went wrong before', first_week_tips: 'First-week tips'},
  hi: {routine: 'रोज़ का काम', health_and_care: 'सेहत और देखभाल', preferences: 'परिवार की पसंद', what_went_wrong_before: 'पहले क्या गलत हुआ', first_week_tips: 'पहले हफ्ते के सुझाव'},
  te: {routine: 'రోజువారీ పని', health_and_care: 'ఆరోగ్యం మరియు సంరక్షణ', preferences: 'కుటుంబం ఇష్టాలు', what_went_wrong_before: 'ఇంతకు ముందు ఏమి తప్పు జరిగింది', first_week_tips: 'మొదటి వారం సూచనలు'},
};

function careRerender(page){
  if(typeof route !== 'undefined' && route.page === page && typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* ------------------------------------------------------------------ safety: dashboard card */

async function careLoadSafety(){
  if(careSafetyLoading) return;
  careSafetyLoading = true;
  try {
    const r = await fetch('/api/care/safety');
    careSafety = r.ok ? await r.json() : {error: 'Could not load safety checks.'};
  } catch(e){ careSafety = {error: e.message}; }
  careSafetyLoading = false;
  careSafetyAt = Date.now();
  careRerender('dashboard');
}

function careTimeline(items){
  if(!items || !items.length) return '';
  return `<div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">${items.map(s => `
    <div style="font-size:12px; line-height:1.45;"><span style="font-family:var(--mono, monospace); color:var(--ink-soft);">${escapeHtml(s.said_at || s.when || '')}</span>
      <span class="badge neutral" style="margin:0 4px;">${escapeHtml(s.label || '')}</span>“${escapeHtml(s.evidence || s.text || '')}”</div>`).join('')}</div>`;
}

function careSafetyCard(){
  if(!careSafetyLoading && (!careSafety || Date.now() - careSafetyAt > 15000)) careLoadSafety();
  const flags = careSafety && careSafety.open;
  if(!flags || !flags.length) return '';
  return `<div class="card" style="border:1px solid var(--rust, #A6453A); border-left:5px solid var(--rust, #A6453A); margin-bottom:20px;">
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline; flex-wrap:wrap;">
      <h2 style="margin:0; color:var(--rust, #A6453A);">Safety check needed</h2>
      <span style="font-size:11.5px; color:var(--ink-soft);">Private to the coordinator. A flag for a human to check, from the helper's own words across calls. The household is not told.</span>
    </div>
    ${flags.map(f => `<div style="border-top:1px solid var(--line); margin-top:12px; padding-top:12px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <b style="font-size:14px;">${escapeHtml(f.helper_name)}</b>
        ${f.household_name ? `<span class="badge neutral">${escapeHtml(f.household_name)}</span>` : ''}
        ${f.kind_labels.map(k => `<span class="badge bad">${escapeHtml(k)}</span>`).join('')}
      </div>
      <div style="font-size:12.5px; margin-top:6px;">${escapeHtml(f.reason)}</div>
      <div style="font-size:12.5px; margin-top:6px; color:var(--ink-soft);">${escapeHtml(f.summary)}
        <span class="badge neutral" style="margin-left:4px;">${f.summary_source === 'hindsight' ? 'Hindsight reflect across her calls' : 'from call records'}</span></div>
      ${careTimeline(f.timeline)}
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;">
        <input id="careNote_${f.id}" placeholder="What you checked and what happens next" maxlength="500" style="flex:1; min-width:220px; padding:7px 10px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:var(--radius); font-family:inherit;">
        <button class="btn sm" onclick="careReview('${f.id}')">Mark reviewed</button>
        <button class="btn sm primary" onclick="dashRing('${f.helper_id}')">Ring her</button>
      </div>
      <div id="careErr_${f.id}" style="font-size:12px; color:var(--rust, #A6453A); margin-top:4px;"></div>
    </div>`).join('')}
  </div>`;
}

async function careReview(flagId){
  const input = document.getElementById('careNote_' + flagId);
  const err = document.getElementById('careErr_' + flagId);
  const note = input ? String(input.value || '').trim() : '';
  try {
    const r = await fetch('/api/care/safety/' + encodeURIComponent(flagId) + '/review', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({note})});
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Could not save the review.');
    if(typeof log === 'function') log('decision', 'DECISION AGENT', `Safety check reviewed for ${d.helper_name}.`);
    Object.keys(careHelperSafety).forEach(k => delete careHelperSafety[k]);
    careSafetyAt = 0;
    careLoadSafety();
  } catch(e){ if(err) err.textContent = e.message; }
}

function careWireDashboard(){}

/* ------------------------------------------------------------------ safety: helper page */

async function careLoadHelper(helperId){
  const prev = careHelperSafety[helperId];
  careHelperSafety[helperId] = {loading: true, at: Date.now(), data: prev && prev.data};
  let data;
  try {
    const r = await fetch('/api/care/safety/' + encodeURIComponent(helperId));
    data = r.ok ? await r.json() : {error: 'Could not load safety history.'};
  } catch(e){ data = {error: e.message}; }
  careHelperSafety[helperId] = {loading: false, at: Date.now(), data};
  careRerender('helperDetail');
}

function careHelperPanel(helperId){
  const entry = careHelperSafety[helperId];
  if(!entry || (!entry.loading && Date.now() - entry.at > 15000)) careLoadHelper(helperId);
  const d = entry && entry.data;
  let body;
  if(!d) body = '<div style="font-size:12.5px; color:var(--ink-soft);">Loading…</div>';
  else if(d.error) body = `<div style="font-size:12.5px; color:var(--ink-soft);">${escapeHtml(d.error)}</div>`;
  else if(!d.signals.length) body = '<div style="font-size:12.5px; color:var(--ink-soft);">No safety concerns raised on any call.</div>';
  else {
    const open = d.flags.find(f => f.status === 'open');
    const last = d.flags.find(f => f.status === 'reviewed');
    body = `${open ? `<div style="font-size:12.5px;"><span class="badge bad">Safety check open</span> ${escapeHtml(open.reason)}</div>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:4px;">${escapeHtml(open.summary)}</div>`
      : last ? `<div style="font-size:12.5px;"><span class="badge ok">Reviewed ${escapeHtml(String(last.reviewed_at || '').slice(0, 10))}</span> ${escapeHtml(last.review_note || '')}</div>`
      : '<div style="font-size:12.5px; color:var(--ink-soft);">Mentioned on a call, below the threshold for a check (the same concern on 2+ calls in 60 days, or at once for harm or confinement).</div>'}
      ${careTimeline(d.signals)}`;
  }
  return `<div class="section" style="margin-top:20px;">
    <h2>Safety across calls</h2>
    <div class="card"><div style="font-size:11.5px; color:var(--ink-soft); margin-bottom:8px;">Private to the coordinator. What she has said herself about pay, hours, being able to leave, or how she is treated.</div>${body}</div>
  </div>`;
}

function careWireHelper(){}

/* ------------------------------------------------------------------ handover brief: household page */

function careBriefState(householdId){
  if(!careBriefs[householdId]){
    const hh = S.households.find(x => x.id === householdId);
    const fit = hh && S.helpers.find(h => (h.skills || []).includes(hh.requirement));
    careBriefs[householdId] = {helper: (fit || S.helpers[0] || {}).id || '', lang: 'en', loading: false, data: null, error: ''};
  }
  return careBriefs[householdId];
}

function careBriefText(d){
  const titles = CARE_SECTION_TITLES[d.lang] || CARE_SECTION_TITLES.en;
  return Object.keys(titles).filter(k => (d.sections[k] || []).length)
    .map(k => titles[k] + ':\n' + d.sections[k].map(x => '- ' + x).join('\n')).join('\n\n');
}

function careBriefHtml(householdId){
  const st = careBriefState(householdId);
  if(st.loading) return '<div style="font-size:12.5px; color:var(--ink-soft); margin-top:12px;">Asking Hindsight what the agency knows about this household…</div>';
  if(st.error) return `<div style="font-size:12.5px; color:var(--rust, #A6453A); margin-top:12px;">${escapeHtml(st.error)}</div>`;
  const d = st.data;
  if(!d) return '';
  const titles = CARE_SECTION_TITLES[d.lang] || CARE_SECTION_TITLES.en;
  // Non-Latin scripts encode to very long links; keep the shared text to a size WhatsApp accepts.
  const shareText = ('Handover brief for ' + d.helper_name + ' — ' + d.household_name + '\n\n' + careBriefText(d)).slice(0, d.lang === 'en' ? 3000 : 900);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(shareText);
  const empty = Object.keys(titles).every(k => !(d.sections[k] || []).length);
  return `<div style="margin-top:14px;">
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
      <span class="badge ${d.source === 'hindsight' ? 'ok' : 'warn'}">${d.source === 'hindsight' ? 'From Hindsight memory' + (d.mental_model_used ? ' + standing profile' : '') : 'From local records'}</span>
      <span style="font-size:12px; color:var(--ink-soft);">For ${escapeHtml(d.helper_name)}. Previous helpers are never named.</span>
    </div>
    ${d.note ? `<div style="font-size:12px; color:var(--ink-soft); margin-bottom:8px;">${escapeHtml(d.note)}</div>` : ''}
    ${empty ? emptyState('Nothing on record yet', 'The agency has no memory about this household to brief from.') : Object.keys(titles).filter(k => (d.sections[k] || []).length).map(k => `
      <div style="margin-bottom:10px;"><div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--brass-dark, #8F6A2E); margin-bottom:3px;">${escapeHtml(titles[k])}</div>
        <ul style="margin:0; padding-left:18px; font-size:13px; line-height:1.5;">${d.sections[k].map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`).join('')}
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
      <button class="btn sm primary" id="careSpeakBtn">${careSpeaking ? 'Stop' : 'Read aloud'}</button>
      <a class="btn sm" href="${wa}" target="_blank" rel="noopener">Share on WhatsApp</a>
      <button class="btn sm" id="careGivenBtn" ${st.given ? 'disabled' : ''}>${st.given ? 'Recorded in memory' : 'Mark as given to ' + escapeHtml(d.helper_name.split(' ')[0])}</button>
    </div>
    ${st.speakNote ? `<div style="font-size:12px; color:var(--ink-soft); margin-top:6px;">${escapeHtml(st.speakNote)}</div>` : ''}
    ${d.cited && d.cited.length ? `<details style="margin-top:10px; font-size:12px;"><summary>Based on ${d.cited.length} memor${d.cited.length === 1 ? 'y' : 'ies'} (coordinator view)</summary>
      <ul style="padding-left:18px; color:var(--ink-soft);">${d.cited.map(c => `<li>${c.when ? '<b>' + escapeHtml(c.when) + '</b> ' : ''}${escapeHtml(c.text)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

function careHouseholdPanel(householdId){
  const st = careBriefState(householdId);
  return `<div class="section" style="margin-top:20px;">
    <h2>Handover brief for the next helper</h2>
    <div class="card">
      <div style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Turns what the agency remembers about this household into a short spoken briefing, so the next helper does not repeat what went wrong before.</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <select id="careBriefHelper">${S.helpers.map(h => `<option value="${h.id}" ${h.id === st.helper ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}</select>
        <select id="careBriefLang">${CARE_LANGS.map(([v, label]) => `<option value="${v}" ${v === st.lang ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <button class="btn sm primary" id="careBriefBtn" ${st.loading ? 'disabled' : ''}>Prepare brief</button>
      </div>
      <div id="careBriefOut">${careBriefHtml(householdId)}</div>
    </div>
  </div>`;
}

async function careLoadBrief(householdId){
  const st = careBriefState(householdId);
  st.loading = true; st.error = ''; st.data = null; st.given = false; st.speakNote = '';
  careRerender('householdDetail');
  try {
    const r = await fetch('/api/care/handover/' + encodeURIComponent(householdId) + '?helper=' + encodeURIComponent(st.helper) + '&lang=' + encodeURIComponent(st.lang));
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Could not prepare the brief.');
    st.data = d;
    if(typeof log === 'function') log('mem', 'MEMORY AGENT', `Handover brief prepared for ${d.helper_name} at ${d.household_name}.`);
  } catch(e){ st.error = e.message; }
  st.loading = false;
  careRerender('householdDetail');
}

function careSpeak(householdId){
  const st = careBriefState(householdId);
  const synth = typeof window !== 'undefined' && window.speechSynthesis;
  if(!synth || !st.data) return;
  if(careSpeaking){ synth.cancel(); careSpeaking = false; careRerender('householdDetail'); return; }
  const tag = (CARE_LANGS.find(l => l[0] === st.data.lang) || CARE_LANGS[0])[2];
  const u = new SpeechSynthesisUtterance(careBriefText(st.data).replace(/^- /gm, ''));
  u.lang = tag;
  const voices = synth.getVoices() || [];
  const voice = voices.find(v => v.lang === tag) || voices.find(v => String(v.lang).startsWith(tag.slice(0, 2))) || (st.data.lang === 'en' ? voices.find(v => /^en/.test(v.lang)) : null);
  // An English voice cannot read Telugu or Hindi script; say so instead of reading nonsense.
  if(!voice && st.data.lang !== 'en'){ st.speakNote = 'This browser has no ' + (st.data.lang === 'te' ? 'Telugu' : 'Hindi') + ' voice installed. Share the brief on WhatsApp, or read it out.'; careRerender('householdDetail'); return; }
  if(voice) u.voice = voice;
  u.onend = u.onerror = () => { careSpeaking = false; careRerender('householdDetail'); };
  synth.cancel();
  careSpeaking = true;
  synth.speak(u);
  careRerender('householdDetail');
}

function careWireHousehold(householdId){
  const st = careBriefState(householdId);
  const helperSel = document.getElementById('careBriefHelper');
  const langSel = document.getElementById('careBriefLang');
  const btn = document.getElementById('careBriefBtn');
  const speak = document.getElementById('careSpeakBtn');
  if(helperSel) helperSel.onchange = () => { st.helper = helperSel.value; };
  if(langSel) langSel.onchange = () => { st.lang = langSel.value; };
  if(btn) btn.onclick = () => careLoadBrief(householdId);
  if(speak) speak.onclick = () => careSpeak(householdId);
  const given = document.getElementById('careGivenBtn');
  if(given) given.onclick = async () => {
    given.disabled = true;
    try {
      const r = await fetch('/api/care/handover/' + encodeURIComponent(householdId) + '/given', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({helper: st.data.helper_id})});
      if(!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not record it.');
      st.given = true;
      if(typeof log === 'function') log('mem', 'MEMORY AGENT', `Handover brief given to ${st.data.helper_name}; retained to Hindsight.`);
    } catch(e){ st.error = e.message; }
    careRerender('householdDetail');
  };
}
