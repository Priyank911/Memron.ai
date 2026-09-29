/**
 * Memron MCP Server — Environment Configuration
 *
 * All configuration is loaded from environment variables with sensible defaults.
 * In production (Railway / Docker), all secrets MUST be provided via env vars.
 *
 * Railway auto-injects:
 *   RAILWAY_ENVIRONMENT       — "production" | "staging" | etc.
 *   RAILWAY_PUBLIC_DOMAIN     — e.g., "memron-mcp-production.up.railway.app"
 *   RAILWAY_PRIVATE_DOMAIN    — internal mesh hostname
 *   PORT                      — Railway assigns a random port
 */

// ─── Helpers ─────────────────────────────────────────────────

import { getEnv } from './env.js';

function requireEnv(key: string, fallback?: string): string {
  const value = getEnv(key) || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** True when running on Railway (any environment: production, staging, PR deploy) */
const envIsRailway = () => !!getEnv('RAILWAY_ENVIRONMENT');

/** True when running on Render */
const envIsRender = () => !!getEnv('RENDER');

/** True when running on Cloudflare Workers (set by worker.ts) */
const envIsWorker = () => getEnv('MEMRON_RUNTIME') === 'worker';

/** True for local development (no RAILWAY_ENVIRONMENT, no RENDER, and NODE_ENV != production) */
const envIsDev = () => !envIsRailway() && !envIsRender() && !envIsWorker() && (getEnv('NODE_ENV') || 'development') === 'development';

/**
 * Derive the public URL.
 * On Railway/Render, the actual public URL is detected dynamically from request
 * headers (Host + X-Forwarded-Proto) via middleware in index.ts.
 * This static value is only used for startup logs and as a fallback.
 */
function resolveServerUrl(): string {
  if (getEnv('MCP_SERVER_URL')) return getEnv('MCP_SERVER_URL').replace(/\/$/, '');
  if (getEnv('RENDER_EXTERNAL_URL')) return getEnv('RENDER_EXTERNAL_URL').replace(/\/$/, '');
  if (getEnv('RAILWAY_STATIC_URL')) return getEnv('RAILWAY_STATIC_URL').replace(/\/$/, '');
  if (getEnv('RAILWAY_PUBLIC_DOMAIN')) return `https://${getEnv('RAILWAY_PUBLIC_DOMAIN')}`;
  return `http://localhost:${getEnv('PORT') || '5201'}`;
}

// ─── Config ──────────────────────────────────────────────────
// Lazily built on every access (via Proxy below) so Cloudflare Workers —
// where env arrives after module load — see injected values. Consumers keep
// using `config.x` unchanged on both runtimes. Build cost is ~30 string ops
// per access; config is read a handful of times per request.

function buildConfig() {
  const isRailway = envIsRailway();
  const isRender = envIsRender();
  const isDev = envIsDev();

  return {
  /** Server */
  port: parseInt(getEnv('PORT') || '5201', 10),
  nodeEnv: getEnv('NODE_ENV') || (isRailway || isRender ? 'production' : 'development'),
  isDev,
  isRailway,
  isRender,

  /** Public-facing URL of this MCP server (auto-detected on Railway) */
  serverUrl: resolveServerUrl(),

  /** Landing app URL (used for "Get API Key" links) */
  landingUrl: getEnv('LANDING_URL') || 'https://console.memron.ai',

  /** PostgreSQL (Supabase Session Pooler or local) */
  db: {
    host: getEnv('PG_HOST') || 'localhost',
    port: parseInt(getEnv('PG_PORT') || '5432', 10),
    database: getEnv('PG_DATABASE') || 'postgres',
    user: getEnv('PG_USER') || 'postgres',
    password: getEnv('PG_PASSWORD') || '',
    ssl: getEnv('PG_SSL') !== 'false'
      ? { rejectUnauthorized: getEnv('PG_CA_CERT') ? true : false, ca: getEnv('PG_CA_CERT') }
      : false,
    // Supabase session poolers commonly expose a 15-client ceiling shared by
    // every process talking to the database (MCP server + landing app pools
    // + deploy overlap). Keep each MCP instance small so concurrent memory
    // writes queue in Node instead of being rejected by the pooler with
    // EMAXCONNSESSION. Budget: MCP 4 + landing PG 3 + landing Supa 3 = 10
    // steady-state, leaving headroom for zero-downtime deploy overlap.
    maxConnections: Math.min(
      parseInt(getEnv('PG_MAX_CONNECTIONS') || (isRailway ? '5' : '4'), 10),
      parseInt(getEnv('PG_POOL_HARD_LIMIT') || (isRailway ? '5' : '6'), 10),
    ),
    idleTimeout: parseInt(getEnv('PG_IDLE_TIMEOUT') || '10000', 10),
    connectionTimeout: parseInt(getEnv('PG_CONNECTION_TIMEOUT') || '10000', 10),
  },

  /** AES-256-GCM encryption for memory content */
  encryption: {
    secret: requireEnv('ENCRYPTION_SECRET', isDev ? 'memron-dev-encryption-key-CHANGE-IN-PRODUCTION' : undefined),
  },

  /** JWT signing for access / refresh tokens */
  jwt: {
    secret: requireEnv('JWT_SECRET', isDev ? 'memron-dev-jwt-secret-CHANGE-IN-PRODUCTION' : undefined),
    issuer: getEnv('JWT_ISSUER') || resolveServerUrl(),
    accessTokenTtlSeconds: parseInt(getEnv('JWT_ACCESS_TTL') || '3600', 10),       // 1 hour
    refreshTokenTtlSeconds: parseInt(getEnv('JWT_REFRESH_TTL') || '2592000', 10),  // 30 days
  },

  /** Per-user rate limiting */
  rateLimit: {
    windowMs: parseInt(getEnv('RATE_LIMIT_WINDOW_MS') || '60000', 10),   // 1 minute
    maxRequests: parseInt(getEnv('RATE_LIMIT_MAX') || (isRailway ? '60' : '100'), 10),
  },

  /** Memory defaults */
  memory: {
    maxContentLength: parseInt(getEnv('MAX_CONTENT_LENGTH') || '100000', 10),  // ~100 KB
    defaultBucket: 'conversation',
    defaultTokenBudget: 4000,
    maxSearchResults: 50,
  },

  /** Auto-ingest — automatic conversation capture & analysis */
  autoIngest: {
    /** Feature flag — set AUTO_INGEST_ENABLED=false to disable */
    enabled: (getEnv('AUTO_INGEST_ENABLED') || 'true') === 'true',
    /** Minimum tool calls before triggering analysis pipeline */
    minCalls: parseInt(getEnv('AUTO_INGEST_MIN_CALLS') || '2', 10),
    /** Use LLM for analysis (false = heuristic-only, saves cost) */
    useLLM: (getEnv('AUTO_INGEST_USE_LLM') || 'false') === 'true',
    /** Persist buffer to DB every N tool calls */
    persistEvery: parseInt(getEnv('AUTO_INGEST_PERSIST_EVERY') || '10', 10),
  },
  };
}

export type Config = ReturnType<typeof buildConfig>;

/**
 * Lazily-evaluated config proxy. Cloudflare Workers inject env after module
 * load, so values must resolve at access time, not import time. Render/Node
 * behavior is identical (process.env read live on every access).
 */
export const config: Config = new Proxy({} as Config, {
  get: (_target, prop) => (buildConfig() as unknown as Record<string | symbol, unknown>)[prop],
});
