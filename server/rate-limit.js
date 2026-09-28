/**
 * In-memory token-bucket rate limiter, per client IP and per route group.
 *
 * Each group refills `limit` tokens per `windowMs`, so a burst of `limit` is allowed and the
 * sustained rate is limit/window. Over the limit the request gets 429 with Retry-After.
 * The status polls that the console and helper phone make every 1-1.5 s are exempt.
 */
const DEFAULT_GROUPS = [
  { name: 'voice', prefix: '/api/voice/', limit: 30, windowMs: 60_000 },
  { name: 'memory', prefix: '/api/memory/', limit: 60, windowMs: 60_000 },
];

function defaultExempt(req) {
  if (req.method !== 'GET') return false;
  return req.path === '/api/voice/incoming'
    || req.path === '/api/memory/status'
    || /^\/api\/voice\/session\/[^/]+$/.test(req.path);
}

function createRateLimiter({ groups = DEFAULT_GROUPS, exempt = defaultExempt, now = Date.now, maxKeys = 10_000 } = {}) {
  const buckets = new Map(); // "group|ip" -> { tokens, updated }

  function prune(t) {
    for (const [key, b] of buckets) {
      const g = groups.find(x => key.startsWith(x.name + '|'));
      if (!g || t - b.updated >= g.windowMs) buckets.delete(key);
    }
  }

  function take(group, ip) {
    const t = now();
    const key = group.name + '|' + ip;
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= maxKeys) prune(t);
      b = { tokens: group.limit, updated: t };
      buckets.set(key, b);
    }
    const perMs = group.limit / group.windowMs;
    b.tokens = Math.min(group.limit, b.tokens + (t - b.updated) * perMs);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, remaining: Math.floor(b.tokens) };
    }
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((1 - b.tokens) / perMs / 1000)) };
  }

  function rateLimit(req, res, next) {
    const group = groups.find(g => req.path.startsWith(g.prefix));
    if (!group || exempt(req)) return next();
    const r = take(group, req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');
    res.set('X-RateLimit-Limit', String(group.limit));
    if (r.ok) {
      res.set('X-RateLimit-Remaining', String(r.remaining));
      return next();
    }
    res.set('Retry-After', String(r.retryAfterS));
    return res.status(429).json({ error: `Too many requests. Try again in ${r.retryAfterS} s.`, code: 'RATE_LIMITED' });
  }

  rateLimit.reset = () => buckets.clear();
  return rateLimit;
}

module.exports = { createRateLimiter, DEFAULT_GROUPS };
