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
import * as pg from 'pg';
import { config } from '../config.js';
import { getEnv } from '../env.js';

const { Client, Pool } = pg;

let _pool: pg.Pool | null = null;

// Hyperdrive/session-pool connections are shared by all requests in a Worker
// isolate. A single recall can otherwise fan out into vector, BM25, graph,
// recency, and hydration queries at the same time and make every request wait
// behind the same small remote pool. Keep the edge-side concurrency bounded;
// Node/Railway keeps its existing pool behavior.
let activeWorkerQueries = 0;
const waitingWorkerQueries: Array<() => void> = [];

async function acquireWorkerQuerySlot(): Promise<() => void> {
  const max = Math.max(
    1,
    Math.min(
      4,
      config.db.maxConnections,
      Number(getEnv('WORKER_DB_CONCURRENCY') || config.db.maxConnections),
    ),
  );
  if (activeWorkerQueries < max) {
    activeWorkerQueries++;
  } else {
    await new Promise<void>((resolve) => waitingWorkerQueries.push(resolve));
    activeWorkerQueries++;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeWorkerQueries = Math.max(0, activeWorkerQueries - 1);
    waitingWorkerQueries.shift()?.();
  };
}

function createPool(): pg.Pool {
  const sslConfig = config.db.ssl || (config.nodeEnv === 'production'
    ? { rejectUnauthorized: false }
    : false);

  // Cloudflare Workers reach Postgres through Hyperdrive (plain TCP is
  // unavailable in Workers). When a Hyperdrive connection string is present
  // it takes precedence over the individual PG_* parts.
  const hyperdriveUrl = getEnv('HYPERDRIVE_CONNECTION_STRING');
  const poolConfig: pg.PoolConfig = hyperdriveUrl
    ? {
        connectionString: hyperdriveUrl,
        max: config.db.maxConnections,
        idleTimeoutMillis: config.db.idleTimeout,
        connectionTimeoutMillis: config.db.connectionTimeout,
      }
    : {
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
      };

  const p = new Pool(poolConfig);

  // Production guard: session poolers (Supabase/Aiven free tiers) cap total
  // clients around 15 across ALL processes. One oversized pool can starve
  // every other service into EMAXCONNSESSION crash loops.
  if (config.db.maxConnections > 10) {
    console.warn(
      `[DB] WARNING: pool max (${config.db.maxConnections}) exceeds the safe ceiling ` +
      `for a shared 15-client pooler. Lower PG_MAX_CONNECTIONS to ≤4 per process.`
    );
  }

  p.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  p.on('connect', () => {
    // Connection established
  });

  p.on('remove', () => {
    // Connection removed from pool
  });

  return p;
}

/**
 * Hyperdrive owns the origin pool. A module-level pg.Pool in a Worker can
 * retain request-owned sockets across isolate invocations and compete with
 * Hyperdrive's pool. Use a short-lived client per query instead.
 */
function createWorkerClient(): pg.Client {
  const connectionString = getEnv('HYPERDRIVE_CONNECTION_STRING');
  if (!connectionString) {
    throw new Error('HYPERDRIVE_CONNECTION_STRING is not configured');
  }

  return new Client({
    connectionString,
    connectionTimeoutMillis: config.db.connectionTimeout,
  });
}

async function workerQuery<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[],
  timeoutMs: number,
): Promise<pg.QueryResult<T>> {
  const client = createWorkerClient();
  try {
    await client.connect();
    // pg's Pool query config exposes query_timeout, but Client does not type
    // that extension. Set the server-side timeout explicitly for both.
    await client.query('SELECT set_config($1, $2, false)', ['statement_timeout', `${timeoutMs}ms`]);
    return await client.query<T>({ text, values: params });
  } finally {
    await client.end().catch((error: unknown) => {
      console.warn('[DB] Worker client close failed:', error instanceof Error ? error.message : String(error));
    });
  }
}

/**
 * Lazily-created pool. Module import must never open connections: on
 * Cloudflare Workers, env (and therefore the Hyperdrive string) arrives
 * after module load, and opening a pool at import time would use blanks.
 */
export function getPool(): pg.Pool {
  if (!_pool) _pool = createPool();
  return _pool;
}

/** Test seam: drop the cached pool so the next access re-reads config. */
export function resetPoolForTests(): void {
  _pool = null;
}

