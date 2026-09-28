/**
 * Seed the agency's Hindsight bank with realistic history.
 *
 *   node server/seed-memory.js            # retain history, set mission, directives, mental models
 *   node server/seed-memory.js --dry-run  # print what would be sent
 *
 * Every item carries a real past timestamp and a stable document_id, so re-running
 * upserts instead of duplicating. Helper items are tagged helper:<id>, household items
 * household:<id>; both carry source:seed-history so they can be told apart from live calls.
 */
require('dotenv').config();
const hindsight = require('./hindsight');

const DRY = process.argv.includes('--dry-run');
const SKIP_HISTORY = process.argv.includes('--skip-history');
const TODAY = new Date();

function daysAgo(n, hour = 10) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const CTX = {
  household: (who) => `Feedback from ${who} reported to the agency coordinator about their helper.`,
  callNote: (name) => `Coordinator's note written after a phone call with helper ${name}.`,
  helperSaid: (name) => `${name}, a home-care helper, speaking to the agency coordinator on a call. Her first-person statements are facts about her.`,
  profile: 'Agency onboarding record for a helper.',
  householdProfile: 'Agency onboarding record for a client household.',
};

/* ------------------------------------------------------------------ helpers */

const HELPERS = {
  anita: {
    name: 'Anita Verma',
    items: [
      { d: 95, ctx: 'profile', text: 'Anita Verma joined the agency in 2020. She has six years of elder-care and cleaning experience, lives in Himayatnagar, Hyderabad, and travels to work by city bus.' },
      { d: 88, ctx: 'household', who: 'the Verma Residence', tags: ['household:h107'], text: 'The Verma family said Anita is gentle with their 82-year-old father, remembers his medication times without being reminded, and is always punctual.' },
      { d: 60, ctx: 'household', who: 'the Verma Residence', tags: ['household:h107'], text: 'The Verma family praised Anita for calmly handling a fall at home and calling them immediately. They said they trust her completely.' },
      { d: 41, ctx: 'helperSaid', text: 'Anita mentioned she looks after her mother-in-law in the evenings and would prefer not to take late-evening shifts. She said mornings are always fine for her.' },
      { d: 41, ctx: 'callNote', text: 'Routine check-in with Anita. Cooperative, no concerns. She asked for the two-week roster in advance so she can plan her mother-in-law\'s hospital visits.' },
    ],
  },
  radha: {
    name: 'Radha Kumari',
    items: [
      { d: 100, ctx: 'profile', text: 'Radha Kumari has seven years of child-care and cooking experience. She lives in Secunderabad with her husband and eight-year-old daughter Lakshmi. She speaks Telugu and Hindi and understands English.' },
      { d: 92, ctx: 'household', who: 'a previous client family', text: 'A previous household said Radha was wonderful with their toddler twins, endlessly patient, and the children cried when her contract ended.' },
      { d: 34, ctx: 'helperSaid', text: 'Radha said her daughter Lakshmi\'s school changed its timing to an 8:00 start from this term, so the morning rush at home has become difficult and she has been late twice.' },
      { d: 34, ctx: 'callNote', text: 'Coaching call with Radha about two late arrivals. Root cause: daughter\'s new school timing. Radha was anxious and apologetic; she relaxed once reassured the call was not a warning. She committed to asking her neighbour to drop Lakshmi at school on three days a week.' },
      { d: 34, ctx: 'helperSaid', text: 'Radha asked the agency not to call her before 10 in the morning because that is her daughter\'s school rush, and said any time after 10 is fine.' },
      { d: 20, ctx: 'callNote', text: 'Follow-up with Radha two weeks after the coaching call. The neighbour arrangement is working; no late arrivals since. She sounded relieved and thanked the coordinator for understanding.' },
      { d: 12, ctx: 'household', who: 'the Gupta Residence', tags: ['household:h105'], text: 'The Gupta family said Radha is excellent with their five-year-old and cooks well, though she sometimes arrives looking flustered and takes a few minutes to settle in.' },
    ],
  },
  priya: {
    name: 'Priya Nair',
    items: [
      { d: 110, ctx: 'profile', text: 'Priya Nair has four years of experience, mainly elder care. She is a trained nursing assistant and lives near Banjara Hills.' },
      { d: 75, ctx: 'household', who: 'the Reddy Residence', tags: ['household:h102'], text: 'The Reddy family said Priya manages their mother\'s diabetes routine carefully and keeps a written log of meals and sugar readings.' },
      { d: 50, ctx: 'household', who: 'the Gupta Residence', tags: ['household:h105'], text: 'The Gupta family ended Priya\'s child-care placement early. They said she was diligent but visibly uncomfortable managing two energetic young children, and it was not the right fit.' },
      { d: 48, ctx: 'callNote', text: 'Debrief with Priya after the Gupta placement ended. She said she prefers elder care, finds it calmer and more meaningful, and asked not to be placed in child-care roles again.' },
      { d: 15, ctx: 'household', who: 'the Reddy Residence', tags: ['household:h102'], text: 'The Reddy family renewed Priya\'s contract for another year and asked that she not be moved.' },
    ],
  },
  sunita: {
    name: 'Sunita Devi',
    items: [
      { d: 105, ctx: 'profile', text: 'Sunita Devi has three years of cleaning and cooking experience and works part-time, mornings only, because she attends evening classes.' },
      { d: 70, ctx: 'household', who: 'the Iyer Residence', tags: ['household:h104'], text: 'The Iyer family asked for Sunita to be replaced after seven weeks, saying she did not follow their exact daily schedule and used her phone during work hours.' },
      { d: 68, ctx: 'helperSaid', text: 'Sunita said the Iyer household changed the schedule almost daily and she was never told what was expected, so she felt she could not get anything right.' },
      { d: 30, ctx: 'household', who: 'a new part-time client', text: 'A new part-time client said Sunita is fast, thorough, and cheerful, and that the house has never looked better.' },
    ],
  },
  meena: {
    name: 'Meena Joshi',
    items: [
      { d: 120, ctx: 'profile', text: 'Meena Joshi has nine years of experience in elder care and cooking. She specialises in diabetic and low-salt cooking and lives in Gachibowli.' },
      { d: 80, ctx: 'household', who: 'the Nair Residence', tags: ['household:h106'], text: 'The Nair family said Meena\'s meal planning for their father\'s kidney diet is better than the hospital dietician\'s and that he has started eating properly again.' },
      { d: 25, ctx: 'helperSaid', text: 'Meena said she is happy at the Nair Residence and would like to stay long term. She asked about the agency\'s advanced elder-care training.' },
    ],
  },
  kavita: {
    name: 'Kavita Reddy',
    items: [
      { d: 100, ctx: 'profile', text: 'Kavita Reddy has five years of child-care experience and lives in Kukatpally.' },
      { d: 55, ctx: 'household', who: 'the Iyer Residence', tags: ['household:h104'], text: 'The Iyer family ended Kavita\'s placement after six weeks, citing schedule adherence, though they said the child liked her.' },
      { d: 53, ctx: 'helperSaid', text: 'Kavita said Mrs Iyer works from home and interrupted her constantly with changing instructions, and that she felt watched all day.' },
    ],
  },
  lakshmi: {
    name: 'Lakshmi Rao',
    items: [
      { d: 130, ctx: 'profile', text: 'Lakshmi Rao has ten years of cleaning experience and has been with the Sharma Residence for over a year.' },
      { d: 45, ctx: 'household', who: 'the Sharma Residence', tags: ['household:h101'], text: 'The Sharma family renewed Lakshmi\'s engagement and said she is the most reliable helper they have had.' },
    ],
  },
  fatima: {
    name: 'Fatima Sheikh',
    items: [
      { d: 90, ctx: 'profile', text: 'Fatima Sheikh has two years of experience in elder care and child care and lives in Begumpet.' },
      { d: 40, ctx: 'household', who: 'the Iyer Residence', tags: ['household:h104'], text: 'The Iyer family ended Fatima\'s placement after five weeks, again citing schedule expectations not being met.' },
      { d: 38, ctx: 'callNote', text: 'Debrief with Fatima after the Iyer placement. She was upset and said she had tried very hard. She said the written schedule she was given on day one was never the schedule the family actually followed.' },
    ],
  },
};

