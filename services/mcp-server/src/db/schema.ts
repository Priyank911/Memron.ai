/**
 * Database Schema — MCP Server Tables
 *
 * Creates all tables required by the MCP server:
 * - memories: Encrypted memory storage with pointers
 * - mcp_oauth_clients: Dynamic OAuth client registration
 * - mcp_auth_codes: Temporary authorization codes
 * - mcp_refresh_tokens: Long-lived refresh tokens
 * - mcp_pending_auth: Pending OAuth authorization requests
 * - forensic_snapshots: Pre-mutation memory snapshots
 *
 * This migration is idempotent (IF NOT EXISTS).
 * Existing landing-app tables (users, organizations, api_keys) are NOT touched.
 */
import { query } from './client.js';

const MIGRATIONS = [
  // ─── Memories ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS memories (
    id                SERIAL PRIMARY KEY,
    pointer_id        VARCHAR(12) UNIQUE NOT NULL,
    user_id           INTEGER NOT NULL,
    org_id            INTEGER,
    bucket            VARCHAR(50) NOT NULL DEFAULT 'conversation',
    title             VARCHAR(500) NOT NULL DEFAULT '',
    content_encrypted BYTEA NOT NULL,
    content_iv        BYTEA NOT NULL,
    content_tag       BYTEA NOT NULL,
    content_hash      VARCHAR(64) NOT NULL,
    tags              TEXT[] DEFAULT ARRAY[]::TEXT[],
    token_count       INTEGER NOT NULL DEFAULT 0,
    original_tokens   INTEGER NOT NULL DEFAULT 0,
    metadata          JSONB DEFAULT '{}',
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_memories_pointer ON memories(pointer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_org ON memories(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_bucket ON memories(bucket)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_active) WHERE is_active = true`,
  `CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_title_search ON memories USING GIN(to_tsvector('english', title))`,

  // ─── MCP OAuth Clients (Dynamic Registration) ──────────────
  `CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    id                        SERIAL PRIMARY KEY,
    client_id                 VARCHAR(255) UNIQUE NOT NULL,
    client_secret_hash        VARCHAR(255),
    client_name               VARCHAR(255),
    redirect_uris             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    grant_types               TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token'],
    response_types            TEXT[] DEFAULT ARRAY['code'],
    scope                     TEXT DEFAULT 'memory:read memory:write profile:read',
    token_endpoint_auth_method VARCHAR(50) DEFAULT 'client_secret_post',
    client_id_issued_at       BIGINT DEFAULT 0,
    client_secret_expires_at  BIGINT DEFAULT 0,
    created_at                TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_oauth_clients_id ON mcp_oauth_clients(client_id)`,

  // ─── Pending Auth Requests ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS mcp_pending_auth (
    id              SERIAL PRIMARY KEY,
    request_id      VARCHAR(255) UNIQUE NOT NULL,
    client_id       VARCHAR(255) NOT NULL,
    code_challenge  VARCHAR(255) NOT NULL,
    redirect_uri    TEXT NOT NULL,
    state           VARCHAR(255),
    scopes          TEXT[],
    resource        TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_pending_auth_request ON mcp_pending_auth(request_id)`,

  // ─── Authorization Codes ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS mcp_auth_codes (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(255) UNIQUE NOT NULL,
    client_id       VARCHAR(255) NOT NULL,
    user_id         INTEGER NOT NULL,
    code_challenge  VARCHAR(255) NOT NULL,
    redirect_uri    TEXT NOT NULL,
    scopes          TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON mcp_auth_codes(code)`,

  // ─── Refresh Tokens ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
    id              SERIAL PRIMARY KEY,
    token_hash      VARCHAR(255) UNIQUE NOT NULL,
    client_id       VARCHAR(255) NOT NULL,
    user_id         INTEGER NOT NULL,
    scopes          TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON mcp_refresh_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON mcp_refresh_tokens(user_id)`,

  // ─── Forensic Snapshots ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS forensic_snapshots (
    id                  SERIAL PRIMARY KEY,
    memory_id           INTEGER NOT NULL,
    pointer_id          VARCHAR(12) NOT NULL,
    content_hash        VARCHAR(64) NOT NULL,
    snapshot_encrypted  BYTEA NOT NULL,
    snapshot_iv         BYTEA NOT NULL,
    snapshot_tag        BYTEA NOT NULL,
    reason              VARCHAR(50) NOT NULL DEFAULT 'pre-mutation',
    created_by          INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_snapshots_memory ON forensic_snapshots(memory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_pointer ON forensic_snapshots(pointer_id)`,

  // ─── Updated-at trigger function ───────────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'set_memories_updated_at'
     ) THEN
       CREATE TRIGGER set_memories_updated_at
         BEFORE UPDATE ON memories
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,

  // ─── Cleanup job: expired codes & pending auth ─────────────
  `DELETE FROM mcp_auth_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`,
  `DELETE FROM mcp_pending_auth WHERE expires_at < NOW() - INTERVAL '1 hour'`,
];

/**
 * Run all migrations. Idempotent — safe to call on every startup.
 */
export async function runMigrations(): Promise<void> {
  console.log('[DB] Running schema migrations...');

  for (const sql of MIGRATIONS) {
    try {
      await query(sql);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      // Don't fail on cleanup queries
      if (sql.startsWith('DELETE FROM')) {
        console.warn(`[DB] Cleanup query skipped: ${msg}`);
      } else {
        console.error(`[DB] Migration failed: ${msg}`);
        console.error(`[DB] SQL: ${sql.slice(0, 120)}`);
        throw error;
      }
    }
  }

  console.log('[DB] Migrations complete');
}
