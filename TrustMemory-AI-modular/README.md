# TrustMemory AI: coordinator console, helper and household views, helper phone screen

The browser side of TrustMemory AI. No build step and no bundler: every file is a
plain `<script src="...">` tag loaded in dependency order and sharing one global
scope. The Express server in `../server` serves this folder, so open it through
`npm start` at http://localhost:3000, not from the file system (every page reads
live data from `/api/...`).

## File map

```
index.html                 console shell for all three roles, loads every script below in order
helper.html                helper phone screen (answers calls, speech in and out)
styles.css                 design tokens and layout

css/
  motion.css               motion and depth layer (still under prefers-reduced-motion)
  dark.css                 dark theme
  voice-phone.css          phone screen styles, loaded only by helper.html

js/
  state.js                 agency roster, global state (S, MEM, SCORES, SCORE_HISTORY)
  format-utils.js          labelFor / initials / fmtDate / escapeHtml / badge classes
  activity-log.js          Agent Activity log + ticker
  auth.js                  sign-in, sign-up, pending approval, account box
  helper-phone.js          phone screen logic (polls for a ring, answers, talks, hangs up)
  main.js                  boot + syncBackendData() from the server (loaded last)

  agents/                  thin browser helpers; the agents themselves run on the server
    memory-agent.js        retain(): local display cache only (Hindsight writes are server side)
    decision-agent.js      shows the server's trust/churn/difficulty, roster-based fallback
    reflection-agent.js    reflectOnHousehold(): Hindsight reflect via /api/memory/brief
    voice-agent.js         startCall() entry point and the saved-call card

  ui/
    render.js              router: nav(), renderCurrentPage()
    charts.js              sparkline
    memory-ui.js           Hindsight blocks: observations and how each formed, standing profile,
                           brief, directives, matching, friction check
    dashboard.js           coordinator dashboard
    people-page.js         one roster for helpers and households, as two tabs
    helpers-page.js        helper detail: corrections from her, forget this helper
    households-page.js     household detail: both sides of the story
    memory-page.js         Hindsight Core: bank stats, memory graph, recall search
    matching-page.js       memory-backed matching (/api/memory/match)
    voice-page.js          Voice Agent page, what changed since the last call
    voice-live.js          live call console mirrored from the phone screen
    activity-page.js       Agent Activity log
    care-ui.js             private safety checks and the handover brief
    outreach-ui.js         today's calls and what works across the agency
    helper-home.js         signed-in helper: promises, calls, what the agency has on record
    household-home.js      signed-in household: its helper, next check-in, feedback
    requests-ui.js         requests and preferences in people's own words
    theme.js               light / dark toggle
    polish.js              icons, score rings, toasts
    motion.js              page motion and the 3D memory graph
```
