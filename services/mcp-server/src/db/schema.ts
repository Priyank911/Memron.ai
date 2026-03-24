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

  // ─── Enable RLS & lock down PostgREST roles ──────────────
  // The app connects via postgres superuser (bypasses RLS).
  // This blocks Supabase PostgREST (anon/authenticated) access.
  `DO $$
   DECLARE t TEXT; r TEXT;
   BEGIN
     FOREACH t IN ARRAY ARRAY[
       'users','organizations','api_keys','org_members',
       'memories','mcp_oauth_clients','mcp_pending_auth',
       'mcp_auth_codes','mcp_refresh_tokens','forensic_snapshots',
       'buckets','conversation_history'
     ] LOOP
       EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
       FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
         EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
       END LOOP;
     END LOOP;
   END $$`,

  // ═══════════════════════════════════════════════════════════
  // ANALYSIS ENGINE TABLES (Memory Intelligence Layer)
  // ═══════════════════════════════════════════════════════════

  // ─── Enable pgvector extension ───────────────────────────────
  `CREATE EXTENSION IF NOT EXISTS vector`,

  // ─── Episodes (semantic conversation segments) ───────────────
  `CREATE TABLE IF NOT EXISTS episodes (
    id              SERIAL PRIMARY KEY,
    episode_id      VARCHAR(64) UNIQUE NOT NULL,
    session_id      VARCHAR(64) NOT NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    episode_type    VARCHAR(50) NOT NULL DEFAULT 'goal_definition',
    start_index     INTEGER NOT NULL DEFAULT 0,
    end_index       INTEGER NOT NULL DEFAULT 0,
    outcome         VARCHAR(20) DEFAULT 'neutral',
    outcome_confidence REAL DEFAULT 0.5,
    summary         TEXT,
    raw_messages    JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episodes_user ON episodes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(episode_type)`,
  `CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome)`,

  // ─── Atomic Memories (structured memory units) ───────────────
  `CREATE TABLE IF NOT EXISTS atomic_memories (
    id                    SERIAL PRIMARY KEY,
    memory_id             VARCHAR(64) UNIQUE NOT NULL,
    user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
    episode_id            VARCHAR(64),
    workspace_id          VARCHAR(64),
    agent_id              VARCHAR(255),
    task_id               VARCHAR(255),

    -- Classification
    memory_type           VARCHAR(50) NOT NULL,

    -- Content
    content               TEXT NOT NULL,
    compressed_content    TEXT,

    -- Scoring
    confidence            REAL DEFAULT 0.5,
    success_score         REAL DEFAULT 0.5,
    failure_score         REAL DEFAULT 0.2,
    transferability       REAL DEFAULT 0.5,

    -- Temporal
    event_time            TIMESTAMPTZ,
    valid_from            TIMESTAMPTZ DEFAULT NOW(),
    valid_to              TIMESTAMPTZ,

    -- Relations
    supersedes_memory_id  VARCHAR(64),
    source_span_start     INTEGER DEFAULT 0,
    source_span_end       INTEGER DEFAULT 0,
    graph_links           JSONB DEFAULT '[]',

    -- Policy
    share_policy          VARCHAR(20) DEFAULT 'private',
    expiry                TIMESTAMPTZ,

    -- Embedding (1536-dim for OpenAI compatibility)
    embedding             vector(1536),

    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_user ON atomic_memories(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_episode ON atomic_memories(episode_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_type ON atomic_memories(memory_type)`,
  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_confidence ON atomic_memories(confidence DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_valid ON atomic_memories(valid_from, valid_to)`,
  `CREATE INDEX IF NOT EXISTS idx_atomic_memories_share ON atomic_memories(share_policy)`,

  // Vector similarity index (IVFFlat for large datasets)
  `DO $$ BEGIN
     CREATE INDEX IF NOT EXISTS idx_atomic_memories_embedding
       ON atomic_memories USING ivfflat (embedding vector_cosine_ops)
       WITH (lists = 100);
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ─── Success Recipes (distilled task solutions) ──────────────
  `CREATE TABLE IF NOT EXISTS success_recipes (
    id                    SERIAL PRIMARY KEY,
    recipe_id             VARCHAR(64) UNIQUE NOT NULL,
    user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
    workspace_id          VARCHAR(64),

    -- Identification
    recipe_name           VARCHAR(255) NOT NULL,
    task_type             VARCHAR(100) NOT NULL DEFAULT 'general',
    problem_statement     TEXT NOT NULL,
    problem_signature     VARCHAR(64),

    -- Content (JSON structure)
    recipe_content        JSONB NOT NULL,

    -- Metrics
    success_rate          REAL DEFAULT 0.5,
    avg_token_cost        INTEGER DEFAULT 0,
    transferability_score REAL DEFAULT 0.5,
    usage_count           INTEGER DEFAULT 0,
    positive_feedback     INTEGER DEFAULT 0,
    negative_feedback     INTEGER DEFAULT 0,

    -- Versioning
    recipe_version        INTEGER DEFAULT 1,
    parent_recipe_id      VARCHAR(64),

    -- Embedding for semantic search
    embedding             vector(1536),

    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_recipes_user ON success_recipes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_task_type ON success_recipes(task_type)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_signature ON success_recipes(problem_signature)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_success_rate ON success_recipes(success_rate DESC)`,

  `DO $$ BEGIN
     CREATE INDEX IF NOT EXISTS idx_recipes_embedding
       ON success_recipes USING ivfflat (embedding vector_cosine_ops)
       WITH (lists = 50);
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ─── Failure Patterns (anti-patterns to avoid) ───────────────
  `CREATE TABLE IF NOT EXISTS failure_patterns (
    id                SERIAL PRIMARY KEY,
    pattern_id        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
    task_type         VARCHAR(100),
    pattern           TEXT NOT NULL,
    symptom           TEXT,
    probable_cause    TEXT,
    avoidance_rule    TEXT,
    occurrence_count  INTEGER DEFAULT 1,
    last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_failure_patterns_user ON failure_patterns(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_failure_patterns_task ON failure_patterns(task_type)`,

  // ─── Prompt Versions (prompt engineering tracking) ───────────
  `CREATE TABLE IF NOT EXISTS prompt_templates (
    id                SERIAL PRIMARY KEY,
    template_id       VARCHAR(50) UNIQUE NOT NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS prompt_versions (
    id                    SERIAL PRIMARY KEY,
    prompt_version_id     VARCHAR(50) UNIQUE NOT NULL,
    prompt_template_id    VARCHAR(50) REFERENCES prompt_templates(template_id) ON DELETE CASCADE,
    version_number        INTEGER NOT NULL DEFAULT 1,
    parent_version_id     VARCHAR(50),
    branch_label          VARCHAR(100),
    status                VARCHAR(20) DEFAULT 'draft',

    -- Content
    raw_text              TEXT NOT NULL,
    structured_config     JSONB,

    -- Components
    system_block          TEXT,
    memory_block          TEXT,
    retrieval_block       TEXT,
    tool_block            TEXT,
    output_schema         TEXT,

    -- Meta
    change_summary        TEXT,
    created_by            INTEGER REFERENCES users(id),
    created_at            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_versions(prompt_template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_versions_status ON prompt_versions(status)`,

  // ─── Prompt Diffs (semantic change tracking) ─────────────────
  `CREATE TABLE IF NOT EXISTS prompt_diffs (
    id                SERIAL PRIMARY KEY,
    diff_id           VARCHAR(50) UNIQUE NOT NULL,
    from_version_id   VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
    to_version_id     VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
    diff_type         VARCHAR(50),
    semantic_change   TEXT,
    impact_hypothesis TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ─── Run Records (execution outcome tracking) ────────────────
  `CREATE TABLE IF NOT EXISTS run_records (
    id                    SERIAL PRIMARY KEY,
    run_id                VARCHAR(50) UNIQUE NOT NULL,
    user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id            VARCHAR(200) NOT NULL,
    agent_id              VARCHAR(255),
    workspace_id          VARCHAR(50),
    task_id               VARCHAR(255),

    -- Version Links
    prompt_version_id     VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
    context_version_id    VARCHAR(50),
    retrieval_version_id  VARCHAR(50),
    tooling_version_id    VARCHAR(50),
    evaluation_version_id VARCHAR(50),

    -- Execution Details
    model_name            VARCHAR(100),
    model_params          JSONB,
    input_tokens          INTEGER DEFAULT 0,
    output_tokens         INTEGER DEFAULT 0,
    latency_ms            INTEGER DEFAULT 0,
    cost                  REAL,

    -- Outcome
    hallucination_flag    BOOLEAN DEFAULT false,
    success_score         REAL DEFAULT 0.5,
    user_feedback         VARCHAR(20),
    final_acceptance      BOOLEAN DEFAULT false,
    failure_reason        TEXT,

    -- Artifacts
    source_artifacts      TEXT[],

    created_at            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_run_records_user ON run_records(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_run_records_session ON run_records(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_run_records_prompt ON run_records(prompt_version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_run_records_success ON run_records(success_score DESC)`,

  // ─── Entities (knowledge graph nodes) ────────────────────────
  `CREATE TABLE IF NOT EXISTS entities (
    id                SERIAL PRIMARY KEY,
    entity_id         VARCHAR(64) UNIQUE NOT NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,

    name              VARCHAR(500) NOT NULL,
    canonical_name    VARCHAR(500),
    entity_type       VARCHAR(100),
    description       TEXT,

    -- Source
    first_seen_in     VARCHAR(12),
    mention_count     INTEGER DEFAULT 1,

    -- Embedding
    embedding         vector(1536),

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name)`,
  `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type)`,

  `DO $$ BEGIN
     CREATE INDEX IF NOT EXISTS idx_entities_embedding
       ON entities USING ivfflat (embedding vector_cosine_ops)
       WITH (lists = 100);
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ─── Entity Relationships (knowledge graph edges) ────────────
  `CREATE TABLE IF NOT EXISTS entity_relationships (
    id                  SERIAL PRIMARY KEY,
    relationship_id     VARCHAR(64) UNIQUE NOT NULL,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,

    source_entity_id    VARCHAR(64),
    target_entity_id    VARCHAR(64),
    relationship_type   VARCHAR(100),

    strength            REAL DEFAULT 0.5,
    evidence_count      INTEGER DEFAULT 1,
    source_memories     TEXT[],

    created_at          TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_entity_rels_user ON entity_relationships(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_rels_source ON entity_relationships(source_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_rels_target ON entity_relationships(target_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_rels_type ON entity_relationships(relationship_type)`,

  // ─── Memory Packets (cached retrieval results) ───────────────
  `CREATE TABLE IF NOT EXISTS memory_packets (
    id                  SERIAL PRIMARY KEY,
    packet_id           VARCHAR(50) UNIQUE NOT NULL,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    query_embedding     vector(1536),
    packet_content      JSONB NOT NULL,
    token_count         INTEGER DEFAULT 0,
    risk_level          VARCHAR(20),
    source_memory_ids   TEXT[],
    created_at          TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Add risk_level column if it doesn't exist (for databases created before this column was added)
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'memory_packets' AND column_name = 'risk_level'
    ) THEN
      ALTER TABLE memory_packets ADD COLUMN risk_level VARCHAR(20);
    END IF;
  END $$`,

  `CREATE INDEX IF NOT EXISTS idx_packets_user ON memory_packets(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_packets_risk ON memory_packets(risk_level)`,

  // ─── Conversation History (auto-capture MCP interactions) ────
  `CREATE TABLE IF NOT EXISTS conversation_history (
    id              SERIAL PRIMARY KEY,
    session_id      VARCHAR(100) UNIQUE NOT NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    messages        JSONB NOT NULL DEFAULT '[]',
    tool_call_count INTEGER DEFAULT 0,
    ingested        BOOLEAN DEFAULT false,
    ingested_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_conversation_history_user ON conversation_history(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_history_ingested ON conversation_history(ingested) WHERE ingested = false`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_history_updated ON conversation_history(updated_at DESC)`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'set_conversation_history_updated_at'
     ) THEN
       CREATE TRIGGER set_conversation_history_updated_at
         BEFORE UPDATE ON conversation_history
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,

  // ─── Updated-at trigger for new tables ───────────────────────
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'set_atomic_memories_updated_at'
     ) THEN
       CREATE TRIGGER set_atomic_memories_updated_at
         BEFORE UPDATE ON atomic_memories
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'set_recipes_updated_at'
     ) THEN
       CREATE TRIGGER set_recipes_updated_at
         BEFORE UPDATE ON success_recipes
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'set_entities_updated_at'
     ) THEN
       CREATE TRIGGER set_entities_updated_at
         BEFORE UPDATE ON entities
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END;
   $$`,
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
