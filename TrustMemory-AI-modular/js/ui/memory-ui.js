/* =========================================================================
   ui/memory-ui.js — live Hindsight widgets shared by helper, household,
   insights, matching and memory pages. Everything here reads the real bank
   through /api/memory/*; nothing is simulated.
   ========================================================================= */

const MEMUI = { cache: {} };

function memuiKey(kind, id, extra){ return kind + ':' + (id || '') + ':' + (extra || ''); }

async function memuiFetch(url){
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function memuiDate(s){ return s ? String(s).slice(0, 10) : ''; }

function memuiClean(text){ return escapeHtml(String(text || '').split(' | ')[0]); }

/* ------------------------------------------------------------------ observations */

function renderObservationsBlock(kind, id, opts){
  opts = opts || {};
  const key = memuiKey('obs', kind, id);
  const st = MEMUI.cache[key];
  const title = opts.title || 'What the agency has learned';
  let body;
  if(!st){
    MEMUI.cache[key] = {status:'loading'};
    memuiLoadObservations(kind, id);
    body = `<div style="font-size:12.5px; color:var(--ink-soft);">Reading observations from Hindsight…</div>`;
  } else if(st.status === 'loading'){
    body = `<div style="font-size:12.5px; color:var(--ink-soft);">Reading observations from Hindsight…</div>`;
  } else if(st.status === 'error'){
    body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(st.error)}</div>`;
  } else if(!st.items.length){
    body = `<div style="font-size:12.5px; color:var(--ink-soft);">No consolidated observations yet. Hindsight forms them in the background as facts accumulate.</div>`;
  } else {
    body = `<ul style="margin:0; padding-left:18px; font-size:12.5px; line-height:1.6;">${st.items.map(o => `<li style="margin-bottom:6px;">${memuiClean(o.text)}${memuiObsMeta(o)}${o.id ? memuiHistoryHtml(o.id) : ''}</li>`).join('')}</ul>`;
  }
  return `<div class="card" style="border-left:3px solid var(--brass);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft);">${escapeHtml(title)}</div>
      <span class="badge neutral">Hindsight observations · consolidated beliefs with evidence</span>
    </div>
    ${body}
  </div>`;
}

async function memuiLoadObservations(kind, id){
  const key = memuiKey('obs', kind, id);
  try {
    const q = id ? `?${kind}=${encodeURIComponent(id)}&limit=8` : '?limit=14';
    const d = await memuiFetch('/api/memory/observations' + q);
    MEMUI.cache[key] = {status:'ok', items: d.observations || []};
  } catch(e){
    MEMUI.cache[key] = {status:'error', error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/** One row under a belief: its source facts (expandable) and how it formed. */
function memuiObsMeta(o){
  const ev = o.evidence && o.evidence.length
    ? `<details><summary style="cursor:pointer; font-size:10.5px; color:var(--teal); font-weight:600;">based on ${o.evidence.length} fact${o.evidence.length === 1 ? '' : 's'}</summary><ul style="margin:2px 0 4px; padding-left:16px; font-size:11.5px; color:var(--ink-soft);">${o.evidence.map(e => `<li>${memuiClean(e.text)}${e.when ? ` (${memuiDate(e.when)})` : ''}</li>`).join('')}</ul></details>`
    : '';
  const hist = o.id
    ? `<button type="button" data-hist="${escapeHtml(o.id)}" style="border:0; background:none; padding:0; cursor:pointer; font-size:10.5px; color:var(--brass-dark); font-weight:600; font-family:inherit;">${MEMUI.hist[o.id] && MEMUI.hist[o.id].open ? 'hide how it formed' : 'how it formed'}</button>`
    : '';
  if(!ev && !hist) return '';
  return `<div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; margin-top:1px;">${ev}${hist}</div>`;
}

/* ------------------------------------------------------------------ how a belief formed (observation history) */

MEMUI.hist = {};

/** Each earlier version of the belief and the new facts that made Hindsight revise it, oldest first. */
function memuiHistoryHtml(id){
  const st = MEMUI.hist[id];
  if(!st || !st.open) return '';
  const box = inner => `<div style="margin:6px 0 8px; padding:8px 10px; border-left:2px solid var(--brass); background:var(--paper-dim); border-radius:4px; font-size:11.5px; line-height:1.5; color:var(--ink-soft);">${inner}</div>`;
  if(st.status === 'loading') return box('Reading how this belief formed…');
  if(st.status === 'error') return box(`<span style="color:var(--rust);">${escapeHtml(st.error)}</span>`);
  const d = st.data;
  const count = d.current.proof_count ? ` from ${d.current.proof_count} fact${d.current.proof_count === 1 ? '' : 's'}` : '';
  if(!d.steps.length) return box(`Formed${count}${d.first_formed ? ' on ' + memuiDate(d.first_formed) : ''} and not revised since.`);
  const steps = d.steps.map((s, i) => `<div style="margin-top:${i ? 8 : 0}px;"><b style="color:var(--ink);">${i ? 'Then' : 'At first'}${s.since ? ' (' + memuiDate(s.since) + ')' : ''}:</b> ${memuiClean(s.text)}
      ${s.added.length ? `<div style="margin-top:2px;">Revised${s.revised_at ? ' on ' + memuiDate(s.revised_at) : ''} after ${s.added.length} new fact${s.added.length === 1 ? '' : 's'}:<ul style="margin:2px 0 0; padding-left:16px;">${s.added.map(a => `<li>${memuiClean(a)}</li>`).join('')}</ul></div>` : ''}</div>`).join('');
  return box(`${steps}<div style="margin-top:8px;"><b style="color:var(--ink);">Now${count}:</b> ${memuiClean(d.current.text)}</div>`);
}

async function memuiToggleHistory(id){
  const st = MEMUI.hist[id];
  if(st && st.status !== 'error'){ st.open = !st.open; renderCurrentPage(); return; }
  MEMUI.hist[id] = {open: true, status: 'loading'};
  renderCurrentPage();
  try {
    MEMUI.hist[id] = {open: true, status: 'ok', data: await memuiFetch('/api/memory/observations/' + encodeURIComponent(id) + '/history')};
  } catch(e){ MEMUI.hist[id] = {open: true, status: 'error', error: e.message}; }
  renderCurrentPage();
}

// Delegated, so it works on every page that shows observations without per-page wiring.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-hist]');
  if(b){ e.preventDefault(); memuiToggleHistory(b.dataset.hist); }
});

