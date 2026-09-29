/**
 * Cloudflare Workers Entry — Production Front Door for the MCP Server.
 *
 * Full Feature Support on Edge:
 * 1. Root info metadata endpoint (GET /)
 * 2. RFC 8414 OAuth 2.1 metadata (GET /.well-known/oauth-authorization-server)
 * 3. RFC 9728 Protected Resource metadata (GET /.well-known/oauth-protected-resource/mcp)
 * 4. RFC 7591 Dynamic Client Registration (POST /register)
 * 5. OAuth 2.1 + PKCE Authorization (GET /authorize) with session cookie remember-me
 * 6. Auth Login Page (GET /auth/login)
 * 7. Auth Verification (POST /auth/complete)
 * 8. OAuth Token Exchange (POST /token) — authorization_code + refresh_token
 * 9. OAuth Token Revocation (POST /revoke)
 * 10. Auth Debug Test (POST /auth/test)
 * 11. MCP Stateless JSON-RPC (ALL /mcp) — with dual API-key & OAuth JWT auth
 * 12. Health check (GET /health)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { nanoid } from 'nanoid';
import { setEnvSource, getEnv } from './env.js';
import { config } from './config.js';
import { handleStatelessMcpRequest } from './worker-mcp-handler.js';
import { MemronOAuthProvider, renderLoginPage, renderAuthSuccessPage } from './auth/provider.js';
import { MemronTokenVerifier } from './auth/verify.js';
import { LOGO_BLACK_RAW_BASE64, LOGO_WHITE_RAW_BASE64 } from './auth/assets.js';
import * as db from './db/queries.js';
import * as tokens from './lib/tokens.js';

interface WorkerBindings {
  HYPERDRIVE?: { connectionString: string };
  MEMRON_RUNTIME?: string;
  ALLOWED_ORIGINS?: string;
  RATE_LIMIT_MCP?: string;
  ENCRYPTION_SECRET?: string;
  JWT_SECRET?: string;
  GEMINI_API_KEY?: string;
  [key: string]: unknown;
}

const oauthProvider = new MemronOAuthProvider();
const tokenVerifier = new MemronTokenVerifier();

const SESSION_COOKIE_NAME = 'memron_session';
const SESSION_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

function getSessionKey(): Buffer {
  return createHash('sha256').update(config.encryption.secret).digest();
}

function encryptSession(data: { userId: number; email: string }): string {
  const key = getSessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptSession(token: string): { userId: number; email: string } | null {
  try {
    const key = getSessionKey();
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  } catch {
    return null;
  }
}

function verifyCodeChallenge(codeVerifier: string, codeChallenge: string, method = 'S256'): boolean {
  if (method !== 'S256') return false;
  const hash = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  return hash === codeChallenge;
}

// ─── Best-effort per-isolate rate limiting ─────────────────────
const rateWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED_IPS = 5000;

function rateLimited(ip: string, maxPerMinute: number): boolean {
  const now = Date.now();
  if (rateWindows.size > MAX_TRACKED_IPS) {
    for (const [key, window] of rateWindows) {
      if (window.resetAt <= now) rateWindows.delete(key);
      if (rateWindows.size <= MAX_TRACKED_IPS) break;
    }
    if (rateWindows.size > MAX_TRACKED_IPS) rateWindows.clear();
  }
  const window = rateWindows.get(ip);
  if (!window || window.resetAt <= now) {
    rateWindows.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  window.count += 1;
  return window.count > maxPerMinute;
}

function injectEnv(env: WorkerBindings): void {
  setEnvSource({
    ...env,
    MEMRON_RUNTIME: 'worker',
    HYPERDRIVE_CONNECTION_STRING: env.HYPERDRIVE?.connectionString ?? '',
  });
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https';
  const host = req.headers.get('host') || url.host;
  return `${proto}://${host}`;
}

const app = new Hono<{ Bindings: WorkerBindings }>();

// Middleware: inject environment on every request
app.use('*', async (c, next) => {
  injectEnv(c.env);
  return next();
});

// Middleware: CORS
app.use('*', async (c, next) => {
  const allowed = getEnv('ALLOWED_ORIGINS');
  const origins = allowed ? allowed.split(',').map((s) => s.trim()).filter(Boolean) : ['*'];
  return cors({
    origin: origins.length === 1 && origins[0] === '*' ? '*' : origins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    credentials: true,
  })(c, next);
});

// ─── Root Landing Info Endpoint ───────────────────────────────
app.get('/', (c) => {
  const baseUrl = getBaseUrl(c.req.raw);
  return c.json({
    name: 'Memron MCP Server',
    version: '1.0.0',
    description: 'Sovereign AI Memory via Model Context Protocol',
    runtime: 'cloudflare-worker',
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      oauth_discovery: `${baseUrl}/.well-known/oauth-authorization-server`,
      protected_resource: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    },
    auth: {
      methods: [
        'OAuth 2.1 + PKCE (browser-based, for VS Code / Cursor / Windsurf)',
        'Bearer API key (direct, for all agents — mm_live_xxx)',
        'stdio bridge (local, for Claude Desktop / Cline)',
      ],
    },
    docs: 'https://docs.memron.ai',
    dashboard: config.landingUrl || 'https://memron-ai.vercel.app',
  });
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    runtime: 'cloudflare-worker',
    service: 'memron-mcp',
    time: new Date().toISOString(),
  });
});

// ─── OAuth 2.1 Metadata (RFC 8414) ────────────────────────────
app.get('/.well-known/oauth-authorization-server', (c) => {
  const baseUrl = getBaseUrl(c.req.raw);
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    revocation_endpoint: `${baseUrl}/revoke`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
    service_documentation: 'https://docs.memron.ai',
  });
});

// ─── OAuth Protected Resource Metadata (RFC 9728) ─────────────
app.get('/.well-known/oauth-protected-resource', (c) => {
  const baseUrl = getBaseUrl(c.req.raw);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
    resource_name: 'Memron MCP Server',
    resource_documentation: 'https://docs.memron.ai',
  });
});

app.get('/.well-known/oauth-protected-resource/mcp', (c) => {
  const baseUrl = getBaseUrl(c.req.raw);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
    resource_name: 'Memron MCP Server',
    resource_documentation: 'https://docs.memron.ai',
  });
});

// ─── Dynamic Client Registration (RFC 7591) ───────────────────
app.post('/register', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const client = await oauthProvider.clientsStore.registerClient(body);
    return c.json(client, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: 'invalid_client_metadata', error_description: msg }, 400);
  }
});

// ─── OAuth /authorize Endpoint ────────────────────────────────
app.get('/authorize', async (c) => {
  try {
    const clientId = c.req.query('client_id');
    const responseType = c.req.query('response_type');
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethod = c.req.query('code_challenge_method');
    const redirectUri = c.req.query('redirect_uri');
    const scope = c.req.query('scope');
    const state = c.req.query('state');

    if (!clientId || responseType !== 'code' || !codeChallenge || !redirectUri) {
      return c.json({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400);
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      return c.json({ error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' }, 400);
    }

    const client = await oauthProvider.clientsStore.getClient(clientId);
    if (!client) {
      return c.json({ error: 'invalid_client', error_description: 'Unknown client_id. Register first via /register' }, 400);
    }

    const scopes = scope ? scope.split(/[ +]/) : ['memory:read', 'memory:write'];

    // Auto-approve if session cookie exists
    const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);
    if (sessionCookie) {
      const session = decryptSession(sessionCookie);
      if (session) {
        const user = await db.getUserById(session.userId);
        if (user) {
          const authCode = tokens.generateAuthCode();
          await db.insertAuthCode({
            code: authCode,
            clientId,
            userId: session.userId,
            codeChallenge,
            redirectUri,
            scopes,
          });

          const callbackUrl = new URL(redirectUri);
          callbackUrl.searchParams.set('code', authCode);
          if (state) callbackUrl.searchParams.set('state', state);
          return c.redirect(callbackUrl.toString());
        }
      }
    }

    // No cookie -> store pending auth and redirect to login page
    const requestId = nanoid(32);
    await db.insertPendingAuth({
      requestId,
      clientId,
      codeChallenge,
      redirectUri,
      state,
      scopes,
    });

    return c.redirect(`/auth/login?request_id=${encodeURIComponent(requestId)}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Authorization failed';
    return c.json({ error: 'server_error', error_description: msg }, 500);
  }
});

// ─── Auth Login Page (HTML) ───────────────────────────────────
app.get('/auth/login', (c) => {
  const requestId = c.req.query('request_id');
  const error = c.req.query('error');

  if (!requestId) {
    return c.text('Missing request_id parameter', 400);
  }

  const html = renderLoginPage(requestId, error);
  return c.html(html);
});

// ─── Auth Verification (POST /auth/complete) ──────────────────
app.post('/auth/complete', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { request_id, api_key } = body;

    if (!request_id || !api_key) {
      return c.json({ error: 'Missing request_id or api_key' }, 400);
    }

    if (!tokens.isApiKey(api_key)) {
      return c.json({ error: 'Invalid API key format. Keys look like: mm_live_xxxx...' }, 400);
    }

    const keyHash = tokens.hashApiKey(api_key);
    const keyResult = await db.getUserByApiKeyHash(keyHash);

    if (!keyResult) {
      return c.json({ error: 'API key not found. Make sure you generated it from the Memron dashboard.' }, 401);
    }

    const pending = await db.getPendingAuth(request_id);
    if (!pending) {
      return c.json({ error: 'Authorization request expired. Please try connecting again.' }, 400);
    }

    const authCode = tokens.generateAuthCode();

    await db.insertAuthCode({
      code: authCode,
      clientId: pending.client_id,
      userId: keyResult.user.id,
      codeChallenge: pending.code_challenge,
      redirectUri: pending.redirect_uri,
      scopes: pending.scopes ?? ['memory:read', 'memory:write'],
    });

    await db.deletePendingAuth(request_id);

    const redirectUrl = new URL(pending.redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    if (pending.state) {
      redirectUrl.searchParams.set('state', pending.state);
    }

    const sessionToken = encryptSession({
      userId: keyResult.user.id,
      email: keyResult.user.email,
    });

    setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: SESSION_COOKIE_MAX_AGE_SEC,
      path: '/',
    });

    return c.json({ redirect: redirectUrl.toString() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Authorization failed';
    return c.json({ error: 'Authorization failed. Please try again.', details: msg }, 500);
  }
});

// ─── OAuth Token Endpoint (POST /token) ───────────────────────
app.post('/token', async (c) => {
  // RFC 6749 Section 5.1 requires no-store and no-cache on token endpoint
  c.header('Content-Type', 'application/json;charset=UTF-8');
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');

  try {
    let params: Record<string, string> = {};
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const bodyText = await c.req.text();
      const searchParams = new URLSearchParams(bodyText);
      for (const [k, v] of searchParams.entries()) {
        params[k] = v;
      }
    } else if (contentType.includes('application/json')) {
      params = await c.req.json().catch(() => ({}));
    } else {
      const bodyText = await c.req.text().catch(() => '');
      if (bodyText) {
        try {
          const searchParams = new URLSearchParams(bodyText);
          if (searchParams.has('grant_type')) {
            for (const [k, v] of searchParams.entries()) {
              params[k] = v;
            }
          } else {
            params = JSON.parse(bodyText);
          }
        } catch {
          // ignore
        }
      }
    }

    // URL search params fallback
    try {
      const urlObj = new URL(c.req.url);
      for (const [k, v] of urlObj.searchParams.entries()) {
        if (!params[k]) params[k] = v;
      }
    } catch {
      // ignore
    }

    // HTTP Basic Auth for client_id (RFC 6749 Section 2.3.1)
    const authHeader = c.req.header('authorization');
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const b64 = authHeader.slice(6).trim();
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          const u = decoded.slice(0, colonIdx);
          const p = decoded.slice(colonIdx + 1);
          if (u && !params.client_id) params.client_id = u;
          if (p && !params.client_secret) params.client_secret = p;
        }
      } catch {
        // ignore
      }
    }

    const grantType = params.grant_type;
    let clientId = params.client_id;

    // Under PKCE, public clients (CLI/VS Code) may omit client_id during token exchange
    if (!clientId && params.code) {
      const codeRow = await db.getAuthCode(params.code);
      if (codeRow?.client_id) {
        clientId = codeRow.client_id;
      }
    }
    if (!clientId) {
      clientId = 'mcp_client';
    }

    let client = await oauthProvider.clientsStore.getClient(clientId);
    if (!client) {
      client = {
        client_id: clientId,
        redirect_uris: params.redirect_uri ? [params.redirect_uri] : [],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      };
    }

    if (grantType === 'authorization_code') {
      const code = params.code;
      const codeVerifier = params.code_verifier;
      const redirectUri = params.redirect_uri;

      if (!code || !codeVerifier) {
        return c.json({ error: 'invalid_request', error_description: 'Missing code or code_verifier' }, 400);
      }

      // Verify PKCE S256
      const storedChallenge = await oauthProvider.challengeForAuthorizationCode(client, code);
      if (!verifyCodeChallenge(codeVerifier, storedChallenge, 'S256')) {
        return c.json({ error: 'invalid_grant', error_description: 'PKCE code_verifier verification failed' }, 400);
      }

      const tokenResponse = await oauthProvider.exchangeAuthorizationCode(client, code, codeVerifier, redirectUri);
      return c.json(tokenResponse, 200);
    } else if (grantType === 'refresh_token') {
      const refreshToken = params.refresh_token;
      const scope = params.scope ? params.scope.split(/[ +]/) : undefined;

      if (!refreshToken) {
        return c.json({ error: 'invalid_request', error_description: 'Missing refresh_token' }, 400);
      }

      const tokenResponse = await oauthProvider.exchangeRefreshToken(client, refreshToken, scope);
      return c.json(tokenResponse, 200);
    } else {
      return c.json({ error: 'unsupported_grant_type', error_description: `Grant type ${grantType || 'unknown'} not supported` }, 400);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Token exchange failed';
    return c.json({ error: 'invalid_grant', error_description: msg }, 400);
  }
});

// ─── OAuth Revoke Endpoint (POST /revoke) ─────────────────────
app.post('/revoke', async (c) => {
  try {
    let params: Record<string, string> = {};
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const bodyText = await c.req.text();
      const searchParams = new URLSearchParams(bodyText);
      for (const [k, v] of searchParams.entries()) {
        params[k] = v;
      }
    } else {
      params = await c.req.json().catch(() => ({}));
    }

    const clientId = params.client_id;
    const token = params.token;
    const client = clientId ? await oauthProvider.clientsStore.getClient(clientId) : { client_id: 'unknown' };

    if (token) {
      await oauthProvider.revokeToken(client as any, { token });
    }
    return c.json({ status: 'revoked' }, 200);
  } catch {
    return c.json({ status: 'revoked' }, 200);
  }
});

// ─── Auth Debug / Test Endpoint (POST /auth/test) ─────────────
app.post('/auth/test', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { api_key } = body;

    if (!api_key) return c.json({ error: 'Missing api_key' }, 400);
    if (!tokens.isApiKey(api_key)) return c.json({ error: 'Invalid API key format' }, 400);

    const keyHash = tokens.hashApiKey(api_key);
    const result = await db.getUserByApiKeyHash(keyHash);

    if (!result) return c.json({ error: 'API key not found' }, 401);

    return c.json({
      success: true,
      user: { id: result.user.id, email: result.user.email, orgId: result.orgId },
      scopes: result.keyScopes,
      apiKeyId: result.apiKeyId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    return c.json({ error: msg }, 500);
  }
});

// ─── Static Asset Routes (Direct from Edge Memory) ───────────
app.get('/logo_b.png', (c) => {
  const buf = Buffer.from(LOGO_BLACK_RAW_BASE64, 'base64');
  return new Response(buf, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
  });
});

app.get('/logo_w.png', (c) => {
  const buf = Buffer.from(LOGO_WHITE_RAW_BASE64, 'base64');
  return new Response(buf, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
  });
});

app.get('/favicon.ico', (c) => {
  const buf = Buffer.from(LOGO_BLACK_RAW_BASE64, 'base64');
  return new Response(buf, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
  });
});

// ─── Auth Success Page ────────────────────────────────────────
app.get('/auth/success', (c) => {
  return c.html(renderAuthSuccessPage());
});

// ─── MCP Stateless Handler ────────────────────────────────────
async function handleMcpRequest(c: any) {
  // 1. Rate limiting
  const maxPerMinute = parseInt(getEnv('RATE_LIMIT_MCP') || '120', 10);
  if (rateLimited(clientIp(c.req.raw), maxPerMinute)) {
    return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests, please try again later' }, id: null }, 429);
  }

  // 2. Authentication
  const authHeader = c.req.header('authorization');
  if (!authHeader) {
    return c.json(
      { error: 'unauthorized', error_description: 'Missing Authorization header. Use: Bearer <api_key> or Bearer <oauth_token>' },
      401
    );
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let authInfo;
  try {
    authInfo = await tokenVerifier.verifyAccessToken(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authentication failed';
    const status = /invalid|expired|unauthorized/i.test(msg) ? 401 : 500;
    return c.json({ error: status === 401 ? 'invalid_token' : 'server_error', error_description: msg }, status as any);
  }

  // 3. Delegate to fully stateless JSON-RPC handler (no SSE streams, no hangs)
  try {
    return await handleStatelessMcpRequest(c.req.raw, authInfo);
  } catch (err) {
    console.error('[Worker] MCP request failed:', err instanceof Error ? err.message : err);
    return c.json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal MCP error' }, id: null }, 500);
  }
}

// ─── Route Binding ────────────────────────────────────────────
// Standard MCP endpoints
app.all('/mcp', handleMcpRequest);

// Also accept POST and DELETE at root / if an MCP client is configured with the root URL
app.post('/', handleMcpRequest);
app.delete('/', handleMcpRequest);

// ─── Fallback ──────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[Worker] Unhandled error:', err instanceof Error ? err.message : err);
  return c.json({ error: 'server_error', error_description: err instanceof Error ? err.message : 'Internal error' }, 500);
});

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    return app.fetch(request, env);
  },
};
