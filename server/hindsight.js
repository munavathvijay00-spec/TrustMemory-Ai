/**
 * Hindsight memory client (REST, spec 0.10.x).
 * Works against Hindsight Cloud (api.hindsight.vectorize.io + API key) or a
 * self-hosted server (e.g. http://localhost:8888, no key needed).
 *
 * Bank-scoped endpoints used (all under /v1/default/banks/{bank}):
 *   POST  /memories                retain
 *   POST  /memories/recall         recall (also observations via types: ["observation"])
 *   POST  /reflect                 reflect (agentic answer with citations, optional JSON schema)
 *   GET   /stats                   bank statistics
  *   PATCH /config                  disposition traits, memory defense, observation mission
 *   GET/POST /mental-models        standing answers Hindsight keeps current
 *   POST  /mental-models/{id}/refresh
 *   GET/POST/PATCH/DELETE /directives   hard rules reflect must obey
 */
require('dotenv').config();

const BASE_URL = (process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io').replace(/\/+$/, '');
const API_KEY = process.env.HINDSIGHT_API_KEY || '';
const BANK_ID = process.env.HINDSIGHT_BANK_ID || 'trustmemory-agency';

function isConfigured() {
  // Cloud needs a key. A self-hosted server (non-cloud URL, e.g. http://localhost:8888) needs none.
  if (API_KEY) return true;
  const url = process.env.HINDSIGHT_API_URL || '';
  return Boolean(url) && !/hindsight\.vectorize\.io/i.test(url);
}

function bankPath() {
  return `${BASE_URL}/v1/default/banks/${encodeURIComponent(BANK_ID)}`;
}

async function request(path, { method = 'POST', body, timeoutMs = 45000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${bankPath()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON body */ }
  if (!res.ok) {
    let detail = (data && (data.detail || data.message || data.error)) || text || res.statusText;
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
    const err = new Error(`Hindsight ${method} ${path} failed (${res.status}): ${String(detail).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function isBankMissing(err) {
  return err && err.status === 404 && /not found/i.test(err.message);
}

/* ------------------------------------------------------------------ retain */

/** items: [{ content, context, documentId, timestamp, metadata, tags }] */
async function retain(items, { async: isAsync = false } = {}) {
  if (!items.length) return { items_count: 0 };
  const body = {
    items: items.map(i => ({
      content: i.content,
      ...(i.context ? { context: i.context } : {}),
      ...(i.documentId ? { document_id: i.documentId } : {}),
      ...(i.timestamp ? { timestamp: i.timestamp } : {}),
      ...(i.metadata && Object.keys(i.metadata).length ? { metadata: i.metadata } : {}),
      ...(i.tags && i.tags.length ? { tags: i.tags } : {}),
    })),
    async: isAsync,
  };
  // Synchronous retain runs LLM fact extraction server-side, so allow a long timeout.
  return request('/memories', { body, timeoutMs: 120000 });
}

/* ------------------------------------------------------------------ recall */

function mapResult(r) {
  return {
    id: r.id || '',
    text: (r.text || '').trim(),
    type: r.type || '',
    context: r.context || '',
    mentionedAt: r.mentioned_at || r.occurred_start || '',
    occurredStart: r.occurred_start || '',
    documentId: r.document_id || '',
    tags: r.tags || [],
    entities: r.entities || [],
    sourceFactIds: r.source_fact_ids || [],
    metadata: r.metadata || {},
  };
}

async function recall(query, { tags, tagsMatch = 'any', budget = 'low', maxTokens = 1500, limit = 10, types, preferObservations, withSources = false } = {}) {
  const body = { query, budget, max_tokens: maxTokens };
  if (withSources) body.include = { source_facts: {} };
  if (tags && tags.length) { body.tags = tags; body.tags_match = tagsMatch; }
  if (types && types.length) body.types = types;
  if (preferObservations) body.prefer_observations = true;
  let data;
  try {
    data = await request('/memories/recall', { body });
  } catch (err) {
    // A bank that has never been written to does not exist yet: that is "no memories", not a failure.
    if (isBankMissing(err)) return [];
    throw err;
  }
  const sources = (data && data.source_facts) || {};
  return (data && data.results ? data.results : [])
    .filter(r => r && r.text && r.text.trim())
    .slice(0, limit)
    .map(r => {
      const m = mapResult(r);
      if (withSources) {
        m.evidence = (r.source_fact_ids || []).map(id => sources[id]).filter(Boolean)
          .map(f => ({ text: String(f.text || '').split(' | ')[0], when: f.mentioned_at || f.occurred_start || '' }));
      }
      return m;
    });
}

/** Consolidated, evidence-backed beliefs Hindsight has formed (fact type "observation"). */
async function observations(query, { tags, limit = 12 } = {}) {
  const opts = { tags, types: ['observation'], budget: 'mid', maxTokens: 2500, limit, withSources: true };
  try {
    return await recall(query, opts);
  } catch (err) {
    // The bank-wide (untagged) query occasionally fails upstream after ~10 s; a second try usually succeeds.
    if (err.status >= 500 || /timeout|fetch failed/i.test(err.message)) return recall(query, opts);
    throw err;
  }
}

/* ------------------------------------------------------------------ reflect */

async function reflect(query, { tags, tagsMatch = 'any', budget = 'low', context, responseSchema, applyAllDirectives = true, maxTokens } = {}) {
  // include.facts asks Hindsight to return what the answer was based on (memories, mental models, directives).
  const body = { query, budget, apply_all_directives: applyAllDirectives, include: { facts: {} } };
  if (context) body.context = context;
  if (maxTokens) body.max_tokens = maxTokens;
  if (responseSchema) body.response_schema = responseSchema;
  if (tags && tags.length) { body.tags = tags; body.tags_match = tagsMatch; }
  let data;
  try {
    data = await request('/reflect', { body, timeoutMs: 120000 });
  } catch (err) {
    // Reflect runs an agentic loop upstream; a gateway timeout is usually transient. Retry once.
    if (err.status === 504 || err.status === 502 || /timeout/i.test(err.message)) {
      data = await request('/reflect', { body, timeoutMs: 120000 });
    } else throw err;
  }
  const basedOn = (data && data.based_on) || {};
  return {
    text: (data && data.text) || '',
    structured: (data && data.structured_output) || null,
    structuredError: (data && data.structured_output_error) || null,
    basedOn: {
      memories: (basedOn.memories || []).map(mapResult),
      mentalModels: basedOn.mental_models || [],
      directives: basedOn.directives || [],
    },
  };
}

/* ------------------------------------------------------------------ bank admin */

async function stats() {
  try { return await request('/stats', { method: 'GET' }); }
  catch (err) { if (isBankMissing(err)) return null; throw err; }
}

/** The bank's mission (who this memory is for). Stored as reflect_mission; also used to brief consolidation. */
async function setMission(content) {
  return updateConfig({ reflect_mission: content, observations_mission: content });
}

async function updateConfig(patch) {
  // The config endpoint expects the changed fields wrapped in `updates`.
  return request('/config', { method: 'PATCH', body: { updates: patch } });
}

async function getConfig() {
  return request('/config', { method: 'GET' });
}

/* ------------------------------------------------------------------ mental models */

const mentalModels = {
  list: () => request('/mental-models', { method: 'GET' }).then(d => (d && d.items) || []),
  get: (id) => request(`/mental-models/${encodeURIComponent(id)}`, { method: 'GET' }),
  create: ({ id, name, sourceQuery, tags, maxTokens, refreshAfterConsolidation = true }) =>
    request('/mental-models', {
      body: {
        ...(id ? { id } : {}),
        name,
        source_query: sourceQuery,
        ...(tags && tags.length ? { tags } : {}),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        trigger: { refresh_after_consolidation: refreshAfterConsolidation, mode: 'delta' },
      },
      timeoutMs: 120000,
    }),
  refresh: (id) => request(`/mental-models/${encodeURIComponent(id)}/refresh`, { body: {}, timeoutMs: 120000 }),
  remove: (id) => request(`/mental-models/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ directives */

const directives = {
  list: () => request('/directives', { method: 'GET' }).then(d => (d && d.items) || []),
  create: ({ name, content, priority, isActive = true }) =>
    request('/directives', { body: { name, content, ...(priority != null ? { priority } : {}), is_active: isActive } }),
  update: (id, patch) => request(`/directives/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/directives/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

module.exports = {
  isConfigured, BANK_ID, BASE_URL,
  retain, recall, observations, reflect,
  stats, setMission, updateConfig, getConfig,
  mentalModels, directives,
};
