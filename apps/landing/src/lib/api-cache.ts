/**
 * Server-side API Cache, Rate Limiter & Request Coalescer
 *
 * Production-grade layer between API routes and the database.
 * Prevents DB overload by:
 *   1. Caching — TTL-based in-memory cache per user+endpoint
 *   2. Coalescing — Deduplicates concurrent identical requests
 *   3. Rate limiting — Sliding window per user per endpoint
 *
 * Architecture mirrors how Linear, Notion, and Vercel dashboard APIs work:
 *   Request → Rate Limit check → Cache check → Coalesce check → DB query → Cache store → Response
 */

// ─── Types ───────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  staleAt: number; // For stale-while-revalidate
}

interface RateWindow {
  count: number;
  windowStart: number;
}

// ─── Cache Store (global to survive HMR) ─────────────────────

const g = globalThis as unknown as {
  __apiCache?: Map<string, CacheEntry>;
  __rateLimits?: Map<string, RateWindow>;
  __inflight?: Map<string, Promise<unknown>>;
  __cacheCleanupTimer?: ReturnType<typeof setInterval>;
};

if (!g.__apiCache) g.__apiCache = new Map();
if (!g.__rateLimits) g.__rateLimits = new Map();
if (!g.__inflight) g.__inflight = new Map();

const cache = g.__apiCache;
const rateLimits = g.__rateLimits;
const inflight = g.__inflight;

// Periodic cleanup every 60s to prevent memory leaks
// Also caps total entries to prevent unbounded growth under high user load
const MAX_CACHE_ENTRIES = 10_000;
const MAX_RATE_ENTRIES = 50_000;

if (!g.__cacheCleanupTimer) {
  g.__cacheCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
    for (const [key, window] of rateLimits) {
      if (now - window.windowStart > 120_000) rateLimits.delete(key);
    }
    // Hard caps: evict oldest entries if over limit
    if (cache.size > MAX_CACHE_ENTRIES) {
      const excess = cache.size - MAX_CACHE_ENTRIES;
      const iter = cache.keys();
      for (let i = 0; i < excess; i++) iter.next().value && cache.delete(iter.next().value!);
    }
    if (rateLimits.size > MAX_RATE_ENTRIES) {
      const excess = rateLimits.size - MAX_RATE_ENTRIES;
      const iter = rateLimits.keys();
      for (let i = 0; i < excess; i++) iter.next().value && rateLimits.delete(iter.next().value!);
    }
  }, 60_000);
}

// ─── Configuration ───────────────────────────────────────────

export interface CacheConfig {
  /** Cache TTL in ms (fresh data) */
  ttl: number;
  /** Stale-while-revalidate window in ms (serve stale, refresh in bg) */
  swr?: number;
  /** Rate limit: max requests per window */
  rateLimit?: number;
  /** Rate limit window in ms (default: 60s) */
  rateWindow?: number;
}

/** Pre-configured TTLs for dashboard endpoints */
export const CACHE_PROFILES = {
  /** Stats: cached 30s, stale OK for 60s */
  stats: { ttl: 30_000, swr: 60_000, rateLimit: 20, rateWindow: 60_000 } as CacheConfig,
  /** Memories list: cached 15s, stale OK for 30s */
  memories: { ttl: 15_000, swr: 30_000, rateLimit: 30, rateWindow: 60_000 } as CacheConfig,
  /** Buckets: cached 30s, stale OK for 60s */
  buckets: { ttl: 30_000, swr: 60_000, rateLimit: 20, rateWindow: 60_000 } as CacheConfig,
  /** Notifications: cached 30s, stale OK for 60s */
  notifications: { ttl: 30_000, swr: 60_000, rateLimit: 20, rateWindow: 60_000 } as CacheConfig,
  /** Webhooks: cached 15s */
  webhooks: { ttl: 15_000, swr: 30_000, rateLimit: 20, rateWindow: 60_000 } as CacheConfig,
  /** API Keys: cached 10s */
  keys: { ttl: 10_000, swr: 20_000, rateLimit: 15, rateWindow: 60_000 } as CacheConfig,
} as const;

// ─── Rate Limiter ────────────────────────────────────────────

/**
 * Check if a request should be rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfter: ms }.
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  config: CacheConfig,
): { allowed: boolean; retryAfter?: number } {
  if (!config.rateLimit) return { allowed: true };

  const key = `rl:${userId}:${endpoint}`;
  const now = Date.now();
  const windowMs = config.rateWindow || 60_000;

  const existing = rateLimits.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= config.rateLimit) {
    const retryAfter = windowMs - (now - existing.windowStart);
    return { allowed: false, retryAfter };
  }

  existing.count++;
  return { allowed: true };
}

// ─── Cache + Coalescing ──────────────────────────────────────

/**
 * Get cached data or execute the fetcher.
 * Handles:
 *   - Fresh cache hit → return immediately
 *   - Stale cache hit → return stale, refresh in background
 *   - Cache miss → coalesce concurrent requests, execute once
 */
export async function cachedQuery<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  config: CacheConfig,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(cacheKey) as CacheEntry<T> | undefined;

  // Fresh cache hit
  if (entry && now < entry.staleAt) {
    return entry.data;
  }

  // Stale but within SWR window — return stale, refresh in background
  if (entry && now < entry.expiresAt) {
    // Fire background refresh (don't await)
    if (!inflight.has(cacheKey)) {
      const bgRefresh = executeFetcher(cacheKey, fetcher, config);
      bgRefresh.catch(() => { /* background refresh failure is non-critical */ });
    }
    return entry.data;
  }

  // Cache miss — execute with coalescing
  return executeFetcher(cacheKey, fetcher, config);
}

async function executeFetcher<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  config: CacheConfig,
): Promise<T> {
  // Check if there's already an in-flight request for this key
  const existing = inflight.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  // Execute and coalesce
  const promise = fetcher()
    .then((data) => {
      const now = Date.now();
      cache.set(cacheKey, {
        data,
        staleAt: now + config.ttl,
        expiresAt: now + config.ttl + (config.swr || 0),
      });
      return data;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, promise);
  return promise;
}

// ─── Cache Invalidation ──────────────────────────────────────

/** Invalidate all cache entries for a user */
export function invalidateUser(userId: string): void {
  for (const key of cache.keys()) {
    if (key.includes(userId)) cache.delete(key);
  }
}

/** Invalidate specific endpoint cache for a user */
export function invalidateEndpoint(userId: string, endpoint: string): void {
  const prefix = `${endpoint}:${userId}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Invalidate everything (e.g. after deploy) */
export function invalidateAll(): void {
  cache.clear();
}
