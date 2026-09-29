# Memory eval

Run on 2026-09-29 against the live Hindsight bank `trustmemory-agency` with `npm run eval:memory` (source: `server/eval-memory.js`).

Each question is something the voice agent needs to know before calling a helper, and the answer only came up on an earlier call. A question passes when the right fact is in the top 5 recall results.

| | Scoped to her (as the app recalls) | Whole bank, no tags |
|---|---|---|
| Right fact in top 5 | **13 of 13** | 13 of 13 |
| Right fact ranked first | 10 of 13 | |
| Results about a different helper | **0** | 1 |
| Median recall time | 800 ms | |

| Helper | Kind | Question | Rank (scoped) | Rank (whole bank) |
|---|---|---|---|---|
| radha | cause | Why has Radha been arriving late in the mornings? | 3 | 3 |
| radha | preference | When should the agency not call Radha? | 1 | 1 |
| radha | time | When did Radha come back from her Dussehra trip last year, and was it on time? | 1 | 1 |
| radha | outcome | What fixed Radha's late arrivals? | 1 | 1 |
| anita | preference | Which shifts does Anita prefer not to take? | 1 | 1 |
| anita | cause | Why does Anita want her roster two weeks in advance? | 1 | 1 |
| priya | preference | What kind of placement does Priya want next? | 1 | 1 |
| sunita | cause | What went wrong for Sunita at the Iyer home, in her words? | 1 | 1 |
| sunita | pattern | Has Sunita asked for money in advance recently? | 1 | 1 |
| meena | preference | What does Meena want from the agency next? | 5 | 5 |
| lakshmi | pattern | Has Lakshmi been paid on time? | 4 | 4 |
| kavita | cause | How did Kavita describe working for Mrs Iyer? | 1 | 1 |
| fatima | cause | What did Fatima say about the schedule she was given? | 1 | 1 |
