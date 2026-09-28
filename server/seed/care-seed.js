/**
 * Hindsight seed items for the safety-signals demo, in the same shape seed-memory.js retains.
 *
 * They match the two local safety_signals rows care.js seeds for Lakshmi: a late salary
 * mentioned 75 days ago (outside the 60-day window) and again 30 days ago. One more mention
 * on a live call makes two calls inside the window, which raises the coordinator's safety check.
 */
function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const CONTEXT = 'Lakshmi Rao, a home-care helper, speaking to the agency coordinator on a call. Her first-person statements are facts about her.';

const HINDSIGHT_SEED_ITEMS = [
  {
    content: `On ${daysAgo(75).slice(0, 10)}, Lakshmi said her salary for the previous month came almost two weeks late, and that the household said there was a problem with the bank.`,
    context: CONTEXT,
    documentId: 'seed:helper:lakshmi:safety:1',
    timestamp: daysAgo(75),
    metadata: { helper_id: 'lakshmi', kind: 'helperSaid', source: 'seed-history' },
    tags: ['helper:lakshmi', 'household:h101', 'source:seed-history'],
  },
  {
    content: `On ${daysAgo(30).slice(0, 10)}, Lakshmi said her salary was late again this month and she had to borrow money to pay her son's school fees.`,
    context: CONTEXT,
    documentId: 'seed:helper:lakshmi:safety:2',
    timestamp: daysAgo(30),
    metadata: { helper_id: 'lakshmi', kind: 'helperSaid', source: 'seed-history' },
    tags: ['helper:lakshmi', 'household:h101', 'source:seed-history'],
  },
];

module.exports = { HINDSIGHT_SEED_ITEMS };
