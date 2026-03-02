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

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** True when running on Railway (any environment: production, staging, PR deploy) */
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

/** True for local development (no RAILWAY_ENVIRONMENT and NODE_ENV != production) */
const isDev = !isRailway && (process.env.NODE_ENV || 'development') === 'development';

/**
 * Derive the public URL.
 * On Railway, the actual public URL is detected dynamically from request
 * headers (Host + X-Forwarded-Proto) via middleware in index.ts.
 * This static value is only used for startup logs and as a fallback.
 */
function resolveServerUrl(): string {
  if (process.env.MCP_SERVER_URL) return process.env.MCP_SERVER_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_STATIC_URL) return process.env.RAILWAY_STATIC_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.PORT || '4201'}`;
}

// ─── Config ──────────────────────────────────────────────────

export const config = {
  /** Server */
  port: parseInt(process.env.PORT || '4201', 10),
  nodeEnv: process.env.NODE_ENV || (isRailway ? 'production' : 'development'),
  isDev,
  isRailway,

  /** Public-facing URL of this MCP server (auto-detected on Railway) */
  serverUrl: resolveServerUrl(),

  /** Landing app URL (used for "Get API Key" links) */
  landingUrl: process.env.LANDING_URL || 'https://console.memron.ai',

  /** PostgreSQL (Supabase Session Pooler or local) */
  db: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'postgres',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    ssl: process.env.PG_SSL !== 'false'
      ? { rejectUnauthorized: process.env.PG_CA_CERT ? true : false, ca: process.env.PG_CA_CERT }
      : false,
    maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || (isRailway ? '10' : '20'), 10),
  },

  /** AES-256-GCM encryption for memory content */
  encryption: {
    secret: requireEnv('ENCRYPTION_SECRET', isDev ? 'memron-dev-encryption-key-CHANGE-IN-PRODUCTION' : undefined),
  },

  /** JWT signing for access / refresh tokens */
  jwt: {
    secret: requireEnv('JWT_SECRET', isDev ? 'memron-dev-jwt-secret-CHANGE-IN-PRODUCTION' : undefined),
    issuer: process.env.JWT_ISSUER || resolveServerUrl(),
    accessTokenTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL || '3600', 10),       // 1 hour
    refreshTokenTtlSeconds: parseInt(process.env.JWT_REFRESH_TTL || '2592000', 10),  // 30 days
  },

  /** Per-user rate limiting */
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),   // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || (isRailway ? '60' : '100'), 10),
  },

  /** Memory defaults */
  memory: {
    maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH || '100000', 10),  // ~100 KB
    defaultBucket: 'conversation',
    defaultTokenBudget: 4000,
    maxSearchResults: 50,
  },
} as const;

export type Config = typeof config;
