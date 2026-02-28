/**
 * Memron MCP Server — Main Entry Point
 *
 * Express server that hosts:
 * 1. OAuth 2.1 + PKCE authentication (/.well-known, /authorize, /token, /register, /revoke)
 * 2. Custom auth login page (/auth/login, /auth/complete)
 * 3. MCP Streamable HTTP endpoint (/mcp) — protected by bearer auth
 * 4. Health endpoint (/health)
 *
 * Architecture:
 * - One Express app
 * - MCP SDK mcpAuthRouter for OAuth
 * - StreamableHTTPServerTransport per session
 * - New McpServer per session (SDK requirement)
 * - 9 MCP tools: memory (4), profile (2), context (1), system (2)
 */
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { config } from './config.js';
import { testConnection, close as closeDb } from './db/client.js';
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

// Session management: transport + server per authenticated session
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
}>();

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  exposedHeaders: ['Mcp-Session-Id'],
}));

// ─────────────────────────────────────────────────────────────
// OAuth 2.1 Auth Routes (mounted by MCP SDK)
// ─────────────────────────────────────────────────────────────

const issuerUrl = new URL(config.serverUrl);

app.use(mcpAuthRouter({
  provider: oauthProvider as any,
  issuerUrl,
  baseUrl: issuerUrl,
  serviceDocumentationUrl: new URL('https://docs.memron.ai'),
  scopesSupported: ['memory:read', 'memory:write', 'profile:read', 'profile:write'],
  resourceName: 'Memron MCP Server',
}));

// ─────────────────────────────────────────────────────────────
// Custom Auth Routes (login page + API key verification)
// ─────────────────────────────────────────────────────────────

/**
 * GET /auth/login — Render the API key login page.
 * Users are redirected here from the OAuth /authorize endpoint.
 */
app.get('/auth/login', (req, res) => {
  const requestId = req.query.request_id as string;
  const error = req.query.error as string | undefined;

  if (!requestId) {
    res.status(400).send('Missing request_id parameter');
    return;
  }

  res.type('html').send(renderLoginPage(requestId, error));
});

/**
 * POST /auth/complete — Verify API key and complete OAuth flow.
 *
 * 1. Verify the API key against the database
 * 2. Find the pending auth request
 * 3. Generate an authorization code
 * 4. Return redirect URL (to VS Code's local server)
 */
app.post('/auth/complete', express.json(), async (req, res) => {
  try {
    const { request_id, api_key } = req.body;

    if (!request_id || !api_key) {
      res.status(400).json({ error: 'Missing request_id or api_key' });
      return;
    }

    // Validate API key format
    if (!tokens.isApiKey(api_key)) {
      res.status(400).json({ error: 'Invalid API key format. Expected: mm_{env}_{key}' });
      return;
    }

    // Look up API key in database
    const keyHash = tokens.hashApiKey(api_key);
    const keyResult = await db.getUserByApiKeyHash(keyHash);

    if (!keyResult) {
      res.status(401).json({ error: 'Invalid API key. Check your key and try again.' });
      return;
    }

    // Look up the pending auth request
    const pending = await db.getPendingAuth(request_id);
    if (!pending) {
      res.status(400).json({ error: 'Authorization request expired. Please try connecting again.' });
      return;
    }

    // Generate an authorization code
    const authCode = tokens.generateAuthCode();

    // Store the auth code (links to the user + original PKCE challenge)
    await db.insertAuthCode({
      code: authCode,
      clientId: pending.client_id,
      userId: keyResult.user.id,
      codeChallenge: pending.code_challenge,
      redirectUri: pending.redirect_uri,
      scopes: pending.scopes ?? ['memory:read', 'memory:write'],
    });

    // Clean up the pending request
    await db.deletePendingAuth(request_id);

    // Build redirect URL with auth code + state
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
// MCP Endpoint — Streamable HTTP Transport
// ─────────────────────────────────────────────────────────────

const bearerAuth = requireBearerAuth({
  verifier: tokenVerifier as any,
  resourceMetadataUrl: `${config.serverUrl}/.well-known/oauth-protected-resource`,
});

/**
 * POST /mcp — Handle MCP JSON-RPC requests.
 * Creates a new session on first request, reuses existing sessions.
 */
app.post('/mcp', bearerAuth, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }

    // New session (initialization request)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);

    // Store session
    const newSessionId = transport.sessionId;
    if (newSessionId) {
      sessions.set(newSessionId, { transport, server: mcpServer });
    }

    // Cleanup on close
    transport.onclose = () => {
      if (newSessionId) {
        sessions.delete(newSessionId);
        console.log(`[MCP] Session closed: ${newSessionId.slice(0, 8)}...`);
      }
    };

    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] Request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * GET /mcp — SSE stream for server-initiated messages.
 */
app.get('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  try {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] SSE error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * DELETE /mcp — Close an MCP session.
 */
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.close();
    await session.server.close();
    sessions.delete(sessionId);
    res.status(200).end();
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
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
// Server Bootstrap
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('┌─────────────────────────────────────────┐');
  console.log('│      Memron MCP Server v1.0.0           │');
  console.log('└─────────────────────────────────────────┘');
  console.log();

  // Test database connection
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[FATAL] Cannot connect to PostgreSQL. Check PG_* environment variables.');
    process.exit(1);
  }

  // Run migrations
  await runMigrations();

  // Test encryption
  if (!testEncryption()) {
    console.error('[FATAL] Encryption self-test failed. Check ENCRYPTION_SECRET.');
    process.exit(1);
  }
  console.log('[OK] Encryption self-test passed');

  // Start HTTP server
  const server = app.listen(config.port, () => {
    console.log();
    console.log(`[OK] MCP Server listening on port ${config.port}`);
    console.log(`     MCP endpoint:  ${config.serverUrl}/mcp`);
    console.log(`     Health:        ${config.serverUrl}/health`);
    console.log(`     OAuth meta:    ${config.serverUrl}/.well-known/oauth-authorization-server`);
    console.log();
    console.log('Tools registered: memory_store, memory_search, memory_update, memory_delete,');
    console.log('                  profile_get, profile_update, context_build,');
    console.log('                  system_health, system_stats');
    console.log();
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down...`);

    // Close all MCP sessions
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

    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[FATAL] Startup failed:', error);
  process.exit(1);
});
