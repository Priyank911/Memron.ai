// PostgreSQL Configuration - Primary Database (Supabase)
// Used as the main source of truth for all structured data

import { Pool, PoolClient } from 'pg';

// Build SSL config for Supabase
// - If PG_SSL=false, disable SSL entirely (local docker-compose)
// - If PG_CA_CERT is set, use it as the trusted CA
// - Otherwise, use SSL with relaxed cert verification (Supabase default)
const sslConfig: any = process.env.PG_SSL === 'false'
    ? false
    : process.env.PG_CA_CERT
        ? { rejectUnauthorized: true, ca: process.env.PG_CA_CERT }
        : { rejectUnauthorized: false };

// Check if PostgreSQL is configured
const isPgConfigured = !!(process.env.PG_HOST && process.env.PG_DATABASE && process.env.PG_USER && process.env.PG_PASSWORD);

// Connection pool for PostgreSQL (Supabase Session Pooler)
const pool = isPgConfigured ? new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: sslConfig,
    max: 10, // Maximum connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
}) : null;

// Schema initialization state - use global to persist across hot reloads
const globalForSchema = globalThis as unknown as {
    pgSchemaInitialized?: boolean;
    pgSchemaInitPromise?: Promise<void> | null;
};

// Test connection on startup
if (pool) {
    pool.on('error', (err) => {
        console.error('[PostgreSQL] Unexpected error on idle client:', err);
    });
} else if (isPgConfigured === false) {
    console.warn('[PostgreSQL] Not configured - PostgreSQL sync disabled');
}

/**
 * Ensure schema is initialized before any user operations
 * This is called automatically and only runs once
 */
async function ensureSchema(): Promise<void> {
    if (!pool) return;
    if (globalForSchema.pgSchemaInitialized) return;
    
    // Use a singleton promise to prevent multiple concurrent initializations
    if (!globalForSchema.pgSchemaInitPromise) {
        globalForSchema.pgSchemaInitPromise = initializeSchema()
            .then(() => {
                globalForSchema.pgSchemaInitialized = true;
            })
            .catch((err) => {
                console.error('[PostgreSQL] Schema auto-initialization failed:', err.message);
                globalForSchema.pgSchemaInitPromise = null; // Allow retry on next operation
            });
    }
    
    await globalForSchema.pgSchemaInitPromise;
}

/**
 * Execute a query against PostgreSQL
 */
export async function query(text: string, params?: any[]) {
    if (!pool) {
        throw new Error('PostgreSQL not configured');
    }
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error: any) {
        console.error('[PostgreSQL] Query failed:', error.message);
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
    if (!pool) {
        throw new Error('PostgreSQL not configured');
    }
    return pool.connect();
}

/**
 * Test the database connection
 */
export async function testConnection(): Promise<boolean> {
    if (!pool) {
        console.warn('[PostgreSQL] Not configured - skipping connection test');
        return false;
    }
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('[PostgreSQL] Connected successfully at:', result.rows[0].now);
        return true;
    } catch (error: any) {
        console.error('[PostgreSQL] Connection failed:', error.message);
        return false;
    }
}

// ─── Schema Initialization ──────────────────────────────────

/**
 * Initialize the database schema
 * Creates the users table and indexes if they don't exist
 */
