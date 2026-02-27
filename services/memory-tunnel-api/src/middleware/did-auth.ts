/**
 * Authentication middleware — validates bearer tokens.
 * Agents authenticate via API key or JWT.
 */
import type { Context, Next } from 'hono';

export async function didAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authentication token' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // TODO: Verify JWT or API key
    // const verified = await verifyToken(token);
    // c.set('did', verified.issuer);
    c.set('did', 'did:memron:0x0000000000000000000000000000000000000000');
    await next();
  } catch {
    return c.json({ error: 'Invalid authentication token' }, 401);
  }
}
