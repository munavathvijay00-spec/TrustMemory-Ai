# TrustMemory AI — modular build

The same interactive prototype as the original single-file `trustmemory.html`,
split into one file per module. No build step, no bundler — every file is a
plain `<script src="...">` tag loaded in dependency order and sharing one
global scope, so it still just opens straight in a browser (or via GitHub
Pages) with no `npm install`.

## How to run it

Open `index.html` in a modern browser. Everything else is a relative path
next to it.

## File map

```
index.html                 shell markup, loads every script below in order
styles.css                 all CSS (design system tokens)

js/
  state.js                 NAV config, seed data, global state (S, MEM, SCORES, SCORE_HISTORY)
  format-utils.js          labelFor / initials / fmtDate / escapeHtml
  activity-log.js          shared Agent Activity log + ticker
  event-workflow.js        orchestrates one event across all 5 agents
  demo.js                  3 scripted end-to-end demo scenarios
  main.js                  boot sequence (loaded last)

  agents/
    memory-agent.js        Retain / Recall against the simulated Hindsight core
    decision-agent.js      Trust/Churn/Difficulty + severity classification
    reflection-agent.js    cross-placement pattern detection
    matching-agent.js      role-fit ranking + ensureBackupStaged
    voice-agent.js         evidence-grounded calls, idempotent

  ui/
    charts.js              sparkline / trend-arrow / distribution-bar
    render.js              router: nav(), renderCurrentPage()
    dashboard.js           Coordinator Dashboard (intel strip, risk overview, live feed)
    helpers-page.js        Helper roster + helper detail
    households-page.js     Household roster + household detail
    placements-page.js     All placements
    memory-page.js         Hindsight Core explorer
    matching-page.js       Matching UI
    insights-page.js       Reflection Agent output
    voice-page.js          Voice Agent center
    activity-page.js       Agent Activity log
    architecture-page.js   In-app architecture documentation
    settings-page.js       Settings page
```