export async function initializeSchema(): Promise<void> {
    if (!pool) {
        console.warn('[PostgreSQL] Not configured - skipping schema initialization');
        return;
    }

    const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
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
    );
  `;

    const createOrganizationsTable = `
    CREATE TABLE IF NOT EXISTS organizations (
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
    );
  `;

    const createApiKeysTable = `
    CREATE TABLE IF NOT EXISTS api_keys (
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
    );
  `;

    const createOrgMembersTable = `
    CREATE TABLE IF NOT EXISTS org_members (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role            VARCHAR(50) DEFAULT 'member',
      joined_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, user_id)
    );
  `;

    const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_universal_id ON users(universal_id);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_is_onboarded ON users(is_onboarded);
    CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug);
    CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
  `;

    // key_hash MUST be unique — safely upgrade existing non-unique index
    const upgradeKeyHashIndex = `
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_api_keys_hash'
        AND indexdef NOT LIKE '%UNIQUE%'
      ) THEN
        DROP INDEX idx_api_keys_hash;
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  `;

    const createUpdatedAtTrigger = `
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
      ) THEN
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_orgs_updated_at'
      ) THEN
        CREATE TRIGGER update_orgs_updated_at
          BEFORE UPDATE ON organizations
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END;
    $$;
  `;

    // Migration: Add new columns to existing users table
    const migrateUsersTable = `
    DO $$
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
    $$;
  `;

    try {
        // Check if table already exists before logging
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        const tableExisted = tableCheck.rows[0].exists;

        await pool.query(createUsersTable);
        await pool.query(migrateUsersTable);
        await pool.query(createOrganizationsTable);
        await pool.query(createApiKeysTable);
        await pool.query(createOrgMembersTable);
        await pool.query(createIndexes);
        await pool.query(upgradeKeyHashIndex);
        await pool.query(createUpdatedAtTrigger);

        // Create MCP-server tables so dashboard queries work even in local dev
        // These are IF NOT EXISTS so they won't conflict with the MCP server.
        await pool.query(`
          CREATE TABLE IF NOT EXISTS memories (
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
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
            id              SERIAL PRIMARY KEY,
            token_hash      VARCHAR(255) UNIQUE NOT NULL,
            client_id       VARCHAR(255) NOT NULL,
            user_id         INTEGER NOT NULL,
            scopes          TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],
            expires_at      TIMESTAMPTZ NOT NULL,
            revoked         BOOLEAN DEFAULT false,
            created_at      TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS forensic_snapshots (
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
          )
        `);

        // Memory model v2 columns (safe to run even if already present)
        await pool.query(`
          DO $$ BEGIN
            ALTER TABLE memories ADD COLUMN IF NOT EXISTS api_key_id INTEGER;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$
        `);
        await pool.query(`
          DO $$ BEGIN
            ALTER TABLE memories ADD COLUMN IF NOT EXISTS sub_path VARCHAR(255) DEFAULT '';
          EXCEPTION WHEN duplicate_column THEN NULL; END $$
        `);
        await pool.query(`
          DO $$ BEGIN
            ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance REAL DEFAULT 0.5;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$
        `);
        await pool.query(`
          DO $$ BEGIN
            ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$
        `);
        await pool.query(`
          DO $$ BEGIN
            ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$
        `);

        // Memory indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_org ON memories(org_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_bucket ON memories(bucket)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_api_key ON memories(api_key_id)`);

        // ─── Buckets (user-scoped memory namespaces) ─────────────
        await pool.query(`
          CREATE TABLE IF NOT EXISTS buckets (
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
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_buckets_user ON buckets(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_buckets_org ON buckets(org_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_buckets_slug ON buckets(user_id, slug)`);

        // ─── Bucket Shares (share sub-buckets between users) ─────
        await pool.query(`
          CREATE TABLE IF NOT EXISTS bucket_shares (
            id              SERIAL PRIMARY KEY,
            share_id        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            source_bucket_id UUID NOT NULL,
            source_user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_email    VARCHAR(255) NOT NULL,
            copied_bucket_id UUID,
            status          VARCHAR(20) DEFAULT 'pending',
            message         TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            accepted_at     TIMESTAMPTZ,
            UNIQUE(source_bucket_id, target_email)
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bucket_shares_source ON bucket_shares(source_user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bucket_shares_target ON bucket_shares(target_user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bucket_shares_email ON bucket_shares(target_email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bucket_shares_status ON bucket_shares(status)`);

        // ─── Notifications (in-app) ─────────────────────────────
        await pool.query(`
          CREATE TABLE IF NOT EXISTS notifications (
            id              SERIAL PRIMARY KEY,
            notif_id        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type            VARCHAR(50) NOT NULL DEFAULT 'bucket_share',
            title           VARCHAR(255) NOT NULL,
            body            TEXT,
            metadata        JSONB DEFAULT '{}',
            is_read         BOOLEAN DEFAULT false,
            created_at      TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`);

        // Only log if table was newly created
        if (!tableExisted) {
            console.log('[PostgreSQL] Schema initialized successfully');
        }
    } catch (error: any) {
        console.error('[PostgreSQL] Schema initialization failed:', error.message);
        throw error;
    }
}

