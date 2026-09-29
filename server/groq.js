/** Minimal Groq chat-completions client (OpenAI-compatible endpoint). */
require('dotenv').config();

// One key, or a comma-separated pool (GROQ_API_KEYS) from different teammates' accounts.
// Free-tier limits are per account, so the pool is rotated on a 429 before changing model.
const API_KEYS = String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(k => k.trim()).filter(k => k && !/mock/i.test(k));
const API_KEY = API_KEYS[0] || '';
const KEY_COOLDOWN_UNTIL = new Map(); // key -> epoch ms when it may be used again
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function isConfigured() {
  return API_KEYS.length > 0;
}

function keyLabel(key) {
  return key.slice(0, 7) + '…' + key.slice(-4);
}

function usableKeys() {
  const now = Date.now();
  const ready = API_KEYS.filter(k => (KEY_COOLDOWN_UNTIL.get(k) || 0) <= now);
  return ready.length ? ready : API_KEYS; // if everything is cooling down, still try in order
}

const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b';
// Free-tier rate limits are per model, so when one model is throttled the next one usually is not.
// Models verified on this account on 2026-09-28: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b.
const MODEL_CHAIN = [MODEL, FALLBACK_MODEL, 'qwen/qwen3.8-27b'].filter((m, i, a) => a.indexOf(m) === i);
const REASONING_MODEL = /gpt-oss|qwen3|deepseek-r1/i;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callOnce(model, messages, { temperature, maxTokens, json }, apiKey = API_KEY) {
  const body = { model, messages, temperature, max_tokens: maxTokens };
  // Reasoning models (gpt-oss, qwen3) spend tokens thinking before they answer. Keep that short
  // for a live voice turn so the spoken reply is never starved of budget.
  if (REASONING_MODEL.test(model)) body.reasoning_effort = 'low';
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    const err = new Error(`Groq request failed (${res.status}): ${text}`);
    err.status = res.status;
    const m = text.match(/try again in ([\d.]+)s/i);
    err.retryAfterMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
    throw err;
  }
  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  const msg = choice && choice.message;
  return { content: ((msg && msg.content) || '').trim(), finish: choice ? choice.finish_reason : null };
}

async function chat(messages, { temperature = 0.6, maxTokens = 400, json = false, model = MODEL } = {}) {
  if (!isConfigured()) {
    const err = new Error('GROQ_API_KEY is not set. Add it to .env to enable the voice agent.');
    err.code = 'GROQ_NOT_CONFIGURED';
    throw err;
  }
  const chain = [model].concat(MODEL_CHAIN.filter(m => m !== model));
  let lastErr = null;
  let shortestWait = null;
  for (const m of chain) {
    let modelEmpty = false;
    for (const key of usableKeys()) {
      try {
        const out = await callOnce(m, messages, { temperature, maxTokens, json }, key);
        if (out.content && out.finish !== 'length') return out.content;
        console.warn('[Groq] empty/truncated reply from ' + m + ', trying next model');
        lastErr = new Error('Groq returned an empty reply from ' + m);
        modelEmpty = true;
        break; // an empty reply is a model problem, not a key problem
      } catch (err) {
        lastErr = err;
        if (err.status === 429) {
          const wait = err.retryAfterMs || 10000;
          KEY_COOLDOWN_UNTIL.set(key, Date.now() + wait);
          if (shortestWait === null || wait < shortestWait) shortestWait = wait;
          console.warn('[Groq] rate limited: ' + m + ' on key ' + keyLabel(key) + ' (retry in ' + Math.round(wait / 1000) + 's), trying next key');
          continue;
        }
        if (err.status === 401 || err.status === 403) {
          console.warn('[Groq] key ' + keyLabel(key) + ' rejected (' + err.status + '), trying next key');
          KEY_COOLDOWN_UNTIL.set(key, Date.now() + 10 * 60 * 1000);
          continue;
        }
        if (err.status && err.status >= 500) { console.warn('[Groq] ' + m + ' returned ' + err.status + ', trying next model'); break; }
        if (!err.status) { console.warn('[Groq] ' + m + ' failed (' + err.message + '), trying next model'); break; }
        if (err.status === 404 || /model .* does not exist|decommissioned/i.test(err.message)) {
          console.warn('[Groq] model ' + m + ' is not available, trying next model');
          break;
        }
        throw err; // bad requests etc.: do not mask
      }
    }
    if (!modelEmpty) console.warn('[Groq] every key throttled on ' + m + ', falling back to next model');
  }
  // Every key on every model is throttled: wait out the shortest window once, then retry the primary.
  if (shortestWait !== null && shortestWait <= 15000) {
    console.warn('[Groq] all keys and models rate limited, waiting ' + shortestWait + 'ms');
    await sleep(shortestWait + 300);
    const out = await callOnce(model, messages, { temperature, maxTokens, json }, usableKeys()[0]);
    if (out.content && out.finish !== 'length') return out.content;
  }
  throw lastErr || new Error('Groq request failed.');
}

/** Ask for JSON and parse it defensively. */
async function chatJson(messages, opts = {}) {
  const raw = await chat(messages, { ...opts, json: true, temperature: opts.temperature ?? 0.1 });
  try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (e) { /* fall through */ } }
  throw new Error('Groq returned non-JSON output for a JSON request.');
}

module.exports = { isConfigured, chat, chatJson, MODEL, FALLBACK_MODEL, MODEL_CHAIN, keyCount: () => API_KEYS.length };