/* ------------------------------------------------------------------ households */

const HOUSEHOLDS = {
  h101: { name: 'Sharma Residence', items: [
    { d: 130, ctx: 'householdProfile', text: 'The Sharma Residence in Jubilee Hills needs weekday-morning cleaning. Two working adults, no children at home.' },
  ] },
  h102: { name: 'Reddy Residence', items: [
    { d: 110, ctx: 'householdProfile', text: 'The Reddy Residence in Banjara Hills needs live-in elder care for Mrs Reddy, 78, who has type 2 diabetes and mild arthritis. The family values written logs and calm routine.' },
  ] },
  h104: { name: 'Iyer Residence', items: [
    { d: 100, ctx: 'householdProfile', text: 'The Iyer Residence in Madhapur needs weekday child care from 9am to 6pm for a four-year-old. Mrs Iyer works from home.' },
    { d: 36, ctx: 'callNote', text: 'Coordinator review of the Iyer Residence: three consecutive child-care placements (Sunita, Kavita, Fatima) ended within seven weeks, each time citing schedule adherence. All three helpers independently described daily changes to the schedule and close supervision. The pattern points to expectation mismatch on the household side rather than helper performance.' },
    { d: 36, ctx: 'household', who: 'Mrs Iyer', text: 'Mrs Iyer said she wants a helper who arrives at 8:45 sharp, does not use a phone during work, and can adapt when her meetings move. She said she is open to a written weekly plan agreed in advance.' },
  ] },
  h105: { name: 'Gupta Residence', items: [
    { d: 100, ctx: 'householdProfile', text: 'The Gupta Residence in Kondapur needs weekday child care from 8am to 5pm for a five-year-old and occasional cooking. Both parents commute.' },
  ] },
  h106: { name: 'Nair Residence', items: [
    { d: 120, ctx: 'householdProfile', text: 'The Nair Residence in Gachibowli needs live-in elder care and cooking for Mr Nair, 84, who has a restricted kidney diet.' },
  ] },
  h107: { name: 'Verma Residence', items: [
    { d: 95, ctx: 'householdProfile', text: 'The Verma Residence in Himayatnagar needs full-time elder care for Mr Verma, 82, who has limited mobility and a fixed medication schedule.' },
  ] },
};

