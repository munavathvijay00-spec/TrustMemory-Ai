/**
 * Memory eval: does recall find what a helper said on an earlier call, and does it keep one
 * helper's memories out of another's?
 *
 * Each case is a question the voice agent needs answered before a call, and a pattern the right
 * fact must match (from the seeded history in seed-memory.js and seed/). For every case, recall
 * runs twice against the live bank:
 *   scoped    tags ['helper:<id>'], as the app does
 *   unscoped  the whole bank, no tags
 * A case passes when one of the top 5 results matches. A leak is a scoped result that names a
 * different helper and not her.
 *
 *   npm run eval:memory            prints the table and writes docs/memory-eval.md
 */
const fs = require('fs');
const path = require('path');
const hindsight = require('./hindsight');

const TOP_K = 5;

const HELPERS = { anita: 'Anita Verma', radha: 'Radha Kumari', priya: 'Priya Nair', sunita: 'Sunita Devi', meena: 'Meena Joshi', kavita: 'Kavita Reddy', lakshmi: 'Lakshmi Rao', fatima: 'Fatima Sheikh' };

const CASES = [
  { helper: 'radha', kind: 'cause', q: 'Why has Radha been arriving late in the mornings?', expect: /school|8:00|daughter/i },
  { helper: 'radha', kind: 'preference', q: 'When should the agency not call Radha?', expect: /before 10|10 in the morning|after 10/i },
  { helper: 'radha', kind: 'time', q: 'When did Radha come back from her Dussehra trip last year, and was it on time?', expect: /13 October|9 days/i },
  { helper: 'radha', kind: 'outcome', q: 'What fixed Radha\'s late arrivals?', expect: /neighbou?r/i },
  { helper: 'anita', kind: 'preference', q: 'Which shifts does Anita prefer not to take?', expect: /evening/i },
  { helper: 'anita', kind: 'cause', q: 'Why does Anita want her roster two weeks in advance?', expect: /mother-in-law|hospital/i },
  { helper: 'priya', kind: 'preference', q: 'What kind of placement does Priya want next?', expect: /elder care|elder-care/i },
  { helper: 'sunita', kind: 'cause', q: 'What went wrong for Sunita at the Iyer home, in her words?', expect: /schedule/i },
  { helper: 'sunita', kind: 'pattern', q: 'Has Sunita asked for money in advance recently?', expect: /advance|3,000|2,000/i },
  { helper: 'meena', kind: 'preference', q: 'What does Meena want from the agency next?', expect: /training|stay long/i },
  { helper: 'lakshmi', kind: 'pattern', q: 'Has Lakshmi been paid on time?', expect: /salary[^.]*late|late[^.]*salary/i },
  { helper: 'kavita', kind: 'cause', q: 'How did Kavita describe working for Mrs Iyer?', expect: /interrupt|watched|changing instructions/i },
  { helper: 'fatima', kind: 'cause', q: 'What did Fatima say about the schedule she was given?', expect: /written schedule|day one|never the schedule/i },
];

function leaks(helperId, results) {
  const mine = HELPERS[helperId].toLowerCase();
  return results.filter(r => {
    const t = String(r.text || '').toLowerCase();
    return !t.includes(mine) && Object.entries(HELPERS).some(([id, name]) => id !== helperId && t.includes(name.toLowerCase()));
  });
}

async function timed(fn) {
  const t = Date.now();
  const out = await fn();
  return { out, ms: Date.now() - t };
}

function rankOf(results, re) {
  const i = results.findIndex(r => re.test(String(r.text || '')));
  return i < 0 ? null : i + 1;
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

async function run() {
  if (!hindsight.isConfigured()) throw new Error('Hindsight is not configured. Set HINDSIGHT_API_KEY in .env.');
  const rows = [];
  for (const c of CASES) {
    const scoped = await timed(() => hindsight.recall(c.q, { tags: ['helper:' + c.helper], budget: 'mid', limit: TOP_K }));
    const open = await timed(() => hindsight.recall(c.q, { budget: 'mid', limit: TOP_K }));
    const row = {
      helper: c.helper, kind: c.kind, q: c.q,
      scopedRank: rankOf(scoped.out, c.expect), openRank: rankOf(open.out, c.expect),
      leaks: leaks(c.helper, scoped.out).length, openOthers: leaks(c.helper, open.out).length,
      ms: scoped.ms,
    };
    rows.push(row);
    console.log(`${row.scopedRank ? 'PASS' : 'MISS'}  ${c.helper.padEnd(8)} rank ${row.scopedRank || '-'} (whole bank ${row.openRank || '-'})  ${row.ms} ms  ${c.q}`);
  }
  const pass = rows.filter(r => r.scopedRank).length;
  const openPass = rows.filter(r => r.openRank).length;
  const top1 = rows.filter(r => r.scopedRank === 1).length;
  const leakCount = rows.reduce((a, r) => a + r.leaks, 0);
  const openOthers = rows.reduce((a, r) => a + r.openOthers, 0);
  const summary = { cases: rows.length, pass, top1, openPass, leakCount, openOthers, medianMs: median(rows.map(r => r.ms)) };
  console.log('\n' + JSON.stringify(summary));
  return { rows, summary };
}

function markdown({ rows, summary }, when) {
  const s = summary;
  return [
    '# Memory eval',
    '',
    `Run on ${when} against the live Hindsight bank \`${hindsight.BANK_ID}\` with \`npm run eval:memory\` (source: \`server/eval-memory.js\`).`,
    '',
    `Each question is something the voice agent needs to know before calling a helper, and the answer only came up on an earlier call. A question passes when the right fact is in the top ${TOP_K} recall results.`,
    '',
    '| | Scoped to her (as the app recalls) | Whole bank, no tags |',
    '|---|---|---|',
    `| Right fact in top ${TOP_K} | **${s.pass} of ${s.cases}** | ${s.openPass} of ${s.cases} |`,
    `| Right fact ranked first | ${s.top1} of ${s.cases} | |`,
    `| Results about a different helper | **${s.leakCount}** | ${s.openOthers} |`,
    `| Median recall time | ${s.medianMs} ms | |`,
    '',
    '| Helper | Kind | Question | Rank (scoped) | Rank (whole bank) |',
    '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.helper} | ${r.kind} | ${r.q} | ${r.scopedRank || 'miss'} | ${r.openRank || 'miss'} |`),
    '',
  ].join('\n');
}

if (require.main === module) {
  run().then(result => {
    const out = path.join(__dirname, '..', 'docs', 'memory-eval.md');
    fs.writeFileSync(out, markdown(result, new Date().toISOString().slice(0, 10)));
    console.log('written ' + out);
  }).catch(err => { console.error('Eval failed:', err.message); process.exit(1); });
}

module.exports = { CASES, leaks, rankOf, markdown };
