/**
 * Memron MCP Server — Main Entry Point
 *
 * Express server that hosts:
 * 1. OAuth 2.1 + PKCE authentication (/.well-known, /authorize, /token, /register, /revoke)
 * 2. Direct API key auth (Bearer mm_live_xxx — no OAuth dance needed)
 * 3. Custom auth login page (/auth/login, /auth/complete)
 * 4. Session-cookie auto-auth (remember me — skips login page on repeat flows)
 * 5. MCP Streamable HTTP endpoint (/mcp) — dual auth support
 * 6. Health endpoint (/health)
 *
 * Cross-Agent Compatibility:
 * - Cursor, VS Code Copilot, Windsurf → Streamable HTTP + OAuth
 * - Claude Desktop, Cline, Roo Code  → stdio bridge (src/stdio.ts)
 * - Warp, OpenAI Codex, Gemini       → Direct HTTP + API key bearer
 * - All agents                        → mcp-remote proxy supported
 *
 * Architecture:
 * - One Express app
 * - MCP SDK mcpAuthRouter for OAuth (token + register + revoke)
 * - Custom .well-known metadata (dynamic URL from request Host header)
 * - Custom /authorize with session cookie auto-approve
 * - StreamableHTTPServerTransport per session (stateful)
 * - Stateless fallback for simple request/response agents
 * - Session idle timeout with automatic cleanup
 * - 9 MCP tools: memory (4), profile (2), context (1), system (2)
 */

// Load .env files before anything else (cross-platform, works on Windows + Linux)
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { randomUUID, createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { config } from './config.js';
import { testConnection, warmPool, close as closeDb, query as dbQuery } from './db/client.js';
import { runMigrations } from './db/schema.js';
import { testEncryption } from './lib/encryption.js';
import { MemronOAuthProvider, renderLoginPage } from './auth/provider.js';
import { MemronTokenVerifier } from './auth/verify.js';
import { createMcpServer } from './mcp.js';
import * as tokens from './lib/tokens.js';
import * as db from './db/queries.js';

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

const app = express();

// Trust Railway / Docker / nginx reverse proxy headers (X-Forwarded-Proto, X-Forwarded-Host)
// Use hop count (1) instead of `true` to avoid express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY
app.set('trust proxy', 1);

const oauthProvider = new MemronOAuthProvider();
const tokenVerifier = new MemronTokenVerifier();

// ─── Session Store ───────────────────────────────────────────

interface ManagedSession {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
  lastActivity: number;
  userId?: number;
}

const sessions = new Map<string, ManagedSession>();

const SESSION_IDLE_MS = parseInt(process.env.SESSION_IDLE_MS || '1800000', 10); // 30 min
const IDLE_SWEEP_INTERVAL_MS = 60_000; // 1 min

// ─── Auth Session Cookie ─────────────────────────────────────
// After the first API key verification, we encrypt the user's ID + email
// into a secure cookie. On subsequent OAuth flows, we auto-approve without
// requiring the user to re-enter their API key ("remember me").

const SESSION_COOKIE_NAME = 'memron_session';
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
  // iv (12) + tag (16) + ciphertext → base64
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

// ─────────────────────────────────────────────────────────────
// Static Files + Middleware
// ─────────────────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '..', 'public'), { maxAge: '7d' }));

app.use(express.json({ limit: '1mb' }));

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;

app.use(cors({
  origin: config.isDev ? true : (ALLOWED_ORIGINS || true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Mcp-Session-Id',
    'Mcp-Protocol-Version',
  ],
  exposedHeaders: [
    'Mcp-Session-Id',
    'Mcp-Protocol-Version',
  ],
}));

// ─────────────────────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_MCP || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_AUTH || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts' },
});

const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_ADMIN || '3', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests' },
});

// Apply rate limiters to routes
app.use('/mcp', apiLimiter);
app.use('/auth/complete', authLimiter);
app.use('/auth/test', authLimiter);
app.use('/admin/seed-key', adminLimiter);

// ─────────────────────────────────────────────────────────────
// Dynamic Public URL Helper
// ─────────────────────────────────────────────────────────────

/**
 * Derive the actual public URL from the incoming request.
 * On Railway, the Host header = memron-mcp-beta.up.railway.app
 * Locally, Host = localhost:4201
 * This ensures OAuth metadata always returns the correct URL.
 */
