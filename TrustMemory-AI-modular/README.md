# TrustMemory AI — coordinator console and helper phone screen

The browser side of TrustMemory AI. No build step and no bundler: every file is a
plain `<script src="...">` tag loaded in dependency order and sharing one global
scope. The Express server in `../server` serves this folder, so open it through
`npm start` at http://localhost:3000, not from the file system (every page reads
live data from `/api/...`).

## File map

```
index.html                 coordinator console shell, loads every script below in order
helper.html                helper phone screen (answers calls, browser speech in and out)
styles.css                 design tokens and layout

js/
  state.js                 agency roster, global state (S, MEM, SCORES, SCORE_HISTORY)
  format-utils.js          labelFor / initials / fmtDate / escapeHtml / badge classes
  activity-log.js          Agent Activity log + ticker
  helper-phone.js          phone screen logic (polls for a ring, answers, talks, hangs up)
  main.js                  boot + syncBackendData() from the server (loaded last)

  agents/                  thin browser helpers; the agents themselves run on the server
    memory-agent.js        retain(): local display cache only (Hindsight writes are server side)
    decision-agent.js      shows the server's trust/churn/difficulty, roster-based fallback
    reflection-agent.js    reflectOnHousehold(): Hindsight reflect via /api/memory/brief
    voice-agent.js         startCall() entry point and the saved-call card

  ui/
    charts.js              sparkline
    memory-ui.js           Hindsight blocks: observations, standing profile, brief, directives, matching
    render.js              router: nav(), renderCurrentPage()
    dashboard.js           coordinator dashboard, who to call today
    helpers-page.js        helper roster + helper detail
    households-page.js     household roster + household detail
    placements-page.js     all placements
    memory-page.js         Hindsight explorer
    matching-page.js       memory-backed matching (/api/memory/match)
    insights-page.js       Hindsight observations across the agency
    voice-page.js          Voice Agent page
    voice-live.js          live call console mirrored from the phone screen
    activity-page.js       Agent Activity log
    architecture-page.js   in-app architecture notes
    settings-page.js       live integration status from /api/health
```
