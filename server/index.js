require('dotenv').config();

const path = require('path');
const { createApp } = require('./app');
const db = require('./db');
const groq = require('./groq');
const hindsight = require('./hindsight');
const retainQueue = require('./retain-queue');

const PORT = process.env.PORT || 3000;
// Listen on this machine only by default: the API has no login and reads helper memory.
// Set HOST=0.0.0.0 only on a trusted network (for example to open the helper phone screen from another device).
const HOST = process.env.HOST || '127.0.0.1';

/** Origin only: drops any path, query or user:password that might be embedded in the URL. */
function safeOrigin(url) {
  try { return new URL(url).origin; } catch (e) { return '(invalid URL)'; }
}

function banner() {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const rel = path.relative(process.cwd(), db.filePath);
  const dbName = db.filePath === ':memory:' || !rel || rel.startsWith('..') ? db.filePath : rel;
  const lines = [
    `[TrustMemory AI] http://${shownHost}:${PORT}${HOST === '0.0.0.0' ? ' (listening on all interfaces)' : ''}`,
    `  Groq       ${groq.isConfigured() ? `${groq.keyCount()} key(s), model ${groq.MODEL}, fallback ${groq.FALLBACK_MODEL}` : 'not configured (set GROQ_API_KEYS); voice calls will fail'}`,
    `  Hindsight  ${hindsight.isConfigured() ? `bank ${hindsight.BANK_ID} at ${safeOrigin(hindsight.BASE_URL)}` : `not configured (set HINDSIGHT_API_KEY); using local SQLite memory, bank ${hindsight.BANK_ID}`}`,
    `  Database   ${dbName}, retains waiting: ${retainQueue.pendingCount()}`,
  ];
  console.log(lines.join('\n'));
}

const app = createApp({ port: PORT });
retainQueue.start();
app.listen(PORT, HOST, banner);
