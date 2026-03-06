/**
 * API Route Guard — Wraps Next.js API handlers with production-grade protections.
 *
 * Provides:
 *   - Authentication (Clerk)
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
import { auth } from '@clerk/nextjs/server';
import { cachedQuery, checkRateLimit, invalidateEndpoint, type CacheConfig } from './api-cache';

interface GuardedRouteOptions<T> {
  /** Cache/rate-limit profile. Omit for no caching (writes). */
  cache?: CacheConfig;
  /** The endpoint name for cache key scoping */
  endpoint?: string;
  /** The actual handler. Receives clerkUserId + optional request. */
  handler: (userId: string, request?: NextRequest) => Promise<T>;
  /** If true, invalidate cache for this endpoint after success (for mutations) */
  invalidateAfter?: boolean;
}

export function guardedRoute<T>(opts: GuardedRouteOptions<T>) {
  return async (request?: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Authenticate
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

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
