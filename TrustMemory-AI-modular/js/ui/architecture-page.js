/* =========================================================================
   ui/architecture-page.js — how the running system is actually built
   ========================================================================= */

function pageArchitecture(){
  return `<div class="pagehead"><div class="eyebrow">Architecture</div><h1>How a call uses memory</h1><div class="lede">Two browser screens talk to one Express server. The server holds the call, asks Groq for every line, and reads and writes the agency's memory in Hindsight. Open Agent Activity while you use the app to watch each step.</div></div>
  <div class="arch-wrap"><div class="arch-grid">
    <div class="lane"><h4>Browser screens</h4>
      <div class="node">Coordinator console (this app)</div>
      <div class="node">Helper phone screen (helper.html)</div>
      <div class="arrow-note">speech in and out with the browser's own speech recognition and synthesis</div>
    </div>
    <div class="lane"><h4>Voice Agent — server/voice-agent.js</h4>
      <div class="node">Ring, answer, hang up</div>
      <div class="node">Recall before the first word</div>
      <div class="node">Recall on every turn, lines cite memories [m1]</div>
      <div class="node">Outcome extracted from the helper's own words</div>
    </div>
    <div class="lane"><h4>Memory Agent — server/hindsight.js</h4>
      <div class="node cyl">Retain the call, notes and feedback</div>
      <div class="node">Tags: helper:&lt;id&gt;, household:&lt;id&gt;</div>
      <div class="node">Retry queue when Hindsight is unreachable</div>
    </div>
    <div class="lane"><h4>Decision Agent — server/decision.js</h4>
      <div class="node">Re-scores churn after each call</div>
      <div class="node">Every change carries named reasons</div>
    </div>
    <div class="lane"><h4>Reflection — Hindsight observations and reflect</h4>
      <div class="node">Observations consolidated from retained facts</div>
      <div class="node">Standing profiles (mental models) per helper</div>
      <div class="node">Brief me, who to call today</div>
    </div>
    <div class="lane"><h4>Matching — /api/memory/match</h4>
      <div class="node">Recalls each candidate's history</div>
      <div class="node">Shows the evidence next to every score</div>
    </div>
  </div></div>
  <div class="section" style="margin-top:26px;">
    <h2>Stack</h2>
    <div class="card"><div class="rowlist" style="gap:0;">
      ${archRow('Memory','Hindsight Cloud (Vectorize), bank trustmemory-agency','Retain, recall, reflect, observations, mental models and directives. Every fact is tagged with the helper or household it is about.')}
      ${archRow('LLM','Groq','Writes each line of the call from the recalled memories and extracts the outcome after hang-up. Keys rotate on rate limits.')}
      ${archRow('Server','Node.js + Express','Holds call sessions, rate-limits and validates input, and serves this console and the phone screen.')}
      ${archRow('App database','SQLite','Helpers, households, placements, calls, activity and the retain retry queue. Uses node:sqlite when better-sqlite3 has no binary.')}
      ${archRow('Voice','Browser speech on the helper phone screen','The helper answers on a second screen; speech recognition and synthesis run in the browser. No telephony provider.')}
      ${archRow('Frontend','Plain JavaScript, no build step','One script per page, loaded in order by index.html.')}
    </div></div>
  </div>`;
}

function archRow(layer, choice, why){
  return `<div class="rowitem" style="cursor:default; align-items:flex-start;">
    <div class="meta" style="flex:0 0 160px;"><div class="name">${layer}</div></div>
    <div class="meta"><div class="sub" style="color:var(--ink); font-weight:600; font-size:12.5px;">${choice}</div><div class="sub" style="margin-top:3px;">${why}</div></div>
  </div>`;
}