// ─── User Operations ────────────────────────────────────────

export interface PgUser {
    id: number;
    universal_id: string;
    clerk_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    image_url: string | null;
    provider: string;
    is_active: boolean;
    is_onboarded: boolean;
    onboarded_at: Date | null;
    created_at: Date;
    updated_at: Date;
    last_login_at: Date;
}

export interface PgOrganization {
    id: number;
    org_id: string;
    name: string;
    slug: string;
    owner_id: number;
    logo_url: string | null;
    description: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface PgApiKey {
    id: number;
    key_id: string;
    key_prefix: string;
    key_hash: string;
    name: string;
    user_id: number;
    org_id: number;
    scopes: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
}

/**
 * Save or update a user in PostgreSQL (upsert)
 */
export async function saveUserToPostgres(userData: {
    clerkId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    imageUrl?: string | null;
    provider?: string;
}): Promise<{ success: boolean; user?: PgUser; error?: string }> {
    if (!pool) {
        return { 
            success: false, 
            error: 'PostgreSQL not configured - missing credentials' 
        };
    }

    try {
        // Ensure schema exists before first write
        await ensureSchema();

        const result = await pool.query(
            `INSERT INTO users (clerk_id, email, first_name, last_name, full_name, image_url, provider, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (clerk_id) DO UPDATE SET
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         full_name = EXCLUDED.full_name,
         image_url = EXCLUDED.image_url,
         last_login_at = NOW()
       RETURNING *`,
            [
                userData.clerkId,
                userData.email,
                userData.firstName || null,
                userData.lastName || null,
                userData.fullName || null,
                userData.imageUrl || null,
                userData.provider || 'email',
            ]
        );

        return { success: true, user: result.rows[0] as PgUser };
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to save user:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get a user from PostgreSQL by clerkId
 */
export async function getUserFromPostgres(
    clerkId: string
): Promise<PgUser | null> {
    if (!pool) {
        return null;
    }

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT * FROM users WHERE clerk_id = $1',
            [clerkId]
        );
        return result.rows.length > 0 ? (result.rows[0] as PgUser) : null;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to get user:', error.message);
        return null;
    }
}

/**
 * Get a user from PostgreSQL by email
 */
export async function getUserByEmailFromPostgres(
    email: string
): Promise<PgUser | null> {
    if (!pool) {
        return null;
    }

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows.length > 0 ? (result.rows[0] as PgUser) : null;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to get user by email:', error.message);
        return null;
    }
}

// ─── Organization Operations ────────────────────────────────

/**
 * Create an organization
 */