// Pool stats for monitoring
let totalQueries = 0;
let failedQueries = 0;
let totalDuration = 0;

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
  const pool = getPool();
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
          const client = await getPool().connect();
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
  options?: { maxRetries?: number; retryDelay?: number; queryTimeoutMs?: number }
): Promise<pg.QueryResult<T>> {
  // A Worker request has a bounded wall-clock lifetime. Retrying a saturated
  // Hyperdrive/session-pool connection three times can consume that entire
  // lifetime and Cloudflare then replaces the useful JSON error with Error
  // 1101 HTML. Keep one short retry at the edge; Node keeps the more tolerant
  // behavior for long-lived services.
  const workerRuntime = getEnv('MEMRON_RUNTIME') === 'worker';
  const maxRetries = options?.maxRetries ?? (workerRuntime ? 0 : 2);
  const baseDelay = options?.retryDelay ?? (workerRuntime ? 50 : 100);
  const workerQueryTimeoutMs = Math.max(
    2_500,
    Math.min(15_000, Number(options?.queryTimeoutMs || getEnv('WORKER_DB_QUERY_TIMEOUT_MS') || 10_000)),
  );
  const releaseWorkerSlot = workerRuntime ? await acquireWorkerQuerySlot() : () => undefined;
  let lastError: Error | null = null;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const start = Date.now();
      try {
        const result = workerRuntime
          ? await workerQuery<T>(text, params || [], workerQueryTimeoutMs)
          : await getPool().query<T>({
              text,
              values: params,
            });
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
  } finally {
    releaseWorkerSlot();
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
    message.includes('network') ||
    // Pooler saturation (Supabase session pooler EMAXCONNSESSION, Postgres
    // "too many clients"). Transient: old instances drain within seconds,
    // so backing off and retrying is correct — failing fast is not.
    message.includes('max clients') ||
    message.includes('emaxconnsession') ||
    message.includes('too many clients') ||
    message.includes('remaining connection slots')
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
  return getPool().connect();
}

/**
 * Execute multiple statements inside a transaction.
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
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
    const result = await getPool().query('SELECT NOW() as now');
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[DB] Connection test failed:', msg);
    return false;
  }
}

/** Error kinds that mean "config is wrong" — retrying will never help. */
function isFatalConfigError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('password authentication failed') ||
    m.includes('role') && m.includes('does not exist') ||
    m.includes('database') && m.includes('does not exist') ||
    m.includes('postgreSQL not configured'.toLowerCase())
  );
}

/**
 * Wait for the database to become reachable, retrying with exponential
 * backoff. Survives transient pooler saturation (EMAXCONNSESSION during
 * zero-downtime deploy overlap or traffic bursts) without crash-looping,
 * but fails fast on wrong credentials / missing database.
 *
 * Default: 8 attempts over ~2.5 minutes (2s, 4s, 8s, 16s, 30s, 30s, 30s).
 */
export async function waitForDatabase(options?: {
  attempts?: number;
  baseDelayMs?: number;
}): Promise<boolean> {
  const attempts = options?.attempts ?? 8;
  const base = options?.baseDelayMs ?? 2000;
  for (let i = 1; i <= attempts; i++) {
    try {
      await getPool().query('SELECT 1');
      if (i > 1) console.log(`[DB] Connected on attempt ${i}/${attempts}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      if (isFatalConfigError(msg)) {
        console.error('[DB] Connection failed (configuration error, not retrying):', msg);
        return false;
      }
      if (i >= attempts) {
        console.error(`[DB] Connection failed after ${attempts} attempts:`, msg);
        return false;
      }
      const delay = Math.min(30_000, base * 2 ** (i - 1));
      console.warn(`[DB] Connection attempt ${i}/${attempts} failed (${msg}) — retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  return false;
}

/**
 * Gracefully close all pool connections.
 */
export async function close(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  console.log('[DB] Pool closed');
}

/**
 * Start periodic pool-stats logging. Called explicitly from the Node entry
 * point — never auto-started at import, so Cloudflare Workers (no long-lived
 * timers on the free plan) stay timer-free unless they opt in.
 */
export function startPoolMonitor(): void {
  if (config.nodeEnv === 'production' || config.nodeEnv === 'development') {
    setInterval(logPoolStats, 5 * 60 * 1000);
  }
}
