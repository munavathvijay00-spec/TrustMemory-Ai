# TrustMemory AI: three-minute demo

One story, told live: an agency that remembers Radha, calls her before a problem happens, notices what a single call can't, and hands a household's knowledge to the next helper. Groq drives the conversation, Hindsight holds the memory, nothing is scripted or pre-recorded.

## Before you start (not timed)

1. `.env` has `GROQ_API_KEYS`, `HINDSIGHT_API_KEY` and the three `DEMO_*_PASSWORD` values.
2. Clean state: `npm run bank:reset -- --yes`, then `npm run seed:memory` at least ten minutes before the demo so observations and standing profiles consolidate.
3. `npm start`, open http://localhost:3000 in Chrome and sign in as `coordinator@trustmemory.demo`.
4. Open Radha's phone screen in a second window: http://localhost:3000/helper.html?helper=radha (the coordinator session is enough). Click **Switch line on** and allow the microphone. Place the two windows side by side.
5. Optional: on the Voice Agent page pick **తెలుగు · Telugu** to run the call in Telugu (Chrome shows the text if no Telugu voice is installed; Hindi has a voice on most machines).
6. Rehearse once with the typed reply box in case the room is noisy.

What the bank already knows about Radha: her daughter's school moved to an 8:00 start, a neighbour helps with the school run, she asked not to be called before 10, she works for the Gupta family, and last Dussehra she went home to Warangal and came back 9 days late.

## Script

**0:00 - 0:15  The problem**
Say: "An agency's real knowledge lives in one coordinator's head. Helpers quit around festivals, households are left without cover, and a helper's problems come out in pieces over weeks. TrustMemory gives the agency a memory, and a voice agent that uses it."

**0:15 - 0:35  Calling before the problem**
- Dashboard. The sphere is the agency's memory: every point a helper or household, the dust around each is what Hindsight remembers. Drag it once.
- **Today's calls**: Radha is high priority. Read the reason: "Dussehra is on 20 October. Last Dussehra she came back 9 days late", with the dated memory it came from.
- Click **Ring with this reason**. Radha's phone rings; click **Accept**.

**0:35 - 1:15  The call uses memory, and learns**
- The opening line refers to the festival and to what is on record. Click a `[mN]` chip in the console: the exact Hindsight fact and its date.
- Reply as Radha: "Yes, I am going home for Dussehra from the 18th. My sister can cover the mornings at the Guptas, I will be back on the 26th."
- Agree to message the family if anything changes. End the call on the phone screen.
- Show **Learned from this call** (her sister covering, back on the 26th: taken only from her words) next to **Already knew and used**, the promise recorded with its check-in date, the Decision Agent's reasons, and the step timings.

**1:15 - 1:40  Noticing what one call can't**
- Voice Agent: ring **Lakshmi Rao**; she says (typed is fine): "My salary is late again this month."
- End the call. The dashboard shows **Safety check needed**: three dated quotes about late pay across three months, and Hindsight's neutral summary. Say: "No single call looked alarming. Memory across calls did. It goes to a person to check, never to the household."

**1:40 - 2:10  Handing over a household**
- People → Households → **Iyer Residence** → **Handover brief for the next helper**. Pick a helper and **తెలుగు · Telugu**, click **Prepare brief**.
- The brief covers routine, health and care, preferences, what went wrong before (without naming or blaming anyone) and first-week tips, in Telugu. Click **Read aloud** or **Share on WhatsApp**.

**2:10 - 2:35  The agency gets smarter**
- Hindsight Core → **What works across the agency**: which coaching approach kept promises for each kind of problem, across helpers. A new helper with no history starts from this.
- Back on Radha's page, **Show how the standing profile changed**: the new line about the festival plan.

**2:35 - 2:50  Three roles**
- Sign out, sign in as `radha@trustmemory.demo`: her own view, what she agreed to and when the agency will check in, no scores.
- (Optional) `gupta@trustmemory.demo`: the household sees its helper and can send feedback, which goes into memory.

**2:50 - 3:00  Close**
"Every call makes the next one better, patterns across calls reach a human, and what one helper learned about a family isn't lost when she leaves."

## If something goes wrong

- **No ring on the phone screen**: check **Switch line on** was clicked and the URL has `?helper=radha`. An unanswered ring turns into "missed" after 60 seconds; ring again.
- **Phone screen says "Please sign in"**: sign in on the console first in the same browser, then reload the phone screen.
- **Microphone not heard**: use the typed reply box. Chrome speech recognition needs internet.
- **Retain shows "queued for retry"**: Hindsight was unreachable; the call is saved locally and retries automatically. `/api/health` shows `retains_waiting`.
- **Safety card not showing**: it appears only after a concern is raised on a second call inside 60 days; the seeded history gives Lakshmi one mention 30 days ago, so one live mention is enough.
- **Groq rate limited**: the client rotates keys and models; wait a few seconds and continue.