export async function createOrganization(data: {
    name: string;
    slug: string;
    ownerId: number;
    logoUrl?: string;
    description?: string;
}): Promise<{ success: boolean; organization?: PgOrganization; error?: string }> {
    if (!pool) {
        return { success: false, error: 'PostgreSQL not configured' };
    }

    try {
        await ensureSchema();
        const result = await pool.query(
            `INSERT INTO organizations (name, slug, owner_id, logo_url, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.name, data.slug, data.ownerId, data.logoUrl || null, data.description || null]
        );

        // Add owner as admin member
        await pool.query(
            `INSERT INTO org_members (org_id, user_id, role)
             VALUES ($1, $2, 'admin')`,
            [result.rows[0].id, data.ownerId]
        );

        return { success: true, organization: result.rows[0] as PgOrganization };
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to create organization:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get organization by user ID
 */
export async function getOrganizationByUserId(userId: number): Promise<PgOrganization | null> {
    if (!pool) return null;

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT o.* FROM organizations o WHERE o.owner_id = $1 ORDER BY o.created_at DESC LIMIT 1',
            [userId]
        );
        return result.rows.length > 0 ? (result.rows[0] as PgOrganization) : null;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to get organization:', error.message);
        return null;
    }
}

/**
 * Check if organization slug exists
 */
export async function checkOrgSlugExists(slug: string): Promise<boolean> {
    if (!pool) return false;

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT 1 FROM organizations WHERE slug = $1',
            [slug]
        );
        return result.rows.length > 0;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to check slug:', error.message);
        return false;
    }
}

// ─── API Key Operations ─────────────────────────────────────

/**
 * Save API key (stores only prefix and hash)
 */
export async function saveApiKey(data: {
    keyPrefix: string;
    keyHash: string;
    name: string;
    userId: number;
    orgId: number;
    scopes?: string[];
    expiresAt?: Date;
}): Promise<{ success: boolean; apiKey?: PgApiKey; error?: string }> {
    if (!pool) {
        return { success: false, error: 'PostgreSQL not configured' };
    }

    try {
        await ensureSchema();
        const result = await pool.query(
            `INSERT INTO api_keys (key_prefix, key_hash, name, user_id, org_id, scopes, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                data.keyPrefix,
                data.keyHash,
                data.name,
                data.userId,
                data.orgId,
                data.scopes || ['memory:read', 'memory:write'],
                data.expiresAt || null
            ]
        );
        return { success: true, apiKey: result.rows[0] as PgApiKey };
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to save API key:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get API keys by user ID
 */
export async function getApiKeysByUserId(userId: number): Promise<PgApiKey[]> {
    if (!pool) return [];

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT * FROM api_keys WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
            [userId]
        );
        return result.rows as PgApiKey[];
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to get API keys:', error.message);
        return [];
    }
}

/**
 * Validate API key - returns user info if valid
 */
export async function validateApiKey(keyPrefix: string, keyHash: string): Promise<{ valid: boolean; userId?: number; orgId?: number }> {
    if (!pool) return { valid: false };

    try {
        await ensureSchema();
        const result = await pool.query(
            `SELECT user_id, org_id FROM api_keys 
             WHERE key_prefix = $1 AND key_hash = $2 AND is_active = true
             AND (expires_at IS NULL OR expires_at > NOW())`,
            [keyPrefix, keyHash]
        );
        
        if (result.rows.length > 0) {
            // Update last_used_at
            await pool.query(
                'UPDATE api_keys SET last_used_at = NOW() WHERE key_prefix = $1',
                [keyPrefix]
            );
            return { valid: true, userId: result.rows[0].user_id, orgId: result.rows[0].org_id };
        }
        return { valid: false };
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to validate API key:', error.message);
        return { valid: false };
    }
}

/**
 * Revoke API key
 */
export async function revokeApiKey(keyId: string, userId: number): Promise<boolean> {
    if (!pool) return false;

    try {
        const result = await pool.query(
            'UPDATE api_keys SET is_active = false WHERE key_id = $1 AND user_id = $2',
            [keyId, userId]
        );
        return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to revoke API key:', error.message);
        return false;
    }
}

// ─── Onboarding Operations ──────────────────────────────────

/**
 * Mark user as onboarded and record the timestamp
 */
export async function markUserOnboarded(clerkId: string): Promise<boolean> {
    if (!pool) return false;

    try {
        await ensureSchema();
        const result = await pool.query(
            'UPDATE users SET is_onboarded = true, onboarded_at = NOW() WHERE clerk_id = $1',
            [clerkId]
        );
        return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to mark user onboarded:', error.message);
        return false;
    }
}

/**
 * Check if user is onboarded
 */
export async function isUserOnboarded(clerkId: string): Promise<boolean> {
    if (!pool) return false;

    try {
        await ensureSchema();
        const result = await pool.query(
            'SELECT is_onboarded FROM users WHERE clerk_id = $1',
            [clerkId]
        );
        return result.rows.length > 0 && result.rows[0].is_onboarded === true;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to check onboarding status:', error.message);
        return false;
    }
}

// ─── Bucket Operations ──────────────────────────────────────

export interface PgBucket {
    id: number;
    bucket_id: string;
    user_id: number;
    org_id: number | null;
    name: string;
    slug: string;
    description: string | null;
    is_default: boolean;
    is_active: boolean;
    memory_count: number;
    created_at: Date;
    updated_at: Date;
}

