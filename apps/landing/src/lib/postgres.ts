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
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`[PostgreSQL] Query executed in ${duration}ms — rows: ${result.rowCount}`);
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

export { pool };
