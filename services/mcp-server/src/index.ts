/**
 * Memron MCP Server — Main Entry Point
 *
 * Express server that hosts:
 * 1. OAuth 2.1 + PKCE authentication (/.well-known, /authorize, /token, /register, /revoke)
 * 2. Direct API key auth (Bearer mm_live_xxx — no OAuth dance needed)
 * 3. Custom auth login page (/auth/login, /auth/complete)
 * 4. MCP Streamable HTTP endpoint (/mcp) — dual auth support
 * 5. Health endpoint (/health)
 *
 * Cross-Agent Compatibility:
 * - Cursor, VS Code Copilot, Windsurf → Streamable HTTP + OAuth
 * - Claude Desktop, Cline, Roo Code  → stdio bridge (src/stdio.ts)
 * - Warp, OpenAI Codex, Gemini       → Direct HTTP + API key bearer
 * - All agents                        → mcp-remote proxy supported
 *
 * Architecture:
 * - One Express app
 * - MCP SDK mcpAuthRouter for OAuth (optional — API key works without it)
 * - StreamableHTTPServerTransport per session (stateful)
 * - Stateless fallback for simple request/response agents
 * - Session idle timeout with automatic cleanup
 * - 9 MCP tools: memory (4), profile (2), context (1), system (2)
 */

// Load .env files before anything else (cross-platform, works on Windows + Linux)
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { config } from './config.js';
import { testConnection, warmPool, close as closeDb } from './db/client.js';
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

// ─────────────────────────────────────────────────────────────
// Static Files + Middleware
// ─────────────────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '..', 'public'), { maxAge: '7d' }));

app.use(express.json());

app.use(cors({
  origin: true,
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
// OAuth 2.1 Auth Routes (mounted by MCP SDK)
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

    console.log(`[Auth] API key verified for user ${keyResult.user.id} (${keyResult.user.email})`);

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

    res.json({ redirect: redirectUrl.toString() });
  } catch (error) {
    console.error('[Auth] Complete error:', error);
    res.status(500).json({ error: 'Authorization failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Dual Auth Middleware — OAuth bearer OR direct API key
// ─────────────────────────────────────────────────────────────

const sdkBearerAuth = requireBearerAuth({
  verifier: tokenVerifier as any,
  resourceMetadataUrl: `${config.serverUrl}/.well-known/oauth-protected-resource/mcp`,
});

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

  // Fallback: OAuth JWT via SDK
  sdkBearerAuth(req, res, next);
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
        console.log(`[MCP] Session created: ${newSessionId.slice(0, 8)}... (user: ${userId ?? 'unknown'})`);
      },
    });

    await mcpServer.connect(transport);

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        sessions.delete(sid);
        console.log(`[MCP] Session closed: ${sid.slice(0, 8)}...`);
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
  console.log('┌─────────────────────────────────────────┐');
  console.log('│      Memron MCP Server v1.0.0           │');
  console.log('└─────────────────────────────────────────┘');
  console.log();
  console.log(`Environment: ${config.isRailway ? `Railway (${process.env.RAILWAY_ENVIRONMENT})` : config.nodeEnv}`);
  console.log(`Server URL:  ${config.serverUrl}`);
  console.log();

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[FATAL] Cannot connect to PostgreSQL. Check PG_* environment variables.');
    process.exit(1);
  }
  await runMigrations();
  await warmPool();
  console.log('[OK] Connection pool warmed');

  if (!testEncryption()) {
    console.error('[FATAL] Encryption self-test failed. Check ENCRYPTION_SECRET.');
    process.exit(1);
  }
  console.log('[OK] Encryption self-test passed');

  sweepTimer = setInterval(sweepIdleSessions, IDLE_SWEEP_INTERVAL_MS);

  // Railway assigns PORT dynamically — bind to 0.0.0.0 for external access
  const host = config.isRailway ? '0.0.0.0' : '127.0.0.1';

  const server = app.listen(config.port, host, () => {
    console.log();
    console.log(`[OK] MCP Server listening on ${host ?? 'localhost'}:${config.port}`);
    console.log(`     HTTP endpoint: ${config.serverUrl}/mcp`);
    console.log(`     Health:        ${config.serverUrl}/health`);
    console.log(`     OAuth:         ${config.serverUrl}/.well-known/oauth-authorization-server`);
    console.log(`     PRM:           ${config.serverUrl}/.well-known/oauth-protected-resource/mcp`);
    console.log();
    console.log('Auth modes:');
    console.log('  • OAuth 2.1 + PKCE   (VS Code, Cursor, Windsurf)');
    console.log('  • Direct API key      (all agents via Bearer mm_live_xxx)');
    console.log('  • stdio bridge        (node dist/stdio.js — Claude Desktop, Cline)');
    console.log();
    console.log('Tools: memory_store, memory_search, memory_update, memory_delete,');
    console.log('       profile_get, profile_update, context_build,');
    console.log('       system_health, system_stats');
    console.log();
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

main().catch((error) => {
  console.error('[FATAL] Startup failed:', error);
  process.exit(1);
});
