/**
 * API Route Guard — Wraps Next.js API handlers with production-grade protections.
 *
 * Provides:
 *   - Authentication (WorkOS AuthKit sealed session cookie)
 *   - Rate limiting (sliding window per user)
 *   - Response caching (TTL + stale-while-revalidate)
 *   - Request coalescing (dedup concurrent identical requests)
 *   - Standardized error responses
 *
 * Usage:
 *   export const GET = guardedRoute({
 *     cache: CACHE_PROFILES.stats,
 *     handler: async (userId, request) => {
 *       // ... your logic ...
 *       return { data: result };
 *     },
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from './session';
import { cachedQuery, checkRateLimit, invalidateEndpoint, type CacheConfig } from './api-cache';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthResult {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  /** 'password' for email users; provider name ('google'/'github') for OAuth. */
  provider?: string;
}

interface GuardedRouteOptions<T> {
  /** Cache/rate-limit profile. Omit for no caching (writes). */
  cache?: CacheConfig;
  /** The endpoint name for cache key scoping */
  endpoint?: string;
  /** The actual handler. Receives userId + optional request. */
  handler: (userId: string, request?: NextRequest) => Promise<T>;
  /** If true, invalidate cache for this endpoint after success (for mutations) */
  invalidateAfter?: boolean;
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────

/**
 * Authenticate request using the WorkOS sealed session cookie.
 * Returns user info or null if not authenticated.
 */
export async function auth(request?: NextRequest): Promise<AuthResult | null> {
  const claims = getSessionFromRequest(request);
  if (!claims) {
    return null;
  }

  return {
    uid: claims.sub,
    email: claims.email,
    emailVerified: claims.emailVerified,
    provider: claims.provider,
  };
}

/**
 * Get authenticated user ID from request.
 * Throws if not authenticated.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const user = await auth(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

// ─── Guarded Route Helper ────────────────────────────────────────────────────

export function guardedRoute<T>(opts: GuardedRouteOptions<T>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Authenticate using the WorkOS sealed session cookie
      const user = await auth(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const userId = user.uid;

      // 2. Rate limit
      if (opts.cache) {
        const endpoint = opts.endpoint || 'default';
        const rlResult = checkRateLimit(userId, endpoint, opts.cache);
        if (!rlResult.allowed) {
          return NextResponse.json(
            { error: 'Too many requests. Please slow down.' },
            {
              status: 429,
              headers: {
                'Retry-After': String(Math.ceil((rlResult.retryAfter || 60_000) / 1000)),
              },
            },
          );
        }
      }

      // 3. Execute with cache or directly
      let data: T;

      if (opts.cache && !opts.invalidateAfter) {
        // Build cache key from userId + endpoint + query params
        const endpoint = opts.endpoint || 'default';
        const url = request?.url;
        const search = url ? new URL(url).search : '';
        const cacheKey = `${endpoint}:${userId}${search}`;

        data = await cachedQuery(cacheKey, () => opts.handler(userId, request), opts.cache);
      } else {
        data = await opts.handler(userId, request);
      }

      // 4. Invalidate cache after mutations
      if (opts.invalidateAfter && opts.endpoint) {
        invalidateEndpoint(userId, opts.endpoint);
      }

      return NextResponse.json(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error(`[API ${opts.endpoint || 'unknown'}] Error:`, message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