/* ------------------------------------------------------------------ standing profile (mental model) */

/** Small, safe Markdown for Hindsight's standing profiles: escape first, then headings, bold, bullets. */
function memuiMarkdown(text){
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, '$1<i>$2</i>');
  const out = [];
  let list = null;
  const close = () => { if(list){ out.push('</ul>'); list = null; } };
  for(const raw of escapeHtml(String(text || '')).split(/\r?\n/)){
    const line = raw.trimEnd();
    const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
    const li = line.match(/^(\s*)[*-]\s+(.*)$/);
    if(h){ close(); out.push(`<div class="mm-h${Math.min(h[1].length, 3)}">${inline(h[2])}</div>`); }
    else if(li){ if(!list){ out.push('<ul>'); list = true; } out.push(`<li class="${li[1].length >= 2 ? 'sub' : ''}">${inline(li[2])}</li>`); }
    else if(!line.trim()){ close(); }
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('');
}

function renderMentalModelBlock(kind, id){
  const key = memuiKey('mm', kind, id);
  const st = MEMUI.cache[key];
  if(!st){ MEMUI.cache[key] = {status:'loading'}; memuiLoadMentalModel(kind, id); }
  const cur = MEMUI.cache[key];
  let body;
  if(cur.status === 'loading') body = `<div style="font-size:12.5px; color:var(--ink-soft);">Reading the standing profile…</div>`;
  else if(cur.status === 'error') body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(cur.error)}</div>`;
  else if(!cur.content) body = `<div style="font-size:12.5px; color:var(--ink-soft);">Not written yet. Hindsight writes this page once enough memories exist, and rewrites it as new calls are retained.</div>`;
  else body = `<div class="mm-body">${memuiMarkdown(cur.content)}</div>${cur.updated_at ? `<div style="font-size:11px; color:var(--ink-faint); margin-top:6px;">Last rewritten by Hindsight: ${escapeHtml(memuiDate(cur.updated_at))}</div>` : ''}`;
  return `<div class="card" style="border-left:3px solid var(--teal);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft);">${escapeHtml(cur.name || (kind === 'helper' ? 'How to coach this helper' : 'What this household expects'))}</div>
      <span class="badge neutral">Hindsight mental model · a standing answer kept current</span>
    </div>
    ${body}
  </div>`;
}

async function memuiLoadMentalModel(kind, id){
  const key = memuiKey('mm', kind, id);
  try {
    const d = await memuiFetch(`/api/memory/mental-model?${kind}=${encodeURIComponent(id)}`);
    MEMUI.cache[key] = {status:'ok', name: d.name, content: d.content || '', updated_at: d.updated_at};
  } catch(e){
    MEMUI.cache[key] = {status:'error', error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* ------------------------------------------------------------------ brief me (reflect) */

function renderBriefBlock(kind, id){
  const key = memuiKey('brief', kind, id);
  const st = MEMUI.cache[key];
  let body;
  if(!st) body = `<button class="btn sm brass" onclick="memuiBrief('${kind}','${id}')">🧠 Brief me before this ${kind === 'helper' ? 'call' : 'placement'}</button>
    <div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Asks Hindsight to reflect over everything on record and answer with sources.</div>`;
  else if(st.status === 'loading') body = `<div style="font-size:12.5px; color:var(--ink-soft);">Hindsight is reflecting… (it reads the standing profile first, then observations, then raw facts)</div>`;
  else if(st.status === 'error') body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(st.error)}</div> <button class="btn sm" onclick="memuiBrief('${kind}','${id}')">Retry</button>`;
  else body = `<div style="font-size:13px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(st.text)}</div>
    <div style="font-size:11px; color:var(--ink-faint); margin-top:8px;">Sources: ${st.models.length ? 'standing profile (' + escapeHtml(st.models.join(', ')) + ')' : ''}${st.models.length && st.directives.length ? ' · ' : ''}${st.directives.length ? 'directives obeyed: ' + escapeHtml(st.directives.join(', ')) : ''}${st.cited.length ? ' · ' + st.cited.length + ' memories' : ''}</div>
    ${st.cited.length ? `<ul style="margin:6px 0 0; padding-left:18px; font-size:11.5px; color:var(--ink-soft);">${st.cited.slice(0,6).map(c => `<li>${memuiClean(c.text)} <span style="color:var(--ink-faint);">(${memuiDate(c.when)})</span></li>`).join('')}</ul>` : ''}
    <button class="btn sm" style="margin-top:8px;" onclick="memuiBrief('${kind}','${id}')">Refresh</button>`;
  return `<div class="card" style="border-left:3px solid var(--ink);">
    <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft); margin-bottom:8px;">Coordinator briefing · Hindsight reflect</div>
    ${body}
  </div>`;
}

