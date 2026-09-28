/* =========================================================================
   agents/reflection-agent.js — household reflection through Hindsight reflect

   reflectOnHousehold() asks the server for a brief (GET /api/memory/brief),
   which runs Hindsight reflect over everything retained for the household and
   returns the answer with the memories it was based on. Nothing is invented
   here: if Hindsight is not configured the page says so.
   ========================================================================= */

async function reflectOnHousehold(householdId){
  const name = labelFor(householdId);
  log('ref', 'REFLECTION AGENT', `Asking Hindsight to reflect on ${name}.`);
  try {
    const res = await fetch('/api/memory/brief?household=' + encodeURIComponent(householdId));
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    const refl = {
      id: uid(),
      entityType: 'household',
      entityId: householdId,
      classification: 'REFLECT',
      insight: data.text || 'Hindsight returned no answer.',
      evidence: (data.cited || []).map(c => c.when ? `${c.text} (${fmtDate(c.when)})` : c.text),
      createdAt: nowStamp()
    };
    S.reflections = S.reflections.filter(r => r.entityId !== householdId);
    S.reflections.unshift(refl);
    log('ref', 'REFLECTION AGENT', `Hindsight reflected on ${name} using ${refl.evidence.length} cited memories.`);
  } catch(err){
    log('ref', 'REFLECTION AGENT', `Reflection for ${name} failed: ${err.message}`);
    if(typeof alert === 'function') alert('Reflection failed: ' + err.message);
  }
  if(typeof renderCurrentPage === 'function') renderCurrentPage();
}

function reflCard(r){
  return `<div class="card" style="margin-bottom:10px;">
    <span class="badge neutral">${escapeHtml(r.classification)}</span>
    <p style="margin-top:8px; font-size:13px; white-space:pre-line;">${escapeHtml(r.insight)}</p>
    ${r.evidence && r.evidence.length ? `<div class="hr"></div><div style="font-size:11.5px; color:var(--ink-soft);"><b>Based on</b><ul style="margin:6px 0 0; padding-left:16px;">${r.evidence.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}
