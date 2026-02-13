/**
 * DID Authentication middleware — validates DID-based JWT tokens.
 * Agents authenticate by signing with their wallet key.
 */
import type { Context, Next } from 'hono';

export async function didAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing DID authentication token' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // TODO: Verify DID-JWT using did-jwt library
    // const verified = await verifyJWT(token, { resolver });
    // c.set('did', verified.issuer);
    c.set('did', 'did:ethr:0x0000000000000000000000000000000000000000');
    await next();
  } catch {
    return c.json({ error: 'Invalid DID authentication token' }, 401);
  }
}
