/* =========================================================================
   ui/settings-page.js — Environment & Integrations settings page
   ========================================================================= */

function pageSettings(){
  return `<div class="pagehead"><div class="eyebrow">Settings</div><h1>Environment</h1><div class="lede">This browser prototype runs entirely client-side. In a full deployment these would be backend-managed integrations — see Architecture for the full stack rationale.</div></div>
  <div class="card">
    ${['Hindsight (Vectorize) — memory core','Groq LLM — severity, reflection synthesis','Vapi / Bland — voice agent','Postgres via Supabase — app database','Supabase Auth'].map(s => `<div class="kv"><span class="k">${s}</span><span class="badge neutral">Local simulation mode</span></div>`).join('')}
  </div>`;
}
