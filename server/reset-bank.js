/**
 * Reset the demo to a clean state: keep the seeded history, remove everything added since.
 *
 *   node server/reset-bank.js          # preview only: counts what would be removed
 *   node server/reset-bank.js --yes    # actually remove it
 *
 * In the Hindsight bank this deletes every document that is not part of the seed
 * (call transcripts and summaries, commitment outcomes, coordinator feedback and notes),
 * then asks Hindsight to rewrite the standing profiles. Locally it clears calls, call-derived
 * memories, activity, the retain queue and the commitment ledger (re-seeded), and restores
 * seeded scores. Run it before a rehearsal or the live demo so test calls cannot leak in.
 */
require('dotenv').config();
const db = require('./db');
const hindsight = require('./hindsight');

const APPLY = process.argv.includes('--yes');

// Scores as seeded by server/db.js.
const SEED_SCORES = {
  anita: [88, 14], priya: [93, 16], radha: [74, 18], sunita: [62, 42],
  meena: [84, 12], kavita: [65, 36], lakshmi: [90, 10], fatima: [60, 45],
};
const SEED_MEMORY_IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

async function listDocuments() {
  const all = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await fetch(`${hindsight.BASE_URL}/v1/default/banks/${encodeURIComponent(hindsight.BANK_ID)}/documents?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${process.env.HINDSIGHT_API_KEY || ''}` },
    });
    if (!res.ok) throw new Error(`Listing documents failed (${res.status}).`);
    const d = await res.json();
    all.push(...(d.items || []));
    if (!d.items || d.items.length < 100) break;
  }
  return all;
}

async function deleteDocument(id) {
  const res = await fetch(`${hindsight.BASE_URL}/v1/default/banks/${encodeURIComponent(hindsight.BANK_ID)}/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.HINDSIGHT_API_KEY || ''}` },
  });
  return res.ok;
}

async function main() {
  console.log(APPLY ? 'Resetting the demo to the seeded state.' : 'Preview only. Run with --yes to apply.');

  // ---- Hindsight
  if (hindsight.isConfigured()) {
    const docs = await listDocuments();
    const extra = docs.filter(d => !String(d.id).startsWith('seed:'));
    console.log(`Hindsight bank ${hindsight.BANK_ID}: ${docs.length} documents, ${extra.length} added after the seed.`);
    extra.slice(0, 8).forEach(d => console.log('   - ' + d.id));
    if (extra.length > 8) console.log(`   … and ${extra.length - 8} more`);
    if (APPLY) {
      let ok = 0;
      for (const d of extra) if (await deleteDocument(d.id)) ok += 1;
      console.log(`Deleted ${ok} of ${extra.length} documents.`);
      const models = await hindsight.mentalModels.list();
      for (const m of models) await hindsight.mentalModels.refresh(m.id).catch(() => {});
      console.log(`Asked Hindsight to rewrite ${models.length} standing profiles.`);
    }
  } else {
    console.log('Hindsight is not configured; skipping the bank.');
  }

  // ---- Local database
  const count = sql => db.prepare(sql).get().n;
  const placeholders = SEED_MEMORY_IDS.map(() => '?').join(',');
  const local = {
    calls: count('SELECT COUNT(*) AS n FROM calls'),
    memories: db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE id NOT IN (${placeholders})`).get(...SEED_MEMORY_IDS).n,
    activity: count('SELECT COUNT(*) AS n FROM activity'),
    commitments: count("SELECT COUNT(*) AS n FROM commitments WHERE source != 'agency records'"),
  };
  console.log(`Local database: ${local.calls} calls, ${local.memories} call-derived memories, ${local.activity} activity rows, ${local.commitments} commitments from calls.`);
  if (APPLY) {
    // Retired seed facts stay invalidated in Hindsight unless they are restored before the corrections go.
    try {
      for (const r of db.prepare("SELECT memory_id FROM record_corrections WHERE status = 'retired' AND memory_id IS NOT NULL").all()) {
        try { await hindsight.memories.restore(r.memory_id); } catch (e) { console.log('Could not restore ' + r.memory_id + ': ' + e.message); }
      }
    } catch (e) { /* table created on first server start */ }
    db.exec('DELETE FROM calls');
    db.prepare(`DELETE FROM memories WHERE id NOT IN (${placeholders})`).run(...SEED_MEMORY_IDS);
    db.exec('DELETE FROM activity');
    db.exec('DELETE FROM commitments');
    try { db.exec('DELETE FROM retain_jobs'); } catch (e) { /* table created on first server start */ }
    // Feature tables: keep the seeded rows, drop what live calls and demos added.
    const optional = [
      "DELETE FROM safety_signals WHERE source != 'seed'",
      'DELETE FROM safety_flags',
      "DELETE FROM outreach_signals WHERE substr(id, 1, 3) != 'os_'",
      'DELETE FROM agency_learning_state',
      'DELETE FROM household_feedback',
      'DELETE FROM voice_sessions',
      'DELETE FROM requests',
      'DELETE FROM record_corrections',
      "DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE email NOT LIKE '%@trustmemory.demo')",
      "DELETE FROM accounts WHERE email NOT LIKE '%@trustmemory.demo'",
      'DELETE FROM helpers WHERE created_at IS NOT NULL',
      'DELETE FROM households WHERE created_at IS NOT NULL',
    ];
    for (const sql of optional) { try { db.exec(sql); } catch (e) { /* table created on first server start */ } }
    for (const [id, [trust, churn]] of Object.entries(SEED_SCORES)) db.prepare('UPDATE helpers SET trust = ?, churn = ? WHERE id = ?').run(trust, churn, id);
    require('./commitments').seedIfEmpty();
    console.log('Local database restored to the seeded state.');
  }
  console.log(APPLY ? 'Done. Restart the server and reload the page.' : 'Nothing was changed.');
}

main().catch(err => { console.error('Reset failed:', err.message); process.exit(1); });
