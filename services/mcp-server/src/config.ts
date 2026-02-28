/**
 * Memron MCP Server — Environment Configuration
 *
 * All configuration is loaded from environment variables with sensible defaults.
 * In production, all secrets MUST be provided via env vars.
 */

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  /** Server */
  port: parseInt(process.env.PORT || '4201', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  /** Public-facing URL of this MCP server */
  serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:4201',

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
    maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || '20', 10),
  },

  /** AES-256-GCM encryption for memory content */
  encryption: {
    secret: requireEnv('ENCRYPTION_SECRET', 'memron-dev-encryption-key-CHANGE-IN-PRODUCTION'),
  },

  /** JWT signing for access / refresh tokens */
  jwt: {
    secret: requireEnv('JWT_SECRET', 'memron-dev-jwt-secret-CHANGE-IN-PRODUCTION'),
    issuer: process.env.JWT_ISSUER || 'https://mcp.memron.ai',
    accessTokenTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL || '3600', 10),       // 1 hour
    refreshTokenTtlSeconds: parseInt(process.env.JWT_REFRESH_TTL || '2592000', 10),  // 30 days
  },

  /** Per-user rate limiting */
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),   // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),         // per window
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
