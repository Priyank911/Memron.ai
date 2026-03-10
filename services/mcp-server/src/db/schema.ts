/**
 * Database Schema — All Memron Tables
 *
 * Creates ALL tables required by the full Memron stack:
 *
 * Shared / landing-app tables:
 * - users: User accounts (Clerk-backed)
 * - organizations: Workspaces / teams
 * - api_keys: API keys for MCP auth
 * - org_members: Organization membership
 *
 * MCP server tables:
 * - memories: Encrypted memory storage with pointers
 * - mcp_oauth_clients: Dynamic OAuth client registration
 * - mcp_auth_codes: Temporary authorization codes
 * - mcp_refresh_tokens: Long-lived refresh tokens
 * - mcp_pending_auth: Pending OAuth authorization requests
 * - forensic_snapshots: Pre-mutation memory snapshots
 *
 * This migration is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 * Safe to call on every startup from either the MCP server or the landing app.
 */
import { query } from './client.js';

const MIGRATIONS = [
  // ═══════════════════════════════════════════════════════════
  // SHARED TABLES (needed by both landing app and MCP server)
  // Using IF NOT EXISTS — safe even if landing app already created them.
  // ═══════════════════════════════════════════════════════════

  `CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    universal_id    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    clerk_id        VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    first_name      VARCHAR(255),
    last_name       VARCHAR(255),
    full_name       VARCHAR(255),
    image_url       TEXT,
    provider        VARCHAR(50) DEFAULT 'email',
    is_active       BOOLEAN DEFAULT true,
    is_onboarded    BOOLEAN DEFAULT false,
    onboarded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS organizations (
    id              SERIAL PRIMARY KEY,
    org_id          UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    owner_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
    logo_url        TEXT,
    description     TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS api_keys (
    id              SERIAL PRIMARY KEY,
    key_id          UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    key_prefix      VARCHAR(12) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL,
    name            VARCHAR(255) DEFAULT 'Default API Key',
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    scopes          TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],
    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS org_members (
    id              SERIAL PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
  )`,

  // Shared table indexes
  `CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_universal_id ON users(universal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`,

  // key_hash MUST be unique — drop pre-existing non-unique index first
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE indexname = 'idx_api_keys_hash'
       AND indexdef NOT LIKE '%UNIQUE%'
     ) THEN
       DROP INDEX idx_api_keys_hash;
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,

  // ═══════════════════════════════════════════════════════════
  // MCP SERVER TABLES
  // ═══════════════════════════════════════════════════════════

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

  // ─── Memory Model Improvements (v2) ────────────────────────
  // Track which API key created each memory
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS api_key_id INTEGER;
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // Hierarchical bucket path (e.g. "knowledge/projects/memron")
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS sub_path VARCHAR(255) DEFAULT '';
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // Importance score for relevance ranking (0.0 - 1.0)
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance REAL DEFAULT 0.5;
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // Access count for popularity-based ranking
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // Last accessed timestamp
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // Index on api_key_id for linking memories to API keys
  `CREATE INDEX IF NOT EXISTS idx_memories_api_key ON memories(api_key_id)`,

  // Index on sub_path for hierarchical bucket queries
  `CREATE INDEX IF NOT EXISTS idx_memories_sub_path ON memories(sub_path)`,

  // Composite index for bucket + sub_path queries
  `CREATE INDEX IF NOT EXISTS idx_memories_bucket_path ON memories(bucket, sub_path)`,

  // Index on importance for ranked queries
  `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`,

  // ─── Buckets (user-scoped memory namespaces) ───────────────
  `CREATE TABLE IF NOT EXISTS buckets (
    id              SERIAL PRIMARY KEY,
    bucket_id       UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    org_id          INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    is_default      BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    memory_count    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slug)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_buckets_user ON buckets(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buckets_org ON buckets(org_id)`,

  // Clean up stale duplicate unique index (if exists from earlier migration)
  `DROP INDEX IF EXISTS idx_api_keys_hash_unique`,

  // ─── pgvector: Semantic Search (v3) ────────────────────────
  // Enable the pgvector extension (Supabase has it pre-installed, just needs enabling)
  `CREATE EXTENSION IF NOT EXISTS vector`,

  // Add embedding column (768 dimensions for Groq nomic-embed-text-v1.5)
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(768);
   EXCEPTION WHEN duplicate_column THEN NULL;
   END $$`,

  // HNSW index for fast approximate nearest-neighbor search (cosine distance)
  // HNSW is better than IVFFlat for datasets under ~100k rows
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_indexes WHERE indexname = 'idx_memories_embedding_hnsw'
     ) THEN
       CREATE INDEX idx_memories_embedding_hnsw ON memories
         USING hnsw (embedding vector_cosine_ops)
         WITH (m = 16, ef_construction = 64);
     END IF;
   END $$`,
];

/**
 * Run all migrations. Idempotent — safe to call on every startup.
 */
export async function runMigrations(): Promise<void> {
  const start = Date.now();

  // Separate cleanup statements (DELETE) from DDL — DELETE can't be in same
  // transaction as CREATE TABLE in some edge cases with FK constraints.
  const ddlStatements: string[] = [];
  const cleanupStatements: string[] = [];

  for (const sql of MIGRATIONS) {
    if (sql.trimStart().startsWith('DELETE FROM')) {
      cleanupStatements.push(sql);
    } else {
      ddlStatements.push(sql);
    }
  }

  // Run all DDL in a single transaction — 1 round-trip instead of 30+
  try {
    const batch = ['BEGIN', ...ddlStatements, 'COMMIT'].join(';\n');
    await query(batch);
  } catch (batchError) {
    // If batch fails, fall back to sequential execution so we get
    // granular error reporting on which statement failed.
    try { await query('ROLLBACK'); } catch { /* ignore */ }

    for (const sql of ddlStatements) {
      try {
        await query(sql);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown';
        const isOptional = sql.includes('DO $$ BEGIN') || sql.includes('IF EXISTS');
        if (isOptional) {
          console.warn(`[DB] Skipped (non-critical): ${msg}`);
        } else {
          console.error(`[DB] Migration failed: ${msg}`);
          console.error(`[DB] SQL: ${sql.slice(0, 120)}`);
          throw error;
        }
      }
    }
  }

  // Run cleanup (DELETE expired rows) — non-critical, ignore failures
  for (const sql of cleanupStatements) {
    try {
      await query(sql);
    } catch {
      // Cleanup is best-effort
    }
  }

  console.log(`[DB] Schema ready (${Date.now() - start}ms)`);
}