function getPublicUrl(req: express.Request): string {
  const proto = req.protocol; // 'https' on Railway (trust proxy), 'http' locally
  const host = req.get('host'); // 'memron-mcp-beta.up.railway.app' or 'localhost:4201'
  return `${proto}://${host}`;
}

// ─────────────────────────────────────────────────────────────
// Custom .well-known + /authorize Endpoints
// ─────────────────────────────────────────────────────────────
// Mounted BEFORE mcpAuthRouter so they are matched first.
// The MCP SDK bakes issuerUrl into metadata at startup, which is
// wrong when Railway uses a different public domain. These handlers
// generate correct URLs dynamically from the request's Host header.
// ─────────────────────────────────────────────────────────────

// Parse cookies manually (no cookie-parser dependency needed)
function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [k, ...vParts] = pair.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(vParts.join('='));
  }
  return cookies;
}

/** OAuth Authorization Server Metadata (RFC 8414) */
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = getPublicUrl(req);
  res.json({
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

/** OAuth Protected Resource Metadata (RFC 9728) */
app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  const baseUrl = getPublicUrl(req);
  res.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
    resource_name: 'Memron MCP Server',
    resource_documentation: 'https://docs.memron.ai',
  });
});

/**
 * Custom /authorize endpoint — replaces the SDK's handler.
 *
 * Flow:
 * 1. If session cookie exists → auto-approve (skip login page)
 * 2. If no cookie → redirect to /auth/login (enter API key)
 *
 * This makes repeat OAuth flows instant — the user only enters
 * their API key once, then it's remembered via cookie.
 */
