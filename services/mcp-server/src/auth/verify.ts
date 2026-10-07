/**
 * Token Verifier — Validates bearer tokens for MCP requests.
 *
 * Supports two authentication methods:
 * 1. JWT access tokens (issued by our OAuth flow)
 * 2. Memron API keys (generated in dashboard, used directly as bearer tokens)
 *
 * Both methods return the same AuthInfo structure so tool handlers
 * don't care which auth method was used.
 */
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import * as tokens from '../lib/tokens.js';
import * as db from '../db/queries.js';

/**
 * Implements OAuthTokenVerifier from the MCP SDK.
 * The requireBearerAuth middleware calls this to validate every request.
 */
export class MemronTokenVerifier {
  /**
   * Verify a bearer token and return user identity + scopes.
   *
   * 1. Try JWT verification first (fast, no DB call)
   * 2. If JWT fails, check if it's a Memron API key (DB lookup)
   * 3. If both fail, throw (request is rejected with 401)
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // A JWT-shaped credential can only be an OAuth access token. Do not send
    // malformed, expired, or differently-signed JWTs through the API-key
    // database fallback: that adds a 4-second Hyperdrive timeout to every
    // expired OAuth request and makes MCP clients retry in a tight loop.
    const looksLikeJwt = token.split('.').length === 3;

    // ── Attempt 1: JWT Access Token ──────────────────────────
    try {
      const payload = await tokens.verifyAccessToken(token);
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0 || !payload.cid || !payload.email) {
        throw new Error('Invalid access token claims');
      }
      return {
        token,
        clientId: payload.cid,
        scopes: payload.scopes ?? [],
        expiresAt: payload.exp,
        extra: {
          userId,
          email: payload.email,
          orgId: payload.org ? parseInt(payload.org, 10) : undefined,
        },
      };
    } catch {
      if (looksLikeJwt) {
        throw new Error('Invalid or expired access token');
      }
      // Not a JWT-shaped token — try API key
    }

    // ── Attempt 2: Memron API Key ────────────────────────────
    // Do not gate the lookup on the current display format. Older keys and
    // keys issued by the dashboard before a format change are still safely
    // authenticated by their hash in the database.
    if (token.length > 0) {
      const keyHash = tokens.hashApiKey(token);
      const result = await db.getUserByApiKeyHash(keyHash);

      if (result) {
        return {
          token,
          clientId: 'api-key',
          scopes: result.keyScopes,
          extra: {
            userId: result.user.id,
            email: result.user.email,
            orgId: result.orgId ?? undefined,
            apiKeyId: result.apiKeyId,
          },
        };
      }
    }

    // ── Both Failed ──────────────────────────────────────────
    throw new Error('Invalid or expired access token');
  }
}
