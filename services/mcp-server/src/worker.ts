/**
 * Cloudflare Workers Entry — second production front door for the MCP server.
 *
 * Render remains the full deployment (HTTP + background workers + timers).
 * This worker serves the SAME tools, auth, memory logic, schema, and API
 * behavior over the SAME shared database, but request-scoped only:
 *
 * - No background ticks (analysis/index/sweep timers don't exist here).
 *   The durable Postgres job queues make this safe: this worker ENQUEUES
 *   index jobs on every store, and the Render instance PROCESSES them.
 * - No conversation auto-ingest capture (per-request transports have no
 *   session lifecycle to flush from). Tool behavior is otherwise identical.
 * - Stateless MCP transports (no cross-request session map; isolates are
 *   ephemeral and requests may land anywhere on the edge).
 *
 * What MUST be configured in wrangler.toml / secrets (never hardcoded):
 *   [[hyperdrive]] binding = "HYPERDRIVE"   (Postgres proxy — Workers have no TCP)
 *   ENCRYPTION_SECRET, JWT_SECRET, GEMINI_API_KEY (+ optional provider keys)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { setEnvSource, getEnv } from './env.js';
import { createMcpServer } from './mcp.js';
import { MemronTokenVerifier } from './auth/verify.js';

interface WorkerBindings {
  HYPERDRIVE?: { connectionString: string };
  MEMRON_RUNTIME?: string;
  ALLOWED_ORIGINS?: string;
  RATE_LIMIT_MCP?: string;
  [key: string]: unknown;
}

const tokenVerifier = new MemronTokenVerifier();

// ─── Best-effort per-isolate rate limiting ─────────────────────
// Cloudflare's edge already absorbs L3/L4 abuse; this is application-level
// fairness per isolate (no shared state across isolates by design).
const rateWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED_IPS = 5000;

function rateLimited(ip: string, maxPerMinute: number): boolean {
  const now = Date.now();
  // Bound the map so a botnet can't grow memory without limit.
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
  // Static per deployment — idempotent, safe to run on every request.
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

function jsonError(status: number, error: string, description: string): Response {
  return Response.json({ error, error_description: description }, { status });
}

const app = new Hono<{ Bindings: WorkerBindings }>();

app.use('*', async (c, next) => {
  const allowed = getEnv('ALLOWED_ORIGINS');
  const origins = allowed ? allowed.split(',').map((s) => s.trim()).filter(Boolean) : ['*'];
  return cors({
    origin: origins,
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
  })(c, next);
});

// ─── Health (no DB hit — safe for keep-alive pingers) ──────────
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    runtime: 'cloudflare-worker',
    service: 'memron-mcp',
    time: new Date().toISOString(),
  });
});

// ─── MCP — Streamable HTTP (stateless) ─────────────────────────
app.all('/mcp', async (c) => {
  const env = c.env;
  injectEnv(env);

  // Rate limit before any expensive work (auth DB lookup, embeddings).
  const maxPerMinute = parseInt(getEnv('RATE_LIMIT_MCP') || '100', 10);
  if (rateLimited(clientIp(c.req.raw), maxPerMinute)) {
    return c.json({ error: 'Too many requests, please try again later' }, 429);
  }

  // Auth — identical semantics to Render's universalAuth: API key fast path
  // and OAuth JWT both handled inside the shared verifier (no Express needed).
  const authHeader = c.req.header('authorization');
  if (!authHeader) {
    return jsonError(401, 'unauthorized', 'Missing Authorization header. Use: Bearer <api_key> or Bearer <oauth_token>');
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let authInfo;
  try {
    authInfo = await tokenVerifier.verifyAccessToken(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authentication failed';
    const status = /invalid|expired|unauthorized/i.test(msg) ? 401 : 500;
    return jsonError(status, status === 401 ? 'invalid_token' : 'server_error', msg);
  }

  try {
    // Stateless transport: a fresh server per request. No session map, no
    // timers, nothing to leak across the isolate's lifetime.
    const mcpServer = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer.connect(transport);
    const response = await transport.handleRequest(c.req.raw, { authInfo });
    // Proactively release transport resources; stateless mode holds no
    // session state worth keeping.
    await transport.close().catch(() => undefined);
    return response;
  } catch (err) {
    console.error('[Worker] MCP request failed:', err instanceof Error ? err.message : err);
    return jsonError(500, 'server_error', 'MCP request failed');
  }
});

// ─── Fallback ──────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[Worker] Unhandled error:', err instanceof Error ? err.message : err);
  return c.json({ error: 'server_error' }, 500);
});

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    return app.fetch(request, env);
  },
};