app.get('/authorize', async (req, res) => {
  try {
    const clientId = req.query.client_id as string;
    const responseType = req.query.response_type as string;
    const codeChallenge = req.query.code_challenge as string;
    const codeChallengeMethod = req.query.code_challenge_method as string;
    const redirectUri = req.query.redirect_uri as string;
    const scope = req.query.scope as string | undefined;
    const state = req.query.state as string | undefined;

    // Validate required params
    if (!clientId || responseType !== 'code' || !codeChallenge || !redirectUri) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing required parameters' });
      return;
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      res.status(400).json({ error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' });
      return;
    }

    // Verify client is registered
    const client = await oauthProvider.clientsStore.getClient(clientId);
    if (!client) {
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id. Did you register first via /register?' });
      return;
    }

    const scopes = scope ? scope.split(/[ +]/) : ['memory:read', 'memory:write'];

    // ─── Check session cookie for auto-approve ───
    const cookies = parseCookies(req);
    const sessionToken = cookies[SESSION_COOKIE_NAME];

    if (sessionToken) {
      const session = decryptSession(sessionToken);
      if (session) {
        // Verify user still exists and is active
        const user = await db.getUserById(session.userId);
        if (user) {
          // auto-approving OAuth via session cookie

          // Create auth code directly (skip login page)
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

          res.redirect(callbackUrl.toString());
          return;
        }
      }
      // Invalid/expired cookie — clear it and fall through to login
      res.clearCookie(SESSION_COOKIE_NAME);
    }

    // ─── No session cookie → redirect to login page ───
    const { nanoid } = await import('nanoid');
    const requestId = nanoid(32);

    await db.insertPendingAuth({
      requestId,
      clientId,
      codeChallenge,
      redirectUri,
      state,
      scopes,
    });

    res.redirect(`/auth/login?request_id=${encodeURIComponent(requestId)}`);
  } catch (error) {
    console.error('[Auth] Authorize error:', error);
    res.status(500).json({ error: 'server_error', error_description: 'Authorization failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// OAuth 2.1 Auth Routes (mounted by MCP SDK)
// ─────────────────────────────────────────────────────────────
// The SDK handles /token, /register, /revoke, and serves metadata.
// Our custom handlers above take precedence for .well-known and /authorize.
// ─────────────────────────────────────────────────────────────

const issuerUrl = new URL(config.serverUrl);
const resourceServerUrl = new URL(`${config.serverUrl}/mcp`);

app.use(mcpAuthRouter({
  provider: oauthProvider as any,
  issuerUrl,
  baseUrl: issuerUrl,
  resourceServerUrl,
  serviceDocumentationUrl: new URL('https://docs.memron.ai'),
  scopesSupported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
  resourceName: 'Memron MCP Server',
}));

// ─────────────────────────────────────────────────────────────
// Custom Auth Routes (login page + API key verification)
// ─────────────────────────────────────────────────────────────

app.get('/auth/login', (req, res) => {
  const requestId = req.query.request_id as string;
  const error = req.query.error as string | undefined;

  if (!requestId) {
    res.status(400).send('Missing request_id parameter');
    return;
  }

  res.type('html').send(renderLoginPage(requestId, error));
});

app.post('/auth/complete', async (req, res) => {
  try {
    const { request_id, api_key } = req.body;

    if (!request_id || !api_key) {
      res.status(400).json({ error: 'Missing request_id or api_key' });
      return;
    }

    if (!tokens.isApiKey(api_key)) {
      res.status(400).json({ error: 'Invalid API key format. Keys look like: mm_live_xxxx...' });
      return;
    }

    const keyHash = tokens.hashApiKey(api_key);
    const keyResult = await db.getUserByApiKeyHash(keyHash);

    if (!keyResult) {
      res.status(401).json({ error: 'API key not found. Make sure you generated it from the Memron dashboard.' });
      return;
    }

    // API key verified

    const pending = await db.getPendingAuth(request_id);
    if (!pending) {
      res.status(400).json({ error: 'Authorization request expired. Please try connecting again.' });
      return;
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

    // ─── Set session cookie for auto-approve on future flows ───
    const sessionToken = encryptSession({
      userId: keyResult.user.id,
      email: keyResult.user.email,
    });

    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: !config.isDev, // HTTPS only in production
      sameSite: 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    res.json({ redirect: redirectUrl.toString() });
  } catch (error) {
    console.error('[Auth] Complete error:', error);
    res.status(500).json({ error: 'Authorization failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Dual Auth Middleware — OAuth bearer OR direct API key
// ─────────────────────────────────────────────────────────────

/**
 * Create a bearer auth middleware using the actual request host.
 * This ensures the resource metadata URL is correct on Railway.
 */
function createBearerAuth(req: express.Request) {
  const publicUrl = getPublicUrl(req);
  return requireBearerAuth({
    verifier: tokenVerifier as any,
    resourceMetadataUrl: `${publicUrl}/.well-known/oauth-protected-resource/mcp`,
  });
}

/**
 * Universal auth middleware:
 * - Direct API key → validate, attach req.auth, continue
 * - OAuth JWT → delegate to SDK bearer auth
 * - No header → 401 with clear message
 */
async function universalAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing Authorization header. Use: Bearer <api_key> or Bearer <oauth_token>',
    });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');

  // Fast path: Direct API key (mm_live_xxx / mm_test_xxx / mm_dev_xxx)
  if (tokens.isApiKey(token)) {
    try {
      const keyHash = tokens.hashApiKey(token);
      const result = await db.getUserByApiKeyHash(keyHash);

      if (!result) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'API key not found or revoked.',
        });
        return;
      }

      (req as any).auth = {
        token,
        clientId: 'api-key',
        scopes: result.keyScopes,
        extra: {
          userId: result.user.id,
          email: result.user.email,
          orgId: result.orgId ?? undefined,
        },
      };

      next();
      return;
    } catch (err) {
      console.error('[Auth] API key validation error:', err);
      res.status(500).json({ error: 'server_error', error_description: 'Authentication failed' });
      return;
    }
  }

  // Fallback: OAuth JWT via SDK (dynamic URL based on request host)
  const bearerAuth = createBearerAuth(req);
  bearerAuth(req, res, next);
}

// ─────────────────────────────────────────────────────────────
// MCP Endpoint — Streamable HTTP Transport
// ─────────────────────────────────────────────────────────────

app.post('/mcp', universalAuth, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session (handles both fresh connects and stale session IDs)
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        const userId = (req as any).auth?.extra?.userId;
        sessions.set(newSessionId, {
          transport,
          server: mcpServer,
          lastActivity: Date.now(),
          userId,
        });
        // session created
      },
    });

    await mcpServer.connect(transport);

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        sessions.delete(sid);
        // session closed
      }
    };

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] POST error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', universalAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: sessionId
          ? 'Session expired. Please re-initialize.'
          : 'Missing Mcp-Session-Id header. Send an initialize request first.',
      },
      id: null,
    });
    return;
  }

  try {
    const session = sessions.get(sessionId)!;
    session.lastActivity = Date.now();
    await session.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] GET/SSE error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    try {
      await session.transport.close();
      await session.server.close();
    } catch { /* transport may already be closed */ }
    sessions.delete(sessionId);
  }
  // Always 200 — even for stale/unknown sessions (graceful cleanup)
  res.status(200).end();
});

