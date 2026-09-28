/**
 * SQLite driver loader.
 * Prefers better-sqlite3 (native). If its binary is missing for this Node version,
 * falls back to Node's built-in node:sqlite (Node 22.13+ / 24) through a thin
 * adapter exposing the subset of the better-sqlite3 API this app uses:
 *   new Database(path), db.pragma(), db.exec(), db.prepare().run/get/all
 */
let Database;
try {
  Database = require('better-sqlite3');
  // The package can install without its native binary (e.g. no prebuild for this Node
  // version and no C++ toolchain). require() still succeeds; opening a database fails.
  // Probe once so that case also falls back instead of crashing at boot.
  new Database(':memory:').close();
} catch (err) {
  const { DatabaseSync } = require('node:sqlite');
  Database = class CompatDatabase {
    constructor(file) { this.db = new DatabaseSync(file); }
    pragma(stmt) { return this.db.exec('PRAGMA ' + stmt); }
    exec(sql) { return this.db.exec(sql); }
    prepare(sql) {
      const st = this.db.prepare(sql);
      return {
        run: (...args) => st.run(...args),
        get: (...args) => st.get(...args),
        all: (...args) => st.all(...args),
      };
    }
  };
  const reason = err.code || String(err.message).split(/\r?\n/)[0].slice(0, 80);
  console.warn('[TrustMemory AI] better-sqlite3 unavailable (' + reason + '); using node:sqlite fallback.');
}
module.exports = Database;
