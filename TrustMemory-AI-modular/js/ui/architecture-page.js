/* =========================================================================
   ui/architecture-page.js — In-app architecture documentation
   ========================================================================= */

function pageArchitecture(){
  return `<div class="pagehead"><div class="eyebrow">Architecture</div><h1>How the five agents wire together</h1><div class="lede">This mirrors the system diagram. Every box below corresponds to a real function in this prototype — open Agent Activity while you use the app to watch these edges fire in order.</div></div>
  <div class="arch-wrap"><div class="arch-grid">
    <div class="lane"><h4>Event sources</h4>
      <div class="node">Voice check-in calls</div>
      <div class="node">App / WhatsApp events</div>
      <div class="arrow-note">↓ retain</div>
    </div>
    <div class="lane"><h4>Memory Agent — Hindsight Core</h4>
      <div class="node cyl">Retain: log event</div>
      <div class="arrow-note">↓ writes to</div>
      <div class="node">World Network</div>
      <div class="node">Experience Network</div>
      <div class="node">Opinion Network</div>
      <div class="node">Observation Network</div>
    </div>
    <div class="lane"><h4>Voice Agent — Vapi / Bland</h4>
      <div class="node">Household check-in call</div>
      <div class="arrow-note">↑ feeds Retain</div>
      <div class="node">Coaching call</div>
      <div class="node" style="border-color:var(--rust);">Escalation call to coordinator</div>
    </div>
    <div class="lane"><h4>Decision Agent</h4>
      <div class="node">Recall history</div>
      <div class="node">LLM: complaint severity</div>
      <div class="node">Trust + Churn-risk score</div>
      <div class="arrow-note">↓ writes to Opinion Network</div>
    </div>
    <div class="lane"><h4>Reflection Agent</h4>
      <div class="node">Hindsight Reflect / LLM synthesis</div>
      <div class="node">Cross-placement patterns</div>
      <div class="arrow-note">↓ writes to Observation Network</div>
    </div>
    <div class="lane"><h4>Matching Agent</h4>
      <div class="node">Score candidates</div>
      <div class="arrow-note">reads Observation Network</div>
      <div class="node">Pre-stage backup helper</div>
    </div>
    <div class="lane" style="grid-column:1 / -1;"><h4>App layer</h4>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <div class="node" style="flex:1; min-width:160px;">Postgres / Supabase — master records, scores, call logs</div>
        <div class="node cyl" style="flex:1; min-width:160px;">Coordinator Dashboard — receives escalation calls, scores, reflection patterns, staged backups</div>
      </div>
    </div>
  </div></div>
  <div class="section" style="margin-top:26px;">
    <h2>Stack</h2>
    <div class="card"><div class="rowlist" style="gap:0;">
      ${archRow('Memory core','Hindsight (Vectorize) — Retain / Recall / Reflect','The World / Experience / Opinion / Observation model is the differentiator vs. a plain database. Simulated here via the network views above.')}
      ${archRow('Backend / orchestration','Python + FastAPI','Async, fastest path to wiring LLM + Hindsight calls — no heavyweight agent framework for 5 fixed agents.')}
      ${archRow('LLM inference','Groq API (GPT-OSS-120B / Qwen-32B)','Fast enough for live-demo latency. Simulated here with deterministic fallbacks, per the demo-reliability requirement.')}
      ${archRow('App database','Postgres via Supabase','Holds master records, scores and call logs — Hindsight holds the memory, Postgres holds app state.')}
      ${archRow('Voice agent','Vapi.ai or Bland.ai','STT+LLM+TTS+telephony in one call. This prototype runs "voice simulation mode" in-browser.')}
      ${archRow('Frontend','Next.js + Tailwind on Vercel','Fast to ship, instant shareable demo link. This prototype is a single static HTML build of the same UI.')}
      ${archRow('Scoring logic','Deterministic formulas + targeted LLM calls','No custom ML model — trust/churn/difficulty are transparent formulas; severity and synthesis are the only LLM calls.')}
      ${archRow('Auth','Supabase Auth','One login for the demo agency account.')}
    </div></div>
  </div>`;
}

function archRow(layer, choice, why){
  return `<div class="rowitem" style="cursor:default; align-items:flex-start;">
    <div class="meta" style="flex:0 0 160px;"><div class="name">${layer}</div></div>
    <div class="meta"><div class="sub" style="color:var(--ink); font-weight:600; font-size:12.5px;">${choice}</div><div class="sub" style="margin-top:3px;">${why}</div></div>
  </div>`;
}