async function memuiBrief(kind, id){
  const key = memuiKey('brief', kind, id);
  MEMUI.cache[key] = {status:'loading'};
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  try {
    const d = await memuiFetch(`/api/memory/brief?${kind}=${encodeURIComponent(id)}`);
    MEMUI.cache[key] = {status:'ok', text: d.text, cited: d.cited || [], models: d.mental_models || [], directives: d.directives || []};
    log('ref', 'REFLECTION AGENT', `Briefed the coordinator on ${labelFor(id)} via Hindsight reflect (${(d.cited || []).length} memories, ${(d.mental_models || []).length} standing profile, ${(d.directives || []).length} directives).`);
  } catch(e){
    MEMUI.cache[key] = {status:'error', error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* ------------------------------------------------------------------ bank stats + directives + mental models (explorer) */

function renderBankStats(){
  const key = 'stats';
  const st = MEMUI.cache[key];
  if(!st){ MEMUI.cache[key] = {status:'loading'}; memuiLoad(key, '/api/memory/stats', d => ({status:'ok', stats:d})); }
  const cur = MEMUI.cache[key];
  if(cur.status !== 'ok' || !cur.stats) return `<div class="card" style="font-size:12.5px; color:var(--ink-soft);">${cur.status === 'error' ? escapeHtml(cur.error) : 'Reading bank statistics…'}</div>`;
  const s = cur.stats; const t = s.nodes_by_fact_type || {}; const l = s.links_by_link_type || {};
  const tile = (n, label) => `<div class="metric"><div class="label">${label}</div><div class="num">${n || 0}</div></div>`;
  return `<div class="grid g3" style="margin-bottom:12px;">${tile(t.world, 'World facts')}${tile(t.experience, 'Experiences')}${tile(t.observation, 'Observations')}</div>
    <div class="grid g3">${tile(s.total_documents, 'Documents retained')}${tile(l.temporal, 'Temporal links')}${tile(l.entity, 'Entity links')}</div>
    <div style="font-size:11px; color:var(--ink-faint); margin-top:6px;">Bank <code>${escapeHtml(s.bank_id || '')}</code> · ${s.total_nodes || 0} memory nodes, ${s.total_links || 0} links between them.</div>`;
}

function renderDirectivesBlock(){
  const key = 'directives';
  const st = MEMUI.cache[key];
  if(!st){ MEMUI.cache[key] = {status:'loading'}; memuiLoad(key, '/api/memory/directives', d => ({status:'ok', items: d.directives || []})); }
  const cur = MEMUI.cache[key];
  let body;
  if(cur.status === 'loading') body = `<div style="font-size:12.5px; color:var(--ink-soft);">Reading directives…</div>`;
  else if(cur.status === 'error') body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(cur.error)}</div>`;
  else if(!cur.items.length) body = `<div style="font-size:12.5px; color:var(--ink-soft);">No directives yet.</div>`;
  else body = cur.items.map(d => `<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; padding:8px 0; border-top:1px solid var(--line);">
      <div><div style="font-size:13px; font-weight:600;">${escapeHtml(d.name)}</div><div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">${escapeHtml(d.content)}</div></div>
      <button class="btn sm" onclick="memuiToggleDirective('${d.id}', ${d.is_active === false ? 'true' : 'false'})">${d.is_active === false ? 'Enable' : 'Disable'}</button>
    </div>`).join('');
  return `<div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft);">Directives · rules every reflect and call must obey</div><span class="badge neutral">${cur.items ? cur.items.length : 0}</span></div>
    ${body}
    <form onsubmit="memuiAddDirective(event)" style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
      <input id="dirName" placeholder="Rule name" required style="flex:0 0 160px;">
      <input id="dirContent" placeholder="Rule the agent must always follow" required style="flex:1; min-width:220px;">
      <button class="btn sm brass" type="submit">Add directive</button>
    </form>
  </div>`;
}

async function memuiToggleDirective(id, active){
  try {
    await fetch('/api/memory/directives/' + encodeURIComponent(id), {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({is_active: active})});
    delete MEMUI.cache.directives;
  } catch(e){}
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function memuiAddDirective(ev){
  ev.preventDefault();
  const name = document.getElementById('dirName').value.trim();
  const content = document.getElementById('dirContent').value.trim();
  if(!name || !content) return;
  try {
    const res = await fetch('/api/memory/directives', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, content})});
    const d = await res.json().catch(() => ({}));
    log('mem', 'MEMORY AGENT', res.ok ? `Coordinator added directive "${name}" to the bank.` : (d.error || 'Could not add the directive.'));
    delete MEMUI.cache.directives;
  } catch(e){}
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function renderRecallSearch(){
  const st = MEMUI.cache.search || {};
  return `<div class="card">
    <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft); margin-bottom:8px;">Recall · ask the bank anything</div>
    <form onsubmit="memuiSearch(event)" style="display:flex; gap:8px; flex-wrap:wrap;">
      <input id="recallQ" placeholder="e.g. who asked not to be called in the morning?" value="${escapeHtml(st.q || '')}" style="flex:1; min-width:240px;">
      <select id="recallScope" style="flex:0 0 200px;"><option value="">Whole agency</option>${S.helpers.map(h => `<option value="helper=${h.id}" ${st.scope === 'helper=' + h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}${S.households.map(h => `<option value="household=${h.id}" ${st.scope === 'household=' + h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}</select>
      <button class="btn sm primary" type="submit">Recall</button>
    </form>
    ${st.status === 'loading' ? `<div style="font-size:12.5px; color:var(--ink-soft); margin-top:8px;">Recalling…</div>` : ''}
    ${st.status === 'error' ? `<div style="font-size:12.5px; color:var(--rust); margin-top:8px;">${escapeHtml(st.error)}</div>` : ''}
    ${st.status === 'ok' ? (st.facts.length ? `<div style="font-size:11px; color:var(--ink-faint); margin:8px 0 4px;">${st.facts.length} results · semantic + keyword + graph + temporal retrieval, fused and reranked by Hindsight</div><ul style="margin:0; padding-left:18px; font-size:12.5px; line-height:1.6;">${st.facts.map(f => `<li><span class="badge neutral" style="font-size:10px;">${escapeHtml(f.type || 'fact')}</span> ${memuiClean(f.text)} <span style="color:var(--ink-faint); font-size:11px;">(${memuiDate(f.mentionedAt)})</span></li>`).join('')}</ul>` : `<div style="font-size:12.5px; color:var(--ink-soft); margin-top:8px;">Nothing recalled for that.</div>`) : ''}
  </div>`;
}

async function memuiSearch(ev){
  ev.preventDefault();
  const q = document.getElementById('recallQ').value.trim();
  const scope = document.getElementById('recallScope').value;
  if(!q) return;
  MEMUI.cache.search = {status:'loading', q, scope};
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  try {
    const d = await memuiFetch('/api/memory/recall?q=' + encodeURIComponent(q) + (scope ? '&' + scope : ''));
    MEMUI.cache.search = {status:'ok', q, scope, facts: d.facts || []};
    log('mem', 'MEMORY AGENT', `Recall: "${q}" returned ${(d.facts || []).length} memories from bank ${d.bank}.`);
  } catch(e){
    MEMUI.cache.search = {status:'error', q, scope, error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function memuiLoad(key, url, map){
  try { MEMUI.cache[key] = map(await memuiFetch(url)); }
  catch(e){ MEMUI.cache[key] = {status:'error', error: e.message}; }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* ------------------------------------------------------------------ matching (memory-backed) */

let matchMem = {status:null, data:null};

async function memuiFindMatches(householdId, role){
  matchMem = {status:'loading', data:null};
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  try {
    const d = await memuiFetch(`/api/memory/match?household=${encodeURIComponent(householdId)}&role=${encodeURIComponent(role)}`);
    matchMem = {status:'ok', data:d};
    log('match', 'MATCHING AGENT', `Ranked ${d.candidates.length} candidates for ${d.household.name} (${roleLabel(role)}) on recalled memory (${d.source}). Top: ${d.candidates[0] ? d.candidates[0].helper.name : 'none'}.`);
  } catch(e){
    matchMem = {status:'error', error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* Friction check: both people's memory, read before a placement starts. */
const frictionMem = {}; // "<helper>|<household>" -> {status, data, error}

async function memuiCheckFriction(helperId, householdId){
  const key = helperId + '|' + householdId;
  frictionMem[key] = {status:'loading'};
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  try {
    const d = await memuiFetch(`/api/friction?helper=${encodeURIComponent(helperId)}&household=${encodeURIComponent(householdId)}`);
    frictionMem[key] = {status:'ok', data:d};
    log('match', 'MATCHING AGENT', `Friction check for ${d.helper_name} at ${d.household_name}: ${d.points.length} point${d.points.length === 1 ? '' : 's'} (${d.source}).`);
  } catch(e){
    frictionMem[key] = {status:'error', error: e.message};
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function renderFrictionBlock(helperId, householdId){
  const f = frictionMem[helperId + '|' + householdId];
  const btn = label => `<button class="btn sm" style="margin-top:10px;" onclick="memuiCheckFriction('${escapeHtml(helperId)}','${escapeHtml(householdId)}')">${label}</button>`;
  if(!f) return btn('Check friction');
  if(f.status === 'loading') return `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:10px;">Reading both memories for likely friction…</div>`;
  if(f.status === 'error') return `<div style="font-size:11.5px; color:var(--rust); margin-top:10px;">${escapeHtml(f.error)}</div>${btn('Try again')}`;
  const d = f.data;
  const side = (who, fact, when) => `<div style="flex:1; min-width:0; background:var(--paper); border:1px solid var(--line); border-radius:var(--radius); padding:6px 8px;">
      <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--ink-faint);">${who}${when ? ' · ' + escapeHtml(when) : ''}</div>
      <div style="font-size:11.5px; line-height:1.45;">${escapeHtml(fact)}</div></div>`;
  const points = d.points.length ? d.points.map(p => `<div style="border-top:1px solid var(--line); padding-top:8px; margin-top:8px;">
      <div style="display:flex; gap:6px;">${side('Her side', p.helper_fact, p.helper_date)}${side('Household', p.household_fact, p.household_date)}</div>
      <div style="font-size:11.5px; margin-top:5px;"><b>Why it clashes:</b> ${escapeHtml(p.clash)}</div>
      ${p.fix ? `<div style="font-size:11.5px; margin-top:2px;"><b>Agree before day one:</b> ${escapeHtml(p.fix)}</div>` : ''}
    </div>`).join('') : `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">No clear friction on record.</div>`;
  return `<div style="margin-top:12px; border:1px solid var(--line-strong); border-radius:var(--radius); padding:10px 12px; background:var(--card);">
    <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap;">
      <div style="font-size:12px; font-weight:600;">Friction check with ${escapeHtml(d.household_name)}</div>
      <span class="badge ${d.source === 'hindsight' ? 'ok' : 'warn'}">${d.source === 'hindsight' ? 'From Hindsight memory' : 'From local records'}</span>
    </div>
    ${d.summary ? `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:4px;">${escapeHtml(d.summary)}</div>` : ''}
    ${d.note ? `<div style="font-size:11px; color:var(--ink-faint); margin-top:4px;">${escapeHtml(d.note)}</div>` : ''}
    ${points}
    ${d.based_on && d.based_on.length ? `<div style="font-size:10.5px; color:var(--ink-faint); margin-top:8px;">Based on ${d.based_on.length} memor${d.based_on.length === 1 ? 'y' : 'ies'} from both records.</div>` : ''}
  </div>`;
}

function renderMatchResults(){
  if(matchMem.status === 'loading') return `<div class="card" style="font-size:12.5px; color:var(--ink-soft);">Recalling household expectations and every candidate's history from Hindsight…</div>`;
  if(matchMem.status === 'error') return `<div class="card" style="font-size:12.5px; color:var(--rust);">${escapeHtml(matchMem.error)}</div>`;
  if(matchMem.status !== 'ok') return emptyState('No search run yet.', 'Choose a household and role above and click "Find best match".');
  const d = matchMem.data; const top = d.candidates[0];
  const evidence = (list) => list.length ? `<ul style="margin:6px 0 0; padding-left:18px; font-size:11.5px; color:var(--ink-soft); line-height:1.5;">${list.slice(0,4).map(e => `<li>${memuiClean(e.text)} <span style="color:var(--ink-faint);">(${memuiDate(e.when)})</span></li>`).join('')}</ul>` : `<div style="font-size:11.5px; color:var(--ink-faint); margin-top:4px;">No memory on record.</div>`;
  return `
  <div class="section">
    <h2>What the household expects <span class="badge neutral" style="margin-left:6px;">recalled from Hindsight</span></h2>
    <div class="card">${evidence(d.household_evidence)}</div>
  </div>
  <div class="section">
    <h2>Recommended match</h2>
    <div class="candidate top" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div><div class="rank">Recommended</div><div class="mname">${escapeHtml(top.helper.name)}</div></div>
        <div class="mscore">${top.score}<span style="font-size:14px; color:var(--ink-soft);">/100</span></div>
      </div>
      <div class="facts"><div>Trust: <b>${top.trust}</b></div><div>Churn risk: <b>${top.churn}</b></div><div>Experience: <b>${top.helper.experience_years} yrs</b></div><div>Primary role: <b>${roleLabel(top.helper.role)}</b></div></div>
      <ul class="why-list">${(top.reasons.length ? top.reasons : ['Best available balance of role fit, trust and stability.']).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      <div class="hr"></div>
      <div style="font-size:11.5px; color:var(--ink-soft);"><b>Memory evidence for ${escapeHtml(top.helper.name)}</b>${evidence(top.evidence)}</div>
      ${renderFrictionBlock(top.helper.id, d.household.id)}
    </div>
  </div>
  <div class="section">
    <h2>Other candidates</h2>
    <div class="grid g3">
      ${d.candidates.slice(1,4).map((r, i) => `<div class="candidate">
        <div class="rank">Candidate ${i+2}</div><div class="mname">${escapeHtml(r.helper.name)}</div>
        <div class="mscore" style="font-size:20px;">${r.score}<span style="font-size:12px; color:var(--ink-soft);">/100</span></div>
        <div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">${escapeHtml(r.reasons.join(' '))}</div>
        ${evidence(r.evidence)}
        ${renderFrictionBlock(r.helper.id, d.household.id)}
      </div>`).join('')}
    </div>
  </div>`;
}


/* ------------------------------------------------------------------ who should I call today? (reflect across the whole bank) */

function renderWhoToCall(){
  const st = MEMUI.cache.whoToCall;
  let body;
  if(!st) body = `<button class="btn sm brass" onclick="memuiWhoToCall()">🧠 Ask Hindsight who to call today</button>
    <div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Reflects over every helper's memory: follow-ups due, commitments to check, recent problems, and times not to call.</div>`;
  else if(st.status === 'loading') body = `<div style="font-size:12.5px; color:var(--ink-soft);">Hindsight is reflecting across the agency's memory…</div>`;
  else if(st.status === 'error') body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(st.error)}</div> <button class="btn sm" onclick="memuiWhoToCall()">Retry</button>`;
  else body = (st.calls.length ? st.calls.map(c => `<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; padding:8px 0; border-top:1px solid var(--line);">
        <div><div style="font-size:13px; font-weight:600;">${escapeHtml(c.helper_name)} <span style="font-weight:400; color:var(--ink-soft); font-size:11.5px;">· ${escapeHtml(c.best_time || '')}</span></div><div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">${escapeHtml(c.reason)}</div></div>
        <button class="btn sm primary" onclick="startCall('coaching', '${c.helper_id}')">Ring</button>
      </div>`).join('') : `<div style="font-size:12.5px;">${escapeHtml(st.text || 'Nobody needs a call today.')}</div>`)
    + `<div style="font-size:10.5px; color:var(--ink-faint); margin-top:6px;">Sources: ${st.sources.memories} memories${st.sources.mental_models.length ? ', standing profiles' : ''}${st.sources.directives.length ? ', directives obeyed: ' + escapeHtml(st.sources.directives.join(', ')) : ''}. <a style="cursor:pointer;" onclick="memuiWhoToCall()">Ask again</a></div>`;
  return `<div class="card" style="border-left:3px solid var(--brass); margin-bottom:20px;">
    <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft); margin-bottom:8px;">Who should I call today? · Hindsight reflect</div>
    ${body}
  </div>`;
}

async function memuiWhoToCall(){
  MEMUI.cache.whoToCall = {status:'loading'};
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
  try {
    const d = await memuiFetch('/api/memory/who-to-call');
    MEMUI.cache.whoToCall = {status:'ok', calls: d.calls || [], text: d.text || '', sources: d.sources || {memories:0, mental_models:[], directives:[]}};
    log('ref', 'REFLECTION AGENT', `Suggested ${ (d.calls || []).length } calls for today by reflecting over the agency's memory.`);
  } catch(e){ MEMUI.cache.whoToCall = {status:'error', error: e.message}; }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

