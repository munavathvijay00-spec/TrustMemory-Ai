/* =========================================================================
   ui/insights-page.js — Reflection Agent output (Fact / Observation / Hypothesis)
   ========================================================================= */

function pageInsights(){
  const hasReflections = S.reflections && S.reflections.length > 0;

  if(!hasReflections){
    return `
      <div class="pagehead">
        <div class="eyebrow">Insights</div>
        <h1>What the Reflection Agent has found</h1>
        <div class="lede">Every insight is labelled by how strongly the evidence supports it.</div>
      </div>
      <div class="card" style="padding:32px 24px; text-align:center; background:#fff; border:1px solid var(--line); border-radius:6px; margin-top:20px;">
        <div style="font-size:24px; margin-bottom:8px;">💡</div>
        <div style="font-size:14px; font-weight:600; color:var(--ink); margin-bottom:6px;">
          No reflections run yet. Run Demo Mode, or trigger a reflection from a helper profile.
        </div>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:12px;">
          <button class="btn sm primary" onclick="nav('demo')" style="padding:6px 14px;">Open Demo Mode →</button>
        </div>
      </div>
    `;
  }

  const groups = {
    'Patterns discovered': S.reflections.filter(r => r.classification === 'OBSERVATION'),
    'Root-cause hypotheses': S.reflections.filter(r => r.classification === 'HYPOTHESIS'),
    'Confirmed facts': S.reflections.filter(r => r.classification === 'FACT'),
  };

  return `
    <div class="pagehead">
      <div class="eyebrow">Insights</div>
      <h1>What the Reflection Agent has found</h1>
      <div class="lede">Every insight is labelled by how strongly the evidence supports it.</div>
    </div>
    ${Object.entries(groups).map(([title, items]) => `
      <div class="section">
        <h2>${title}</h2>
        ${items.length ? items.map(reflCard).join('') : `<div class="card">${emptyState('Nothing here yet.', 'Run a reflection from a helper or household profile, or via Demo Mode.')}</div>`}
      </div>
    `).join('')}
  `;
}
