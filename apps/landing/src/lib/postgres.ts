// PostgreSQL Configuration - Primary Database (Aiven)
// Used as the main source of truth for all structured data

import { Pool, PoolClient } from 'pg';

// Connection pool for PostgreSQL (Aiven)
// SSL is required for Aiven connections
const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '27847'),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: {
        rejectUnauthorized: true, // Aiven uses valid SSL certs
    },
    max: 10, // Maximum connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err);
});

/**
 * Execute a query against PostgreSQL
 */
export async function query(text: string, params?: any[]) {
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
    return pool.connect();
}

/**
 * Test the database connection
 */
export async function testConnection(): Promise<boolean> {
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
    const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      clerk_id        VARCHAR(255) UNIQUE NOT NULL,
      email           VARCHAR(255) UNIQUE NOT NULL,
      first_name      VARCHAR(255),
      last_name       VARCHAR(255),
      full_name       VARCHAR(255),
      image_url       TEXT,
      provider        VARCHAR(50) DEFAULT 'email',
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      last_login_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `;

    const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
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
    END;
    $$;
  `;

    try {
        await pool.query(createUsersTable);
        await pool.query(createIndexes);
        await pool.query(createUpdatedAtTrigger);
        console.log('[PostgreSQL] Schema initialized successfully');
    } catch (error: any) {
        console.error('[PostgreSQL] Schema initialization failed:', error.message);
        throw error;
    }
}

// ─── User Operations ────────────────────────────────────────

export interface PgUser {
    id: number;
    clerk_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    image_url: string | null;
    provider: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    last_login_at: Date;
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
    try {
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
    try {
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
    try {
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

export { pool };
