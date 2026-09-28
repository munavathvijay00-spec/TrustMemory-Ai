# TrustMemory AI: three-minute demo

Everything shown here is live: Groq drives the conversation, Hindsight holds the memory, nothing is scripted or pre-recorded.

## Before you start (not timed)

1. `.env` has `GROQ_API_KEYS` and `HINDSIGHT_API_KEY`. `npm run seed:memory` has been run at least ten minutes earlier, so observations and standing profiles have consolidated.
2. `npm start`, then open http://localhost:3000 in Chrome (coordinator console).
3. Open Radha's phone screen in a second window: http://localhost:3000/helper.html?helper=radha. Click **Switch line on** and allow the microphone. Place the two windows side by side.
4. On the Voice Agent page, set Helper to **Radha Kumari**, Late arrivals to **2**, Call type to **Coaching call**. Leave **Use Hindsight memory** ticked.
5. Optional warm-up: open Helpers, then Radha Kumari, and glance at her standing profile panel, so the audience has seen the "before" version.

What the bank already knows about Radha (seeded, dated history): her daughter Lakshmi's school moved to an 8:00 start, a neighbour drops Lakshmi at school on three days a week, and she asked not to be called before 10 in the morning.

## Script

**0:00 - 0:15  The problem**
Say: "A home-care agency's real knowledge lives in one coordinator's head. When she's busy or leaves, the agency forgets. TrustMemory gives the agency a memory, and a voice agent that uses it."

**0:15 - 0:40  Ring Radha, memory before the first word**
- Click **Ring helper's phone**. Radha's screen rings; click **Accept**.
- The agent's opening line is spoken on the phone screen and mirrored in the console. It refers to something from memory (for example the school timing or the neighbour arrangement).
- Point at the `[mN]` chip after that sentence in the console transcript and click it: it opens the exact Hindsight fact and its date.
- Say: "Hindsight was recalled before the agent said a word, and every sentence that uses memory cites it."

**0:40 - 1:15  Teach it something new**
- Speak (or type) as Radha: "The neighbour is moving away at the end of the month, so from next month my husband will drop Lakshmi on his way to the bus depot."
- The agent answers using what it already knew about the neighbour (per-turn recall; watch the new chip).
- Give one more short reply agreeing to message the household if she is ever running more than 10 minutes late.
- Click **End call** on the phone screen.

**1:15 - 1:45  What it learned, what it used**
- In the console click **End call & save to memory** if the save has not started on its own.
- Show the two panels side by side:
  - **Learned from this call**: the husband drop-off fact, taken only from Radha's own words.
  - **Already knew and used**: the facts the agent cited, each with its origin (agency records, learned on a call).
- Show the Decision Agent line: "churn X -> Y", with the named reasons underneath (for example "concrete commitment made (-8)").
- Wait for the badge **Hindsight retain: ok**.

**1:45 - 2:05  The standing profile changes**
- Click **Show how the standing profile changed**. If Hindsight has not rewritten it yet, click **Rewrite it now**.
- Point at the new line about the husband dropping Lakshmi next to the old profile.
- Say: "This is a Hindsight mental model: a standing answer about how to coach Radha, kept current as calls come in."

**2:05 - 2:30  Call again, the new fact is used**
- Click **Run the follow-up call now**, then accept on the phone screen.
- The opening line now asks about the new drop-off arrangement or the commitment she just made, with a citation chip pointing at the fact learned two minutes ago.
- Hang up without saving (click **Cancel** in the console).

**2:30 - 2:45  Who to call today**
- Go to **Coordinator Dashboard**, click **Ask Hindsight who to call today**.
- Two or three helpers appear with a reason grounded in memory and a best time. Point out that Radha's suggested time respects "not before 10": that is a Hindsight directive being obeyed.

**2:45 - 3:00  Matching with evidence**
- Go to **Matching**, choose **Iyer Residence** and **child care**, click **Find best match**.
- Show the household evidence (three placements ended over schedule expectations) and each candidate's reasons and recalled facts; Priya ranks low because she asked not to be placed in child care again.
- Close: "Every call makes the next one better, and every recommendation shows its evidence."

## If something goes wrong

- **No ring on the phone screen**: make sure **Switch line on** was clicked and the URL has `?helper=radha`. An unanswered ring turns into "missed" after 60 seconds; ring again.
- **Microphone not heard**: use the typed reply box on the phone screen. Chrome speech recognition needs internet.
- **Retain shows "queued for retry"**: Hindsight was unreachable; the call is saved locally and retries automatically. `/api/health` shows `retains_waiting`.
- **Groq rate limited**: the client rotates keys and models; wait a few seconds and continue.
