const Database = require('./sqlite-compat');
const path = require('path');

// TRUSTMEMORY_DB overrides the database file: ':memory:' for tests, or a path (relative to the cwd).
const override = String(process.env.TRUSTMEMORY_DB || '').trim();
const dbPath = override === ':memory:' ? ':memory:' : override ? path.resolve(override) : path.resolve(__dirname, '../trustmemory.db');
const db = new Database(dbPath);
db.filePath = dbPath;

// Enable WAL mode for performance & concurrency (not applicable to an in-memory database)
if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS helpers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    trust INTEGER NOT NULL DEFAULT 68,
    churn INTEGER NOT NULL DEFAULT 18,
    experience_years INTEGER NOT NULL DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    need TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 20
  );

  CREATE TABLE IF NOT EXISTS placements (
    id TEXT PRIMARY KEY,
    helper_id TEXT NOT NULL,
    household_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    helper_id TEXT,
    household_id TEXT,
    network TEXT NOT NULL CHECK(network IN ('world', 'experience', 'opinion', 'observation')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    helper_id TEXT,
    call_id TEXT NOT NULL,
    scenario TEXT NOT NULL,
    status TEXT NOT NULL,
    transcript TEXT,
    outcome_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    agent TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Seed function populating the exact helpers, households, and historical memories
function seedDatabase() {
  const helperCount = db.prepare('SELECT COUNT(*) as count FROM helpers').get().count;
  if (helperCount > 0) return;

  const insertHelper = db.prepare(`
    INSERT INTO helpers (id, name, role, trust, churn, experience_years)
    VALUES (@id, @name, @role, @trust, @churn, @experience_years)
  `);

  const helpers = [
    { id: 'anita', name: 'Anita Verma', role: 'elder_care', trust: 88, churn: 14, experience_years: 6 },
    { id: 'priya', name: 'Priya Nair', role: 'elder_care', trust: 93, churn: 16, experience_years: 4 },
    { id: 'radha', name: 'Radha Kumari', role: 'child_care', trust: 74, churn: 18, experience_years: 7 },
    { id: 'sunita', name: 'Sunita Devi', role: 'cleaning', trust: 62, churn: 42, experience_years: 3 },
    { id: 'meena', name: 'Meena Joshi', role: 'cooking', trust: 84, churn: 12, experience_years: 9 },
    { id: 'kavita', name: 'Kavita Reddy', role: 'child_care', trust: 65, churn: 36, experience_years: 5 },
    { id: 'lakshmi', name: 'Lakshmi Rao', role: 'cleaning', trust: 90, churn: 10, experience_years: 10 },
    { id: 'fatima', name: 'Fatima Sheikh', role: 'child_care', trust: 60, churn: 45, experience_years: 2 },
  ];

  for (const h of helpers) {
    insertHelper.run(h);
  }

  const insertHousehold = db.prepare(`
    INSERT INTO households (id, name, need, difficulty)
    VALUES (@id, @name, @need, @difficulty)
  `);

  const households = [
    { id: 'h101', name: 'Sharma Residence', need: 'cleaning', difficulty: 20 },
    { id: 'h102', name: 'Reddy Residence', need: 'elder_care', difficulty: 24 },
    { id: 'h104', name: 'Iyer Residence', need: 'child_care', difficulty: 78 },
    { id: 'h105', name: 'Gupta Residence', need: 'child_care', difficulty: 45 },
    { id: 'h106', name: 'Nair Residence', need: 'elder_care', difficulty: 22 },
    { id: 'h107', name: 'Verma Residence', need: 'elder_care', difficulty: 20 },
  ];

  for (const hh of households) {
    insertHousehold.run(hh);
  }

  const insertPlacement = db.prepare(`
    INSERT INTO placements (id, helper_id, household_id, role, status, started_at, ended_at)
    VALUES (@id, @helper_id, @household_id, @role, @status, @started_at, @ended_at)
  `);

  const placements = [
    { id: 'p1', helper_id: 'anita', household_id: 'h107', role: 'elder_care', status: 'active', started_at: '2026-01-05', ended_at: null },
    { id: 'p2', helper_id: 'priya', household_id: 'h102', role: 'elder_care', status: 'active', started_at: '2025-11-10', ended_at: null },
    { id: 'p3', helper_id: 'priya', household_id: 'h105', role: 'child_care', status: 'ended_poor_fit', started_at: '2025-08-01', ended_at: '2025-09-14' },
    { id: 'p4', helper_id: 'sunita', household_id: 'h104', role: 'child_care', status: 'failed', started_at: '2025-09-01', ended_at: '2025-10-20' },
    { id: 'p5', helper_id: 'kavita', household_id: 'h104', role: 'child_care', status: 'failed', started_at: '2025-11-01', ended_at: '2025-12-15' },
    { id: 'p6', helper_id: 'fatima', household_id: 'h104', role: 'child_care', status: 'failed', started_at: '2026-01-10', ended_at: '2026-02-18' },
    { id: 'p7', helper_id: 'lakshmi', household_id: 'h101', role: 'cleaning', status: 'active', started_at: '2025-06-01', ended_at: null },
    { id: 'p8', helper_id: 'meena', household_id: 'h106', role: 'cooking', status: 'active', started_at: '2025-05-01', ended_at: null },
    { id: 'p9', helper_id: 'radha', household_id: 'h105', role: 'child_care', status: 'active', started_at: '2026-06-01', ended_at: null },
  ];

  for (const p of placements) {
    insertPlacement.run(p);
  }

  const insertMemory = db.prepare(`
    INSERT INTO memories (id, helper_id, household_id, network, content, created_at)
    VALUES (@id, @helper_id, @household_id, @network, @content, @created_at)
  `);

  const initialMemories = [
    { id: 'm1', helper_id: 'anita', household_id: null, network: 'world', content: 'Anita Verma has 6 years of experience in elder care and cleaning based in Hyderabad.', created_at: '2026-01-01 10:00:00' },
    { id: 'm2', helper_id: 'anita', household_id: 'h107', network: 'experience', content: 'Household reported excellent care and punctuality.', created_at: '2026-01-17 11:30:00' },
    { id: 'm3', helper_id: 'anita', household_id: 'h107', network: 'experience', content: 'Household praised communication and reliability.', created_at: '2026-02-18 14:15:00' },
    { id: 'm4', helper_id: 'anita', household_id: null, network: 'opinion', content: 'Candidate profile established. Verified competence for elder care (88/100).', created_at: '2026-01-02 09:00:00' },
    { id: 'm5', helper_id: 'priya', household_id: 'h102', network: 'experience', content: 'Household highly satisfied with elder-care routine.', created_at: '2025-12-02 16:00:00' },
    { id: 'm6', helper_id: 'sunita', household_id: 'h104', network: 'experience', content: 'Household reported schedule expectations were not being met.', created_at: '2025-09-25 10:00:00' },
  ];

  for (const m of initialMemories) {
    insertMemory.run(m);
  }
}

seedDatabase();

// Radha's current placement with the Gupta family (her seeded memory describes it); added for databases seeded before it existed.
db.prepare(`INSERT OR IGNORE INTO placements (id, helper_id, household_id, role, status, started_at, ended_at)
            SELECT 'p9', 'radha', 'h105', 'child_care', 'active', '2026-06-01', NULL WHERE EXISTS (SELECT 1 FROM helpers WHERE id = 'radha')`).run();

module.exports = db;
