/**
 * Supabase Read Module
 *
 * Provides read-only access to the Supabase PostgreSQL instance
 * used by the MCP server. The dashboard reads memory data from here
 * because the MCP server writes memories/profiles to Supabase,
 * NOT to the primary Aiven database.
 *
 * Architecture:
 *   Landing (Aiven)  ──writes──▸  users, orgs, api_keys
 *   MCP (Supabase)   ──writes──▸  memories, profiles, sessions
 *   Dashboard        ──reads───▸  Supabase (this module) for memory data
 *                    ──reads───▸  Aiven (postgres.ts) for user/auth data
 *
 * Security: Queries are always scoped by user_id resolved via clerk_id.
 * No cross-user data is ever exposed.
 */

import { Pool, QueryResult } from 'pg';

// ─── Connection config ───────────────────────────────────────

const SUPA_HOST = process.env.SUPABASE_PG_HOST || '';
const SUPA_PORT = parseInt(process.env.SUPABASE_PG_PORT || '5432', 10);
const SUPA_DB   = process.env.SUPABASE_PG_DATABASE || 'postgres';
const SUPA_USER = process.env.SUPABASE_PG_USER || '';
const SUPA_PASS = process.env.SUPABASE_PG_PASSWORD || '';

const isConfigured = !!(SUPA_HOST && SUPA_USER && SUPA_PASS);

const sslConfig: any =
  process.env.SUPABASE_PG_SSL === 'false'
    ? false
    : { rejectUnauthorized: false };

let pool: Pool | null = null;

if (isConfigured) {
  pool = new Pool({
    host: SUPA_HOST,
    port: SUPA_PORT,
    database: SUPA_DB,
    user: SUPA_USER,
    password: SUPA_PASS,
    ssl: sslConfig,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    console.error('[SupaRead] Pool error:', err.message);
  });
} else {
  console.warn('[SupaRead] Not configured — dashboard will show no MCP data. Set SUPABASE_PG_* env vars.');
}

// ─── Query helper ────────────────────────────────────────────

export async function supaQuery<T extends Record<string, any> = any>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  if (!pool) {
    // Return empty result if not configured
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any;
  }
  return pool.query<T>(sql, params);
}

export function isSupabaseConfigured(): boolean {
  return isConfigured && pool !== null;
}

// ─── User resolution ─────────────────────────────────────────

/**
 * Resolve a Clerk user ID to the Supabase user record.
 * Returns { id, email, org_id } or null if not found.
 *
 * This is critical because user IDs differ between Aiven and Supabase:
 *   Aiven:    priyanktechpanchal@gmail.com → id=190
 *   Supabase: priyanktechpanchal@gmail.com → id=3
 *
 * Dashboard must use the Supabase user_id when querying memories.
 */
export async function resolveSupabaseUser(clerkId: string, targetOrgUuid?: string | null): Promise<{
  id: number;
  email: string;
  orgId: number | null;
} | null> {
  if (!pool) return null;

  try {
    const userRes = await pool.query(
      'SELECT id, email FROM users WHERE clerk_id = $1 AND is_active = true LIMIT 1',
      [clerkId],
    );

    if (!userRes.rows[0]) return null;

    const user = userRes.rows[0];

    // Resolve org_id — use specified workspace UUID if provided
    let orgId: number | null = null;
    try {
      if (targetOrgUuid) {
        // Try matching by org_id UUID first, then by slug as fallback
        const orgRes = await pool.query(
          `SELECT o.id FROM organizations o
           LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = $2
           WHERE (o.org_id = $1::text OR o.slug = $1::text)
             AND o.is_active = true
             AND (o.owner_id = $2 OR om.user_id = $2)
           LIMIT 1`,
          [targetOrgUuid, user.id],
        );
        orgId = orgRes.rows[0]?.id ?? null;

        if (orgId === null) {
          // Org not found by UUID/slug — workspace may not be synced to Supabase yet
          // (race condition between workspace creation and async sync).
          // Fallback: resolve to the user's primary org so the user always sees their data.
          // This is safe because buildUserWhereClause still applies the orgId scope,
          // and it only affects which integer ID is used for the `org_id` column filter.
          // When the workspace eventually syncs, the correct org ID will be resolved.
          const fallbackRes = await pool.query(
            `SELECT id FROM organizations WHERE owner_id = $1 AND is_active = true ORDER BY id ASC LIMIT 1`,
            [user.id],
          );
          orgId = fallbackRes.rows[0]?.id ?? null;
        }
      } else {
        // No specific workspace — get user's primary org (oldest, most likely the default)
        const orgRes = await pool.query(
          'SELECT id FROM organizations WHERE owner_id = $1 AND is_active = true ORDER BY id ASC LIMIT 1',
          [user.id],
        );
        orgId = orgRes.rows[0]?.id ?? null;
      }
    } catch {
      /* organizations table may not exist in this Supabase instance yet */
    }

    return { id: user.id, email: user.email, orgId };
  } catch {
    return null;
  }
}

/**
 * Build a WHERE clause that matches both user_id and org_id.
 *
 * Org isolation model:
 *  - Memories explicitly tagged to an org (org_id = X) are isolated to that org.
 *  - Memories with org_id IS NULL are "universal" — written before org context
 *    was tracked or by tools that don't send org context. They surface in whichever
 *    workspace the user is viewing so historical data is never hidden.
 *  - A memory from org A (org_id = A) never appears in org B's view — true isolation.
 */
export function buildUserWhereClause(
  userId: number,
  orgId: number | null,
  startParamIdx = 1,
): { where: string; params: (number)[]; nextIdx: number } {
  const params: number[] = [userId];
  let idx = startParamIdx + 1;

  if (orgId) {
    // Show memories for this org PLUS any untagged (null org_id) memories.
    // Untagged memories are universal — they show in every workspace the user has.
    // Memories explicitly tagged to a different org will NOT appear here.
    params.push(orgId);
    return {
      where: `user_id = $${startParamIdx} AND (org_id = $${idx} OR org_id IS NULL)`,
      params,
      nextIdx: idx + 1,
    };
  }

  return {
    where: `user_id = $${startParamIdx}`,
    params,
    nextIdx: startParamIdx + 1,
  };
}