/* ------------------------------------------------------------------ bank-level */

const MISSION = [
  'You are the institutional memory of an Indian home-care agency in Hyderabad. You remember every helper (domestic care worker) and every client household: what they said, what they committed to, what worked and what did not.',
  'Your purpose is to help coordinators treat helpers as people with real constraints (transport, family, health) and to help match helpers to households where they will succeed.',
  'Be warm and fair towards helpers. Prefer evidence from what people actually said over assumptions. Note when a commitment was kept, because that matters more than any single late arrival.',
].join(' ');

const DIRECTIVES = [
  { name: 'No scores to helpers', content: 'Never state, quote or hint at a helper\'s trust score or churn risk when speaking to or about the helper in a call. Scores are for coordinators only.', priority: 100 },
  { name: 'Respect stated call windows', content: 'If a helper has asked not to be contacted at certain times (for example before 10am), never propose or schedule a call in that window.', priority: 90 },
  { name: 'Commitments before criticism', content: 'When summarising a helper, mention commitments she kept before mentioning any lapses.', priority: 50 },
];

function mentalModelSpecs() {
  const out = [];
  for (const [id, h] of Object.entries(HELPERS)) {
    out.push({
      id: `coach-${id}`,
      name: `How to coach ${h.name}`,
      sourceQuery: `How should the agency coordinator approach a coaching or check-in call with ${h.name}? Cover: what she has committed to and whether it held, what is going on in her life that affects work, what tone and approach has worked with her before, any times she must not be called, and what to avoid saying.`,
      tags: [`helper:${id}`],
    });
  }
  for (const [id, hh] of Object.entries(HOUSEHOLDS)) {
    out.push({
      id: `household-${id}`,
      name: `What ${hh.name} expects`,
      sourceQuery: `What does the ${hh.name} expect from a helper, what has gone wrong with past placements there and why, and what kind of helper is most likely to succeed with them?`,
      tags: [`household:${id}`],
    });
  }
  return out;
}

/* ------------------------------------------------------------------ build items */