/* ------------------------------------------------------------------ coordinator notes, retained to Hindsight */

async function memuiAddNote(ev, kind, id, inputId){
  ev.preventDefault();
  const input = document.getElementById(inputId);
  const text = (input && input.value || '').trim();
  if(!text) return;
  input.disabled = true;
  try {
    const res = await fetch('/api/memory/note', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[kind + '_id']: id, text})});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Could not save the note.');
    log('mem', 'MEMORY AGENT', d.retain && d.retain.status === 'ok' ? `Coordinator note about ${labelFor(id)} retained to Hindsight.` : `Note saved locally; Hindsight retain ${d.retain ? d.retain.status : 'skipped'}.`);
    input.value = '';
    delete MEMUI.cache[memuiKey('obs', kind, id)];
  } catch(e){
    log('mem', 'MEMORY AGENT', e.message);
  }
  input.disabled = false;
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}


/* ------------------------------------------------------------------ commitment ledger (helper page) */

function renderCommitmentsBlock(helperId){
  const key = memuiKey('ledger', 'helper', helperId);
  const st = MEMUI.cache[key];
  if(!st){ MEMUI.cache[key] = {status:'loading'}; memuiLoad(key, '/api/memory/commitments?helper=' + encodeURIComponent(helperId), d => ({status:'ok', data:d})); }
  const cur = MEMUI.cache[key];
  const names = {reassure_first:'Reassure first', listen_first:'Listen first', direct_problem_solving:'Straight to a fix', firm_reminder:'Firm reminder'};
  let body;
  if(cur.status === 'loading') body = `<div style="font-size:12.5px; color:var(--ink-soft);">Reading the ledger…</div>`;
  else if(cur.status === 'error') body = `<div style="font-size:12.5px; color:var(--rust);">${escapeHtml(cur.error)}</div>`;
  else {
    const d = cur.data; const s = d.stats; const w = d.what_works || {};
    const badge = st => st === 'kept' ? 'ok' : st === 'broken' ? 'bad' : st === 'open' ? 'warn' : 'neutral';
    body = `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="badge neutral">${s.kept_rate == null ? 'No outcomes yet' : `${s.kept}/${s.kept + s.broken} promises kept (${s.kept_rate}%)`}</span>
        <span class="badge neutral">${s.open} open</span>
        ${w.best ? `<span class="badge ok">What works: ${escapeHtml(names[w.best.approach] || w.best.approach)} (${w.best.kept}/${w.best.kept + w.best.broken})</span>` : ''}
        ${(w.avoid || []).map(a => `<span class="badge bad">Avoid: ${escapeHtml(names[a.approach] || a.approach)}</span>`).join('')}
      </div>
      ${d.commitments.length ? d.commitments.slice(0, 6).map(c => `<div style="font-size:12.5px; padding:6px 0; border-top:1px solid var(--line);">
        <span class="badge ${badge(c.status)}">${escapeHtml(c.status)}</span> ${escapeHtml(c.text)}
        <span style="color:var(--ink-faint); font-size:11px;">· promised ${escapeHtml(String(c.made_at).slice(0,10))}${c.resolved_at && c.status !== 'replaced' ? ', resolved ' + escapeHtml(String(c.resolved_at).slice(0,10)) : ''}${c.approach ? ' · after a "' + escapeHtml(names[c.approach] || c.approach) + '" call' : ''}</span>
        ${c.evidence && c.status !== 'replaced' ? `<div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">"${escapeHtml(c.evidence)}"</div>` : ''}
      </div>`).join('') : `<div style="font-size:12.5px; color:var(--ink-soft);">No promises recorded yet. They appear here after a call ends with a concrete commitment.</div>`}`;
  }
  return `<div class="card" style="border-left:3px solid var(--teal);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--ink-soft);">Commitment ledger · what she promised and whether she kept it</div>
      <span class="badge neutral">learned from call outcomes</span>
    </div>
    ${body}
  </div>`;
}