// ─────────────────────────────────────────────────────────────
// Health Endpoint
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Auth Test / Debug Endpoint
// ─────────────────────────────────────────────────────────────

/**
 * POST /auth/test — Verify an API key without starting an MCP session.
 * Useful for debugging. Accepts { api_key: "mm_live_xxx" }
 */
app.post('/auth/test', async (req, res) => {
  try {
    const { api_key } = req.body;

    if (!api_key) {
      res.status(400).json({ error: 'Missing api_key in request body' });
      return;
    }

    if (!tokens.isApiKey(api_key)) {
      res.status(400).json({
        error: 'Invalid API key format',
        expected: 'mm_live_xxxx... (56 characters total)',
        received_length: api_key.length,
        starts_with: api_key.slice(0, 8),
      });
      return;
    }

    const keyHash = tokens.hashApiKey(api_key);
    const result = await db.getUserByApiKeyHash(keyHash);

    if (!result) {
      // Help debug: check if user/key tables exist and have data
      if (config.isDev) {
        let diagnostics: any = {};
        try {
          const userCount = await dbQuery('SELECT count(*) as c FROM users');
          const keyCount = await dbQuery('SELECT count(*) as c FROM api_keys');
          diagnostics = {
            users_in_db: parseInt(userCount.rows[0]?.c || '0'),
            keys_in_db: parseInt(keyCount.rows[0]?.c || '0'),
            key_hash_prefix: keyHash.slice(0, 16) + '...',
          };
        } catch { /* silent */ }

        res.status(401).json({
          error: 'API key not found',
          hint: 'The key hash does not match any active key in the database.',
          diagnostics,
        });
      } else {
        res.status(401).json({ error: 'API key not found' });
      }
      return;
    }

    res.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        orgId: result.orgId,
      },
      scopes: result.keyScopes,
      apiKeyId: result.apiKeyId,
    });
  } catch (error: any) {
    console.error('[Auth Test] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/seed-key — Seed a user + API key into the database.
 * This is for bootstrapping when the landing app writes to a different DB.
 *
 * Body: { api_key, email, name?, org_name?, clerk_id? }
 */
app.post('/admin/seed-key', async (req, res) => {
  // Admin endpoint requires ADMIN_SECRET in production
  if (!config.isDev) {
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'] as string;
    if (!adminSecret || providedSecret !== adminSecret) {
      res.status(403).json({ error: 'Forbidden: Invalid or missing admin secret' });
      return;
    }
  }
  try {
    const { api_key, email, name, org_name, clerk_id } = req.body;

    if (!api_key || !email) {
      res.status(400).json({ error: 'Required: api_key, email' });
      return;
    }

    if (!tokens.isApiKey(api_key)) {
      res.status(400).json({ error: 'Invalid API key format. Expected: mm_live_xxxx...' });
      return;
    }

    const keyHash = tokens.hashApiKey(api_key);
    const keyPrefix = api_key.slice(0, 12);
    const resolvedClerkId = clerk_id || `seeded_${createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
    const fullName = name || email.split('@')[0];

    // 1. Upsert user
    const userResult = await dbQuery(
      `INSERT INTO users (clerk_id, email, first_name, full_name, provider, is_onboarded, onboarded_at, last_login_at)
       VALUES ($1, $2, $3, $4, 'email', true, NOW(), NOW())
       ON CONFLICT (clerk_id) DO UPDATE SET email = $2, full_name = $4, last_login_at = NOW()
       RETURNING id, clerk_id, email`,
      [resolvedClerkId, email, fullName, fullName],
    );
    const userId = userResult.rows[0].id;

    // 2. Upsert organization
    const orgSlug = (org_name || 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const orgResult = await dbQuery(
      `INSERT INTO organizations (name, slug, owner_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET owner_id = $3, updated_at = NOW()
       RETURNING id, slug`,
      [org_name || `${fullName}'s Workspace`, orgSlug, userId],
    );
    const orgId = orgResult.rows[0].id;

    // 3. Org membership
    await dbQuery(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [orgId, userId],
    );

    // 4. Upsert API key
    await dbQuery(
      `INSERT INTO api_keys (key_prefix, key_hash, name, user_id, org_id, scopes)
       VALUES ($1, $2, 'Default API Key', $3, $4, ARRAY['memory:read', 'memory:write', 'memory:delete'])
       ON CONFLICT (key_hash) DO UPDATE SET is_active = true`,
      [keyPrefix, keyHash, userId, orgId],
    );

    // 5. Default bucket
    await dbQuery(
      `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
       VALUES ($1, $2, 'Main', 'main', 'Default memory bucket', true)
       ON CONFLICT (user_id, slug) DO NOTHING`,
      [userId, orgId],
    ).catch(() => { /* bucket table might not exist yet */ });

    console.log(`[Admin] Seeded user ${email} (id=${userId}) + API key ${keyPrefix}...`);

    res.json({
      success: true,
      user: { id: userId, email, clerkId: resolvedClerkId },
      organization: { id: orgId, slug: orgResult.rows[0].slug },
      apiKey: { prefix: keyPrefix, active: true },
    });
  } catch (error: any) {
    console.error('[Admin] Seed error:', error.message);
    res.status(500).json({ error: config.isDev ? error.message : 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// Root Landing Page — shows server info when visiting base URL
// ─────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    name: 'Memron MCP Server',
    version: '1.0.0',
    description: 'Sovereign AI Memory via Model Context Protocol',
    endpoints: {
      mcp: `${config.serverUrl}/mcp`,
      health: `${config.serverUrl}/health`,
      oauth_discovery: `${config.serverUrl}/.well-known/oauth-authorization-server`,
      protected_resource: `${config.serverUrl}/.well-known/oauth-protected-resource/mcp`,
    },
    auth: {
      methods: [
        'OAuth 2.1 + PKCE (browser-based, for VS Code / Cursor / Windsurf)',
        'Bearer API key (direct, for all agents — mm_live_xxx)',
        'stdio bridge (local, for Claude Desktop / Cline)',
      ],
    },
    docs: 'https://docs.memron.ai',
    dashboard: config.landingUrl,
  });
});

app.get('/health', async (_req, res) => {
  const dbOk = await testConnection();
  const encOk = testEncryption();

  res.json({
    status: dbOk && encOk ? 'healthy' : 'degraded',
    service: 'memron-mcp-server',
    version: '1.0.0',
    checks: {
      database: dbOk ? 'ok' : 'error',
      encryption: encOk ? 'ok' : 'error',
    },
    activeSessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// Idle Session Sweeper
// ─────────────────────────────────────────────────────────────

function sweepIdleSessions(): void {
  const now = Date.now();
  let swept = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_MS) {
      try {
        session.transport.close();
        session.server.close();
      } catch { /* ignore */ }
      sessions.delete(id);
      swept++;
    }
  }
  if (swept > 0) {
    console.log(`[MCP] Swept ${swept} idle session(s). Active: ${sessions.size}`);
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────────────────────
// Server Bootstrap
// ─────────────────────────────────────────────────────────────

async function main() {

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[FATAL] Cannot connect to PostgreSQL. Check PG_* environment variables.');
    process.exit(1);
  }
  await runMigrations();
  await warmPool();

  if (!testEncryption()) {
    console.error('[FATAL] Encryption self-test failed. Check ENCRYPTION_SECRET.');
    process.exit(1);
  }

  sweepTimer = setInterval(sweepIdleSessions, IDLE_SWEEP_INTERVAL_MS);

  // Railway assigns PORT dynamically — bind to 0.0.0.0 for external access
  const host = config.isRailway ? '0.0.0.0' : '127.0.0.1';

  const server = app.listen(config.port, host, () => {
    console.log(`  MCP Server   >> ${config.serverUrl}/mcp`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[FATAL] Port ${config.port} is already in use.`);
      console.error(`        Run: lsof -ti:${config.port} | xargs kill -9`);
    } else {
      console.error('[FATAL] Server error:', err.message);
    }
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down...`);
    if (sweepTimer) clearInterval(sweepTimer);

    for (const [id, session] of sessions) {
      try {
        await session.transport.close();
        await session.server.close();
      } catch { /* ignore */ }
      sessions.delete(id);
    }

    server.close(() => {
      closeDb().then(() => {
        console.log('[OK] Server stopped');
        process.exit(0);
      });
    });

    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export app for testing (supertest binds without starting the server)
export { app };

// Skip server bootstrap when imported by test runner
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (!isTestEnv) {
  main().catch((error) => {
    console.error('[FATAL] Startup failed:', error);
    process.exit(1);
  });
}
