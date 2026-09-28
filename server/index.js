const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const voiceRoutes = require('./voice-routes');
const memoryRoutes = require('./memory-routes');
const retainQueue = require('./retain-queue');

const app = express();
const PORT = process.env.PORT || 3000;
// Listen on this machine only by default: the API has no login and reads helper memory.
// Set HOST=0.0.0.0 only on a trusted network (for example to open the helper phone screen from another device).
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors({ origin: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`] }));
app.use(express.json({ limit: '64kb' }));

// Serve static frontend files
app.use(express.static(path.resolve(__dirname, '../TrustMemory-AI-modular')));

// Voice agent (browser call + helper phone screen) and Hindsight memory endpoints
app.use(voiceRoutes);
app.use(memoryRoutes);

/* ------------------------------------------------------------------ read-only data for the dashboard */

app.get('/api/helpers', (req, res) => {
  const helpers = db.prepare('SELECT * FROM helpers').all();
  return res.json(helpers);
});

app.get('/api/households', (req, res) => {
  const households = db.prepare('SELECT * FROM households').all();
  return res.json(households);
});

app.get('/api/memories/:helper_id', (req, res) => {
  const { helper_id } = req.params;
  const memories = db.prepare('SELECT * FROM memories WHERE helper_id = ? ORDER BY created_at DESC').all(helper_id);
  return res.json(memories);
});

app.get('/api/calls', (req, res) => {
  const calls = db.prepare('SELECT * FROM calls ORDER BY created_at DESC').all();
  const parsed = calls.map(c => {
    let transcript = [];
    let outcome = {};
    try {
      transcript = JSON.parse(c.transcript || '[]');
      outcome = JSON.parse(c.outcome_json || '{}');
    } catch (e) { /* keep defaults */ }
    return { ...c, transcript, outcome };
  });
  return res.json(parsed);
});

app.get('/api/activity', (req, res) => {
  const logs = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 50').all();
  return res.json(logs);
});

// Unknown API routes answer with JSON, not the HTML fallback.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Malformed JSON bodies and other unexpected errors never leak a stack trace.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  console.error('[TrustMemory AI] Unhandled error:', err && err.message);
  return res.status(500).json({ error: 'Internal error.' });
});

retainQueue.start();

app.listen(PORT, HOST, () => {
  console.log(`[TrustMemory AI] Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${HOST === '0.0.0.0' ? ' (listening on all interfaces)' : ''}`);
  console.log(`[TrustMemory AI] Serving frontend from TrustMemory-AI-modular/`);
  console.log(`[TrustMemory AI] SQLite database initialized at trustmemory.db`);
});
