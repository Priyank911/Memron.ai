/**
 * Rate limiting middleware — prevents abuse of memory tunnel endpoints.
 */
import type { Context, Next } from 'hono';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests = 100, windowMs = 60000) {
  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for') ?? 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(key);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= maxRequests) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    } else {
      entry.count++;
    }

    await next();
  };
}
