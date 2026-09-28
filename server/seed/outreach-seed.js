/**
 * Hindsight seed items for calling before problems and learning across helpers.
 *
 * The same history the local tables hold (server/outreach.js outreach_signals and the older
 * agency records in server/commitments.js HISTORY), written as dated memories in the same shape
 * seed-memory.js builds, so memory and the local ledger tell one story. Stable document ids make
 * re-seeding an upsert.
 */
const { HISTORY, APPROACH_LABELS, PROBLEM_LABELS } = require('../commitments');

const NAMES = { anita: 'Anita Verma', radha: 'Radha Kumari', priya: 'Priya Nair', sunita: 'Sunita Devi', meena: 'Meena Joshi', kavita: 'Kavita Reddy', lakshmi: 'Lakshmi Rao', fatima: 'Fatima Sheikh' };

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const callNote = id => `Coordinator's note written after a phone call with helper ${NAMES[id]}.`;
const helperSaid = id => `${NAMES[id]}, a home-care helper, speaking to the agency coordinator on a call. Her first-person statements are facts about her.`;

function item(helperId, key, content, context, timestamp, extraTags = []) {
  return {
    content,
    context,
    documentId: `seed:outreach:${helperId}:${key}`,
    timestamp,
    metadata: { helper_id: helperId, kind: 'outreach', source: 'seed-history' },
    tags: [`helper:${helperId}`, 'source:seed-history', ...extraTags],
  };
}

const FESTIVAL_AND_ADVANCE_ITEMS = [
  item('radha', 'dussehra-2025-leave', 'Radha told the agency she was going home to her mother\'s village near Warangal for Dussehra and would be back on 4 October 2025.', helperSaid('radha'), '2025-09-26T10:00:00.000Z'),
  item('radha', 'dussehra-2025-return', 'Radha came back from her Dussehra trip home on 13 October 2025, 9 days later than she had agreed. The family she worked for had no cover for those days. She said her mother had been unwell and she could not leave sooner.', callNote('radha'), '2025-10-13T10:00:00.000Z'),
  item('meena', 'diwali-2025', 'Meena went home to Nashik for Diwali 2025 for eight days, as she had agreed with the agency. No cover was arranged, and the Nair family said their father\'s kidney diet slipped while she was away.', callNote('meena'), '2025-10-27T10:00:00.000Z', ['household:h106']),
  item('sunita', 'advance-1', 'Sunita asked the agency for an advance of Rs 3,000 on her salary to pay her evening-class fees.', helperSaid('sunita'), daysAgo(21)),
  item('sunita', 'advance-2', 'Sunita asked for a second salary advance this month, Rs 2,000, saying her rent had gone up.', helperSaid('sunita'), daysAgo(5)),
];

/** The older agency records behind learning across helpers, as dated call notes. */
const LEDGER_ITEMS = HISTORY.map(r => item(
  r.helperId,
  'ledger-' + r.id,
  `On a coaching call about a ${PROBLEM_LABELS[r.problem]} problem, the agency used ${APPROACH_LABELS[r.approach]}, and ${NAMES[r.helperId].split(' ')[0]} promised to ${r.text.charAt(0).toLowerCase() + r.text.slice(1)}. Two weeks later the promise was ${r.status === 'kept' ? 'kept' : 'not kept'}: ${r.evidence}`,
  callNote(r.helperId),
  daysAgo(r.resolved),
  ['source:ledger', 'problem:' + r.problem],
));

module.exports = { HINDSIGHT_SEED_ITEMS: FESTIVAL_AND_ADVANCE_ITEMS.concat(LEDGER_ITEMS) };
