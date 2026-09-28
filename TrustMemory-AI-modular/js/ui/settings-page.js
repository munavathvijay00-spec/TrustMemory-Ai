/* =========================================================================
   ui/settings-page.js — live integration status from GET /api/health
   ========================================================================= */

function pageSettings(){
  return `<div class="pagehead"><div class="eyebrow">Settings</div><h1>Environment</h1><div class="lede">Keys live in the server's .env file and are never sent to the browser. This page shows what the running server reports.</div></div>
  <div class="card" id="settingsStatus">
    ${settingsRow('Server', 'Checking…', 'neutral')}
  </div>
  <div class="card" style="margin-top:14px; font-size:12.5px; color:var(--ink-soft);">
    GROQ_API_KEYS (comma-separated) powers the conversation. HINDSIGHT_API_KEY connects the memory bank. The server listens on 127.0.0.1 unless HOST is set; use HOST=0.0.0.0 only on a trusted network.
  </div>`;
}

function settingsRow(label, value, tone){
  return `<div class="kv"><span class="k">${escapeHtml(label)}</span><span class="badge ${tone}">${escapeHtml(value)}</span></div>`;
}

async function wireSettings(){
  const box = document.getElementById('settingsStatus');
  if(!box) return;
  try {
    const res = await fetch('/api/health');
    const h = await res.json();
    const groqOn = !!(h.groq && h.groq.configured);
    const hsOn = !!(h.hindsight && h.hindsight.configured);
    const dbOn = !!(h.db && h.db.helpers != null);
    box.innerHTML = [
      settingsRow('Server', h.ok ? `Running, up ${h.uptime_s}s` : 'Degraded', h.ok ? 'ok' : 'bad'),
      settingsRow('Groq (conversation)', groqOn ? `${h.groq.keys} key(s) configured` : 'Not configured', groqOn ? 'ok' : 'warn'),
      settingsRow('Hindsight (memory)', hsOn ? `Bank ${h.hindsight.bank}` : 'Not configured', hsOn ? 'ok' : 'warn'),
      settingsRow('SQLite', dbOn ? `${h.db.helpers} helpers, ${h.db.calls} calls` : 'Unavailable', dbOn ? 'ok' : 'bad'),
      settingsRow('Retains waiting for Hindsight', h.retains_waiting == null ? 'unknown' : String(h.retains_waiting), h.retains_waiting ? 'warn' : 'ok'),
    ].join('');
  } catch(err){
    box.innerHTML = settingsRow('Server', 'Not reachable', 'bad');
  }
}
