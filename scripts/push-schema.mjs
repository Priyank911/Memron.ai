#!/usr/bin/env node
/**
 * Push complete database schema to Supabase.
 *
 * Combines:
 * 1. Landing app tables (users, organizations, api_keys, org_members)
 * 2. MCP server tables (memories, mcp_oauth_clients, mcp_auth_codes, etc.)
 * 3. Memory model v2 improvements (api_key_id, sub_path, importance, etc.)
 * 4. All indexes, triggers, and foreign key relationships
 *
 * Usage:  node scripts/push-schema.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../apps/landing/package.json'));
const pg = require('pg');

// ── Load .env.local ──────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../apps/landing/.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* env may already be set */ }
}

loadEnv();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 15000,
});

// ── Complete schema migrations (ordered) ─────────────────────
const MIGRATIONS = [
  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Landing App Core Tables
  // ═══════════════════════════════════════════════════════════

  // Users table
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

  // Users migrations
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='universal_id') THEN
       ALTER TABLE users ADD COLUMN universal_id UUID DEFAULT gen_random_uuid() UNIQUE;
       UPDATE users SET universal_id = gen_random_uuid() WHERE universal_id IS NULL;
       ALTER TABLE users ALTER COLUMN universal_id SET NOT NULL;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_onboarded') THEN
       ALTER TABLE users ADD COLUMN is_onboarded BOOLEAN DEFAULT false;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='onboarded_at') THEN
       ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;
     END IF;
   END;
   $$`,

  // Organizations table
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

  // API Keys table
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

  // Org Members table
  `CREATE TABLE IF NOT EXISTS org_members (
    id              SERIAL PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
  )`,

  // Landing app indexes
  `CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_universal_id ON users(universal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_users_is_onboarded ON users(is_onboarded)`,
  `CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`,

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: MCP Server Tables
  // ═══════════════════════════════════════════════════════════

  // Memories table (core)
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

  // Memory indexes
  `CREATE INDEX IF NOT EXISTS idx_memories_pointer ON memories(pointer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_org ON memories(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_bucket ON memories(bucket)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_active) WHERE is_active = true`,
  `CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_title_search ON memories USING GIN(to_tsvector('english', title))`,

  // MCP OAuth Clients
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

  // Pending Auth Requests
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

  // Authorization Codes
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

  // Refresh Tokens
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

  // Forensic Snapshots
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

  // Cross-table indexes on landing-app tables
  `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_id)`,

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Triggers
  // ═══════════════════════════════════════════════════════════

  `CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,

  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
       CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_orgs_updated_at') THEN
       CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_memories_updated_at') THEN
       CREATE TRIGGER set_memories_updated_at BEFORE UPDATE ON memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,

  // ═══════════════════════════════════════════════════════════
  // PHASE 4: Memory Model v2 Improvements
  // ═══════════════════════════════════════════════════════════

  // Track which API key created each memory
  `DO $$ BEGIN
     ALTER TABLE memories ADD COLUMN IF NOT EXISTS api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL;
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

  // v2 indexes
  `CREATE INDEX IF NOT EXISTS idx_memories_api_key ON memories(api_key_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_sub_path ON memories(sub_path)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_bucket_path ON memories(bucket, sub_path)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`,

  // ═══════════════════════════════════════════════════════════
  // PHASE 5: Foreign Key Relationships (add safely)
  // ═══════════════════════════════════════════════════════════

  // memories.user_id → users.id (soft FK, don't enforce for MCP flexibility)
  // memories.org_id  → organizations.id
  // memories.api_key_id → api_keys.id (already added with REFERENCES above)

  // ═══════════════════════════════════════════════════════════
  // PHASE 6: Cleanup
  // ═══════════════════════════════════════════════════════════
  `DELETE FROM mcp_auth_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`,
  `DELETE FROM mcp_pending_auth WHERE expires_at < NOW() - INTERVAL '1 hour'`,
];

// ── Run it ───────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║     Memron — Push Schema to Supabase              ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Host:     ${process.env.PG_HOST}`);
  console.log(`  Database: ${process.env.PG_DATABASE}`);
  console.log(`  User:     ${process.env.PG_USER}`);
  console.log(`  Port:     ${process.env.PG_PORT || 5432}`);
  console.log('');

  // Test connection
  try {
    const res = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log(`  ✓ Connected to "${res.rows[0].db}" at ${res.rows[0].time}`);
    console.log('');
  } catch (err) {
    console.error('  ✗ Connection failed:', err.message);
    process.exit(1);
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    // Extract a short label from the SQL
    const label = sql.trim().slice(0, 70).replace(/\n/g, ' ').trim();
    try {
      await pool.query(sql);
      success++;
      // Show CREATE TABLE and ALTER TABLE statements
      if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE') || sql.includes('CREATE INDEX')) {
        console.log(`  ✓ [${i + 1}/${MIGRATIONS.length}] ${label}...`);
      }
    } catch (err) {
      if (sql.startsWith('DELETE FROM')) {
        skipped++;
        console.log(`  ~ [${i + 1}/${MIGRATIONS.length}] Cleanup skipped: ${err.message}`);
      } else {
        failed++;
        console.error(`  ✗ [${i + 1}/${MIGRATIONS.length}] FAILED: ${err.message}`);
        console.error(`    SQL: ${label}...`);
      }
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────────────────');

  // Show table summary
  try {
    const tables = await pool.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as columns
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('');
    console.log('  📋 Tables in Supabase:');
    console.log('  ┌──────────────────────────┬─────────┐');
    console.log('  │ Table                    │ Columns │');
    console.log('  ├──────────────────────────┼─────────┤');
    for (const t of tables.rows) {
      const name = t.table_name.padEnd(24);
      const cols = String(t.columns).padStart(5);
      console.log(`  │ ${name} │ ${cols}   │`);
    }
    console.log('  └──────────────────────────┴─────────┘');
  } catch { /* ignore */ }

  // Show row counts for key tables
  try {
    console.log('');
    console.log('  📊 Row counts:');
    for (const tbl of ['users', 'organizations', 'api_keys', 'memories', 'forensic_snapshots', 'mcp_oauth_clients', 'mcp_refresh_tokens']) {
      try {
        const r = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
        console.log(`     ${tbl}: ${r.rows[0].c} rows`);
      } catch {
        console.log(`     ${tbl}: (table not found)`);
      }
    }
  } catch { /* ignore */ }

  // Show memories structure
  try {
    console.log('');
    console.log('  🧠 memories table columns:');
    const cols = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'memories' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    for (const c of cols.rows) {
      const nullable = c.is_nullable === 'YES' ? '?' : '';
      const def = c.column_default ? ` = ${c.column_default.slice(0, 30)}` : '';
      console.log(`     ${c.column_name}: ${c.data_type}${nullable}${def}`);
    }
  } catch { /* ignore */ }

  // Show relationships
  try {
    console.log('');
    console.log('  🔗 Foreign Key Relationships:');
    const fks = await pool.query(`
      SELECT
        tc.table_name, kcu.column_name,
        ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name
    `);
    for (const fk of fks.rows) {
      console.log(`     ${fk.table_name}.${fk.column_name} → ${fk.foreign_table}.${fk.foreign_column}`);
    }
  } catch { /* ignore */ }

  // Show sample memories
  try {
    const mems = await pool.query(`SELECT id, pointer_id, user_id, org_id, bucket, sub_path, title, api_key_id, importance, token_count, is_active, created_at FROM memories ORDER BY id LIMIT 10`);
    if (mems.rows.length > 0) {
      console.log('');
      console.log('  💾 Sample memories:');
      for (const m of mems.rows) {
        const path = m.sub_path ? `${m.bucket}/${m.sub_path}` : m.bucket;
        console.log(`     [${m.pointer_id}] ${m.title?.slice(0, 50)}... | bucket: ${path} | user: ${m.user_id} | api_key: ${m.api_key_id || 'none'} | tokens: ${m.token_count}`);
      }
    }
  } catch { /* ignore */ }

  console.log('');
  console.log('─────────────────────────────────────────────────────');
  console.log(`  Results: ${success} passed, ${skipped} skipped, ${failed} failed`);
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  await pool.end();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