/**
 * Create the user's default "main" bucket.
 * Called once during onboarding — every user gets a root namespace.
 */
export async function createMainBucket(userId: number, orgId: number | null): Promise<PgBucket | null> {
    if (!pool) return null;

    try {
        await ensureSchema();
        const result = await pool.query(
            `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
             VALUES ($1, $2, 'Main', 'main', 'Default memory bucket', true)
             ON CONFLICT (user_id, slug) DO UPDATE SET
               is_active = true, updated_at = NOW()
             RETURNING *`,
            [userId, orgId]
        );
        return result.rows[0] ?? null;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to create main bucket:', error.message);
        return null;
    }
}

/**
 * Create a custom bucket for the user (e.g. dedicated chat conversation).
 */
export async function createBucket(data: {
    userId: number;
    orgId: number | null;
    name: string;
    slug: string;
    description?: string;
}): Promise<{ success: boolean; bucket?: PgBucket; error?: string }> {
    if (!pool) return { success: false, error: 'Database not initialized' };

    try {
        await ensureSchema();

        // Limit to 50 buckets per user
        const countResult = await pool.query(
            'SELECT count(*) as c FROM buckets WHERE user_id = $1 AND is_active = true',
            [data.userId]
        );
        if (parseInt(countResult.rows[0].c) >= 50) {
            return { success: false, error: 'Maximum 50 buckets allowed per user' };
        }

        const result = await pool.query(
            `INSERT INTO buckets (user_id, org_id, name, slug, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.userId, data.orgId, data.name, data.slug, data.description ?? null]
        );
        return { success: true, bucket: result.rows[0] };
    } catch (error: any) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            return { success: false, error: 'A bucket with this name already exists' };
        }
        console.error('[PostgreSQL] Failed to create bucket:', error.message);
        return { success: false, error: 'Failed to create bucket' };
    }
}

/**
 * Get all active buckets for a user.
 */
export async function getBucketsByUserId(userId: number): Promise<PgBucket[]> {
    if (!pool) return [];

    try {
        await ensureSchema();
        const result = await pool.query(
            `SELECT b.*, 
                    (SELECT count(*) FROM memories m WHERE m.bucket = b.slug AND m.user_id = b.user_id AND m.is_active = true) as memory_count
             FROM buckets b
             WHERE b.user_id = $1 AND b.is_active = true
             ORDER BY b.is_default DESC, b.created_at ASC`,
            [userId]
        );
        return result.rows;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to get buckets:', error.message);
        return [];
    }
}

/**
 * Delete (soft) a bucket. Cannot delete the default bucket.
 */
export async function deleteBucket(bucketId: string, userId: number): Promise<boolean> {
    if (!pool) return false;

    try {
        const result = await pool.query(
            `UPDATE buckets SET is_active = false, updated_at = NOW()
             WHERE bucket_id = $1 AND user_id = $2 AND is_default = false`,
            [bucketId, userId]
        );
        return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
        console.error('[PostgreSQL] Failed to delete bucket:', error.message);
        return false;
    }
}

// ─── Bucket Sharing Operations ──────────────────────────────

export interface PgBucketShare {
    id: number;
    share_id: string;
    source_bucket_id: string;
    source_user_id: number;
    target_user_id: number | null;
    target_email: string;
    copied_bucket_id: string | null;
    status: 'pending' | 'accepted' | 'declined';
    message: string | null;
    created_at: Date;
    accepted_at: Date | null;
}

/**
 * Create a bucket share invitation.
 * Copies the bucket + its memories to the target user.
 */
export async function createBucketShare(data: {
    sourceBucketId: string;
    sourceBucketSlug?: string;
    sourceUserId: number;
    targetUserId: number;
    targetEmail: string;
    message?: string;
}): Promise<{ success: boolean; share?: PgBucketShare; error?: string }> {
    if (!pool) return { success: false, error: 'Database not initialized' };

    try {
        await ensureSchema();

        // Get source bucket — try slug first (consistent across DBs), then bucket_id
        let bucketRes;
        if (data.sourceBucketSlug) {
            bucketRes = await pool.query(
                `SELECT * FROM buckets WHERE slug = $1 AND user_id = $2 AND is_active = true`,
                [data.sourceBucketSlug, data.sourceUserId]
            );
        }
        if (!bucketRes?.rows[0]) {
            bucketRes = await pool.query(
                `SELECT * FROM buckets WHERE bucket_id = $1 AND user_id = $2 AND is_active = true`,
                [data.sourceBucketId, data.sourceUserId]
            );
        }
        if (!bucketRes.rows[0]) {
            return { success: false, error: 'Bucket not found or not owned by you' };
        }

        const srcBucket = bucketRes.rows[0];

        // Check target user's bucket limit
        const cntRes = await pool.query(
            'SELECT count(*) as c FROM buckets WHERE user_id = $1 AND is_active = true',
            [data.targetUserId]
        );
        if (parseInt(cntRes.rows[0].c) >= 50) {
            return { success: false, error: 'Recipient has reached their bucket limit (50)' };
        }

        // Create a unique slug for the copied bucket
        const baseSlug = `shared-${srcBucket.slug}`;
        let copySlug = baseSlug;
        let attempt = 0;
        while (true) {
            const existsRes = await pool.query(
                'SELECT 1 FROM buckets WHERE user_id = $1 AND slug = $2',
                [data.targetUserId, copySlug]
            );
            if (!existsRes.rows[0]) break;
            attempt++;
            copySlug = `${baseSlug}-${attempt}`;
            if (attempt > 20) {
                return { success: false, error: 'Could not generate unique slug for copied bucket' };
            }
        }

        // Start transaction — copy bucket + memories atomically
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Create copied bucket for target user
            const copyRes = await client.query(
                `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
                 VALUES ($1, NULL, $2, $3, $4, false)
                 RETURNING *`,
                [
                    data.targetUserId,
                    `${srcBucket.name} (shared)`,
                    copySlug,
                    `Shared by ${data.targetEmail ? 'another user' : 'a teammate'}. ${srcBucket.description || ''}`.trim(),
                ]
            );
            const copiedBucket = copyRes.rows[0];

            // 2. Copy memories from source bucket to target user's new bucket
            // Uses the bucket slug to find memories, copies encrypted data as-is
            await client.query(
                `INSERT INTO memories (pointer_id, user_id, org_id, bucket, title, content_encrypted,
                   content_iv, content_tag, content_hash, tags, token_count, original_tokens, metadata,
                   sub_path, importance)
                 SELECT
                   'cp' || substring(md5(random()::text) from 1 for 10),
                   $1, NULL, $2, title, content_encrypted,
                   content_iv, content_tag, content_hash, tags, token_count, original_tokens,
                   jsonb_set(COALESCE(metadata, '{}'), '{shared_from}', to_jsonb($3::text)),
                   sub_path, importance
                 FROM memories
                 WHERE bucket = $4 AND user_id = $5 AND is_active = true`,
                [data.targetUserId, copySlug, data.sourceBucketId, srcBucket.slug, data.sourceUserId]
            );

            // 3. Update memory_count on copied bucket
            const memCntRes = await client.query(
                'SELECT COUNT(*) as c FROM memories WHERE bucket = $1 AND user_id = $2 AND is_active = true',
                [copySlug, data.targetUserId]
            );
            await client.query(
                'UPDATE buckets SET memory_count = $1 WHERE id = $2',
                [parseInt(memCntRes.rows[0].c), copiedBucket.id]
            );

            // 4. Record the share (use actual Aiven bucket_id from resolved bucket)
            const shareRes = await client.query(
                `INSERT INTO bucket_shares (source_bucket_id, source_user_id, target_user_id, target_email, copied_bucket_id, status, message)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6)
                 ON CONFLICT (source_bucket_id, target_email) DO UPDATE SET
                   copied_bucket_id = EXCLUDED.copied_bucket_id,
                   status = 'accepted',
                   accepted_at = NOW()
                 RETURNING *`,
                [srcBucket.bucket_id, data.sourceUserId, data.targetUserId, data.targetEmail,
                 copiedBucket.bucket_id, data.message ?? null]
            );

            await client.query('COMMIT');
            return { success: true, share: shareRes.rows[0] };
        } catch (txErr: any) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (error: any) {
        if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
            return { success: false, error: 'This bucket has already been shared with this user' };
        }
        console.error('[PostgreSQL] Failed to create bucket share:', error.message);
        return { success: false, error: 'Failed to share bucket' };
    }
}

/**
 * Get shares sent by a user
 */
export async function getSharesSentByUser(userId: number): Promise<any[]> {
    if (!pool) return [];
    try {
        const res = await pool.query(
            `SELECT bs.*, b.name as bucket_name, b.slug as bucket_slug,
                    u.email as target_user_email, u.full_name as target_user_name
             FROM bucket_shares bs
             JOIN buckets b ON b.bucket_id = bs.source_bucket_id
             LEFT JOIN users u ON u.id = bs.target_user_id
             WHERE bs.source_user_id = $1
             ORDER BY bs.created_at DESC`,
            [userId]
        );
        return res.rows;
    } catch (e: any) {
        console.error('[PostgreSQL] getSharesSentByUser error:', e.message);
        return [];
    }
}

/**
 * Get shares received by a user
 */
export async function getSharesReceivedByUser(userId: number): Promise<any[]> {
    if (!pool) return [];
    try {
        const res = await pool.query(
            `SELECT bs.*, b.name as bucket_name, b.slug as bucket_slug,
                    u.email as source_user_email, u.full_name as source_user_name
             FROM bucket_shares bs
             JOIN buckets b ON b.bucket_id = bs.source_bucket_id
             LEFT JOIN users u ON u.id = bs.source_user_id
             WHERE bs.target_user_id = $1
             ORDER BY bs.created_at DESC`,
            [userId]
        );
        return res.rows;
    } catch (e: any) {
        console.error('[PostgreSQL] getSharesReceivedByUser error:', e.message);
        return [];
    }
}

// ─── Notification Operations ────────────────────────────────

export interface PgNotification {
    id: number;
    notif_id: string;
    user_id: number;
    type: string;
    title: string;
    body: string | null;
    metadata: Record<string, any>;
    is_read: boolean;
    created_at: Date;
}

/**
 * Create a notification for a user
 */
export async function createNotification(data: {
    userId: number;
    type: string;
    title: string;
    body?: string;
    metadata?: Record<string, any>;
}): Promise<PgNotification | null> {
    if (!pool) return null;
    try {
        await ensureSchema();
        const res = await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.userId, data.type, data.title, data.body ?? null, JSON.stringify(data.metadata ?? {})]
        );
        return res.rows[0] ?? null;
    } catch (e: any) {
        console.error('[PostgreSQL] createNotification error:', e.message);
        return null;
    }
}

/**
 * Get notifications for a user (most recent first, max 50)
 */
export async function getNotifications(userId: number): Promise<PgNotification[]> {
    if (!pool) return [];
    try {
        await ensureSchema();
        const res = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 50`,
            [userId]
        );
        return res.rows;
    } catch (e: any) {
        console.error('[PostgreSQL] getNotifications error:', e.message);
        return [];
    }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(userId: number): Promise<number> {
    if (!pool) return 0;
    try {
        const res = await pool.query(
            'SELECT COUNT(*) as c FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        return parseInt(res.rows[0]?.c || '0', 10);
    } catch { return 0; }
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(userId: number, notifIds?: string[]): Promise<boolean> {
    if (!pool) return false;
    try {
        if (notifIds && notifIds.length > 0) {
            await pool.query(
                `UPDATE notifications SET is_read = true WHERE user_id = $1 AND notif_id = ANY($2)`,
                [userId, notifIds]
            );
        } else {
            // Mark all as read
            await pool.query(
                'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
                [userId]
            );
        }
        return true;
    } catch (e: any) {
        console.error('[PostgreSQL] markNotificationsRead error:', e.message);
        return false;
    }
}

export { pool };
