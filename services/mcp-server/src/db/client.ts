/**
 * PostgreSQL Connection Pool — Production Grade
 *
 * Features:
 * - Connection pool with optimal settings for remote DBs
 * - Automatic retry with exponential backoff
 * - Connection warming on startup
 * - Pool health monitoring
 * - Slow query detection with smart thresholds
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
  idleTimeoutMillis: config.db.idleTimeout,
  connectionTimeoutMillis: config.db.connectionTimeout,
  // Keep connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Pool stats for monitoring
let totalQueries = 0;
let failedQueries = 0;
let totalDuration = 0;

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

pool.on('connect', () => {
  // Connection established
});

pool.on('remove', () => {
  // Connection removed from pool
});

/**
 * Get pool health stats
 */
export function getPoolStats(): {
  total: number;
  idle: number;
  waiting: number;
  totalQueries: number;
  failedQueries: number;
  avgDuration: string;
} {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    totalQueries,
    failedQueries,
    avgDuration: totalQueries > 0 ? (totalDuration / totalQueries).toFixed(0) + 'ms' : '0ms',
  };
}

/**
 * Log pool stats (called periodically)
 */
export function logPoolStats(): void {
  const stats = getPoolStats();
  console.log(`[DB Pool] Connections: ${stats.total} total, ${stats.idle} idle, ${stats.waiting} waiting | Queries: ${stats.totalQueries} (avg ${stats.avgDuration})`);
}

/**
 * Warm the pool with initial connections so the first real queries aren't slow.
 */
export async function warmPool(): Promise<void> {
  const warmCount = Math.min(3, config.db.maxConnections);
  const warmPromises: Promise<void>[] = [];

  for (let i = 0; i < warmCount; i++) {
    warmPromises.push(
      (async () => {
        try {
          const client = await pool.connect();
          await client.query('SELECT 1');
          client.release();
        } catch {
          // Non-fatal — pool will connect lazily
        }
      })()
    );
  }

  await Promise.all(warmPromises);
  console.log(`[DB] Warmed pool with ${warmCount} connections`);
}

/**
 * Execute a parameterized SQL query with retry logic.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
  options?: { maxRetries?: number; retryDelay?: number }
): Promise<pg.QueryResult<T>> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelay = options?.retryDelay ?? 100;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;

      // Update stats
      totalQueries++;
      totalDuration += duration;

      // Smart slow query detection
      const isDDL = /^\s*(CREATE|ALTER|DROP|DO \$\$|BEGIN|COMMIT|ROLLBACK)/i.test(text);
      const isWrite = /^\s*(INSERT|UPDATE|DELETE)/i.test(text);
      const slowThreshold = isWrite ? 2000 : 1000;

      if (duration > slowThreshold && !isDDL) {
        console.warn(`[DB] Slow query (${duration}ms): ${text.slice(0, 100)}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      lastError = error instanceof Error ? error : new Error(String(error));
      failedQueries++;

      // Check if error is retryable
      const isRetryable = isRetryableError(lastError);

      if (isRetryable && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`[DB] Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
        await sleep(delay);
        continue;
      }

      // Log and throw final error
      console.error(`[DB] Query failed after ${attempt + 1} attempts (${duration}ms): ${lastError.message} — ${text.slice(0, 100)}`);
      throw lastError;
    }
  }

  throw lastError || new Error('Query failed with unknown error');
}

/**
 * Check if error is retryable (connection issues, timeouts)
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket') ||
    message.includes('network')
  );
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// Log pool stats every 5 minutes in production
if (config.nodeEnv === 'production' || config.nodeEnv === 'development') {
  setInterval(logPoolStats, 5 * 60 * 1000);
}