function buildItems() {
  const items = [];
  for (const [id, h] of Object.entries(HELPERS)) {
    h.items.forEach((it, i) => {
      const context = it.ctx === 'household' ? CTX.household(it.who) : it.ctx === 'callNote' ? CTX.callNote(h.name) : it.ctx === 'helperSaid' ? CTX.helperSaid(h.name) : CTX.profile;
      items.push({
        content: it.text,
        context,
        documentId: `seed:helper:${id}:${i + 1}`,
        timestamp: daysAgo(it.d),
        metadata: { helper_id: id, kind: it.ctx, source: 'seed-history' },
        tags: [`helper:${id}`, 'source:seed-history', ...(it.tags || [])],
      });
    });
  }
  for (const [id, hh] of Object.entries(HOUSEHOLDS)) {
    hh.items.forEach((it, i) => {
      const context = it.ctx === 'household' ? CTX.household(it.who) : it.ctx === 'callNote' ? 'Coordinator\'s review note about a client household.' : CTX.householdProfile;
      items.push({
        content: it.text,
        context,
        documentId: `seed:household:${id}:${i + 1}`,
        timestamp: daysAgo(it.d),
        metadata: { household_id: id, kind: it.ctx, source: 'seed-history' },
        tags: [`household:${id}`, 'source:seed-history'],
      });
    });
  }
  return items;
}

/* ------------------------------------------------------------------ main */

async function main() {
  if (!hindsight.isConfigured()) {
    console.error('Hindsight is not configured. Set HINDSIGHT_API_KEY (cloud) or HINDSIGHT_API_URL (self-hosted) in .env.');
    process.exit(1);
  }
  const items = buildItems();
  console.log(`Bank: ${hindsight.BANK_ID} @ ${hindsight.BASE_URL}`);
  console.log(`Prepared ${items.length} history items across ${Object.keys(HELPERS).length} helpers and ${Object.keys(HOUSEHOLDS).length} households.`);
  if (DRY) {
    items.forEach(i => console.log(`  [${i.timestamp.slice(0, 10)}] ${i.tags.join(',')} :: ${i.content.slice(0, 90)}...`));
    return;
  }

  // 1. History, oldest first, in small batches so one slow extraction does not time out the rest.
  items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const BATCH = 6;
  for (let i = 0; !SKIP_HISTORY && i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    process.stdout.write(`Retaining ${i + 1}-${i + batch.length} of ${items.length}... `);
    const t0 = Date.now();
    const res = await hindsight.retain(batch);
    console.log(`ok (${res && res.items_count != null ? res.items_count : batch.length} items, ${Math.round((Date.now() - t0) / 1000)}s)`);
  }

  // 2. Mission and disposition: an empathetic, fair memory with mild skepticism.
  process.stdout.write('Setting bank mission... ');
  await hindsight.setMission(MISSION);
  console.log('ok');
  process.stdout.write('Setting disposition (empathy 4, skepticism 2, literalism 2)... ');
  await hindsight.updateConfig({ disposition_empathy: 4, disposition_skepticism: 2, disposition_literalism: 2 });
  console.log('ok');
  process.stdout.write('Enabling memory defense (PII redaction)... ');
  try {
    await hindsight.updateConfig({ memory_defense: { enabled: true, rules: [{ on: 'sensitive_data', action: 'redact' }] } });
    console.log('ok');
  } catch (err) {
    // Not every plan is entitled to the sensitive_data detector; the bank works without it.
    console.log('not available on this plan, skipped (' + err.message.slice(0, 80) + '...)');
  }

  // 3. Directives (skip ones that already exist by name).
  const existing = await hindsight.directives.list();
  for (const d of DIRECTIVES) {
    if (existing.some(e => e.name === d.name)) { console.log(`Directive exists: ${d.name}`); continue; }
    await hindsight.directives.create(d);
    console.log(`Directive created: ${d.name}`);
  }

  // 4. Mental models (one per helper and household), refreshed after consolidation.
  const models = await hindsight.mentalModels.list();
  for (const spec of mentalModelSpecs()) {
    if (models.some(m => m.id === spec.id || m.name === spec.name)) { console.log(`Mental model exists: ${spec.name}`); continue; }
    process.stdout.write(`Creating mental model: ${spec.name}... `);
    try {
      await hindsight.mentalModels.create(spec);
      console.log('ok');
    } catch (err) {
      console.log('failed: ' + err.message);
    }
  }

  const st = await hindsight.stats();
  if (st) console.log(`Bank now holds ${st.total_nodes} nodes: ${JSON.stringify(st.nodes_by_fact_type)}`);
  console.log('Done. Observations and mental models consolidate in the background over the next few minutes.');
}

if (require.main === module) {
  main().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
}

module.exports = { HELPERS, HOUSEHOLDS, DIRECTIVES, MISSION, buildItems, mentalModelSpecs };
