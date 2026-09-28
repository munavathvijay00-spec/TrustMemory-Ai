/**
 * server/memory/hindsightClient.js
 * Official Vectorize Hindsight Client Integration
 * Wraps @vectorize-io/hindsight-client with graceful fallback and resilience.
 */
require('dotenv').config();
const { HindsightClient, recallResponseToPromptString } = require('@vectorize-io/hindsight-client');
const db = require('../db');

const HINDSIGHT_API_URL = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY;

// Ensure local resilient backing table exists in SQLite if remote service is unavailable
db.prepare(`
  CREATE TABLE IF NOT EXISTS hindsight_banks (
    bank_id TEXT PRIMARY KEY,
    name TEXT,
    mission TEXT,
    background TEXT,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS hindsight_memories (
    id TEXT PRIMARY KEY,
    bank_id TEXT,
    content TEXT,
    context TEXT,
    metadata TEXT,
    tags TEXT,
    created_at TEXT,
    FOREIGN KEY(bank_id) REFERENCES hindsight_banks(bank_id)
  )
`).run();

class HindsightManager {
  constructor() {
    this.apiUrl = HINDSIGHT_API_URL;
    this.apiKey = HINDSIGHT_API_KEY;
    this.client = null;
    this.isRemoteAvailable = false;
    this.lastHealthCheck = null;

    if (this.apiKey && this.apiKey !== 'mock' && !this.apiKey.startsWith('mock')) {
      try {
        this.client = new HindsightClient({
          baseUrl: this.apiUrl,
          apiKey: this.apiKey,
          maxAttempts: 2
        });
      } catch (err) {
        console.warn('[Hindsight] Client initialization warning:', err.message);
      }
    }
  }

  /**
   * Health Check: tests remote Vectorize Hindsight or verifies local fallback
   */
  async checkHealth() {
    const result = {
      service: 'Vectorize Hindsight',
      url: this.apiUrl,
      has_api_key: Boolean(this.apiKey && this.apiKey !== 'mock'),
      status: 'healthy',
      mode: 'local_resilient',
      version: '0.10.1'
    };

    if (this.client) {
      try {
        const remoteVersion = await this.client.getVersion();
        result.status = 'healthy';
        result.mode = 'vectorize_cloud';
        result.remote_version = remoteVersion;
        this.isRemoteAvailable = true;
        return result;
      } catch (e) {
        console.warn('[Hindsight] Remote health check notice: Memory service unavailable, running in local resilient mode.');
        this.isRemoteAvailable = false;
      }
    }

    result.status = 'healthy';
    result.mode = 'local_resilient';
    result.note = 'Local resilient driver active (ensures zero call drops).';
    return result;
  }

  /**
   * Create or update a memory bank scoped to helper-{helper_id}
   */
  async createBank(bankId, options = {}) {
    const now = new Date().toISOString();
    // 1. Try remote Vectorize Hindsight if configured
    if (this.client) {
      try {
        const res = await this.client.createBank(bankId, options);
        console.log(`[Hindsight] Created remote memory bank "${bankId}" on Vectorize Cloud.`);
        return res;
      } catch (err) {
        console.warn(`[Hindsight] Remote createBank failed for "${bankId}": ${err.message}. Logging to resilient store.`);
      }
    }

    // 2. Resilient local fallback
    db.prepare(`
      INSERT OR REPLACE INTO hindsight_banks (bank_id, name, mission, background, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      bankId,
      options.name || bankId,
      options.mission || 'Indian Home-Care Coaching & Attendance Memory Bank',
      options.background || 'Tracks attendance issues, transport delays, and agreed commitments.',
      now
    );
    console.log(`[Hindsight] Resolved local memory bank "${bankId}".`);
    return { success: true, bank_id: bankId, mode: 'local_resilient' };
  }

  /**
   * Retain durable memory in bank helper-{helper_id}
   */
  async retain(bankId, content, options = {}) {
    const now = options.timestamp ? new Date(options.timestamp).toISOString() : new Date().toISOString();

    // 1. Try remote Vectorize Hindsight
    if (this.client) {
      try {
        const res = await this.client.retain(bankId, content, options);
        console.log(`[Hindsight] Retained memory in remote bank "${bankId}".`);
        return res;
      } catch (err) {
        console.warn(`[Hindsight] Remote retain failed for "${bankId}": ${err.message}. Saving to resilient store.`);
      }
    }

    // 2. Resilient local fallback
    db.prepare(`
      INSERT OR IGNORE INTO hindsight_banks (bank_id, name, mission, background, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(bankId, bankId, 'Helper Memory Bank', 'Coaching and attendance tracking', now);

    const memId = 'hmem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    db.prepare(`
      INSERT INTO hindsight_memories (id, bank_id, content, context, metadata, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      memId,
      bankId,
      content,
      options.context || 'Voice Agent Check-in',
      JSON.stringify(options.metadata || {}),
      JSON.stringify(options.tags || []),
      now
    );
    console.log(`[Hindsight] Retained durable memory in bank "${bankId}": "${content.substring(0, 75)}..."`);
    return { success: true, memory_id: memId, bank_id: bankId, mode: 'local_resilient' };
  }

  /**
   * Recall memories from helper-{helper_id}
   */
  async recall(bankId, query, options = {}) {
    // 1. Try remote Vectorize Hindsight
    if (this.client) {
      try {
        const res = await this.client.recall(bankId, query, options);
        console.log(`[Hindsight] Recalled ${res.results?.length || 0} memories from remote bank "${bankId}".`);
        return res;
      } catch (err) {
        console.warn(`[Hindsight] Remote recall failed for "${bankId}": ${err.message}. Falling back to resilient store.`);
      }
    }

    // 2. Resilient local fallback
    const rows = db.prepare(`
      SELECT * FROM hindsight_memories 
      WHERE bank_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all(bankId);

    const results = rows.map((r, idx) => ({
      id: r.id,
      text: r.content,
      context: r.context,
      occurred_start: r.created_at,
      score: 1.0 - (idx * 0.05)
    }));

    return {
      results,
      chunks: {},
      entities: {},
      mode: 'local_resilient',
      bank_id: bankId
    };
  }

  /**
   * Reflect over previous memories in helper-{helper_id}
   */
  async reflect(bankId, query, options = {}) {
    // 1. Try remote Vectorize Hindsight
    if (this.client) {
      try {
        const res = await this.client.reflect(bankId, query, options);
        console.log(`[Hindsight] Reflected on helper history in remote bank "${bankId}".`);
        return res;
      } catch (err) {
        console.warn(`[Hindsight] Remote reflect failed for "${bankId}": ${err.message}. Synthesizing local reflection.`);
      }
    }

    // 2. Resilient local fallback synthesis
    const rows = db.prepare(`
      SELECT * FROM hindsight_memories 
      WHERE bank_id = ? 
      ORDER BY created_at DESC 
      LIMIT 5
    `).all(bankId);

    if (rows.length === 0) {
      return {
        text: 'First interaction: No previous attendance conversations or commitments recorded for this helper.',
        facts: []
      };
    }

    const latest = rows[0];
    const prevDate = latest.created_at.split('T')[0];
    const text = `Previous check-in on ${prevDate}. Record shows: ${latest.content}. Recommended stance: Validate how the previous commitment is progressing rather than treating as first offense.`;

    return {
      text,
      facts: rows.map(r => ({ text: r.content, date: r.created_at })),
      mode: 'local_resilient'
    };
  }
}

const hindsightInstance = new HindsightManager();

module.exports = {
  hindsight: hindsightInstance,
  recallResponseToPromptString
};
