/**
 * PostgreSQL Connection Pool
 *
 * Shared connection pool used by all database operations.
 * Connects to the same Supabase PostgreSQL instance as the landing app.
 * Uses Session Pooler (IPv4) at port 6543.
 */
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

const sslConfig = config.db.ssl || (config.nodeEnv === 'production'
  ? { rejectUnauthorized: false }
  : false);

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: sslConfig as any,
  max: config.db.maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized SQL query.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 200) {
      console.warn(`[DB] Slow query (${duration}ms): ${text.slice(0, 100)}`);
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DB] Query failed: ${msg} — ${text.slice(0, 100)}`);
    throw error;
  }
}

/**
 * Get a client from the pool for transaction support.
 * Caller MUST release the client when done.
 */
export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

/**
 * Execute multiple statements inside a transaction.
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connectivity. Returns true if reachable.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log('[DB] Connected:', result.rows[0].now);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[DB] Connection test failed:', msg);
    return false;
  }
}

/**
 * Gracefully close all pool connections.
 */
export async function close(): Promise<void> {
  await pool.end();
  console.log('[DB] Pool closed');
}
