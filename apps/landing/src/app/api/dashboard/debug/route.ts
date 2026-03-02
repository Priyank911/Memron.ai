import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres, query } from '@/lib/postgres';

/**
 * GET /api/dashboard/debug — Diagnostic endpoint
 *
 * Returns raw query results to identify why dashboard shows zeros.
 * Remove in production after debugging.
 */
export async function GET() {
  const debug: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      PG_HOST: process.env.PG_HOST ? '✓ set' : '✗ missing',
      PG_DATABASE: process.env.PG_DATABASE ? '✓ set' : '✗ missing',
      PG_USER: process.env.PG_USER ? `✓ ${process.env.PG_USER?.slice(0, 10)}...` : '✗ missing',
      PG_PASSWORD: process.env.PG_PASSWORD ? '✓ set' : '✗ missing',
      PG_PORT: process.env.PG_PORT || '5432 (default)',
    },
  };

  try {
    // 1. Auth
    const { userId: clerkId } = await auth();
    debug.clerkId = clerkId || 'NOT AUTHENTICATED';
    if (!clerkId) return NextResponse.json(debug);

    // 2. User lookup
    const dbUser = await getUserFromPostgres(clerkId);
    debug.dbUser = dbUser
      ? { id: dbUser.id, email: dbUser.email, clerk_id: dbUser.clerk_id, is_active: dbUser.is_active }
      : 'NOT FOUND IN DB';
    if (!dbUser) return NextResponse.json(debug);

    const uid = dbUser.id;

    // 3. Organization lookup
    try {
      const orgRes = await query(
        `SELECT id, name, owner_id, is_active FROM organizations WHERE owner_id = $1`,
        [uid],
      );
      debug.organizations = orgRes.rows;
    } catch (e: any) {
      debug.organizations = `ERROR: ${e.message}`;
    }

    // 4. Check if memories table exists
    try {
      const tableCheck = await query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'memories'
         ) as exists`,
      );
      debug.memoriesTableExists = tableCheck.rows[0]?.exists;
    } catch (e: any) {
      debug.memoriesTableExists = `ERROR: ${e.message}`;
    }

    // 5. Count ALL rows in memories (no filter)
    try {
      const res = await query(`SELECT COUNT(*) as total FROM memories`);
      debug.totalMemoriesNoFilter = parseInt(res.rows[0]?.total || '0', 10);
    } catch (e: any) {
      debug.totalMemoriesNoFilter = `ERROR: ${e.message}`;
    }

    // 6. Count memories for this user
    try {
      const res = await query(`SELECT COUNT(*) as total FROM memories WHERE user_id = $1`, [uid]);
      debug.totalMemoriesForUser = parseInt(res.rows[0]?.total || '0', 10);
    } catch (e: any) {
      debug.totalMemoriesForUser = `ERROR: ${e.message}`;
    }

    // 7. Count memories matching org_id
    try {
      const orgRes = await query(
        `SELECT id FROM organizations WHERE owner_id = $1 AND is_active = true LIMIT 1`,
        [uid],
      );
      const orgId = orgRes.rows[0]?.id;
      if (orgId) {
        const res = await query(`SELECT COUNT(*) as total FROM memories WHERE org_id = $1`, [orgId]);
        debug.totalMemoriesForOrg = { orgId, count: parseInt(res.rows[0]?.total || '0', 10) };
      } else {
        debug.totalMemoriesForOrg = 'NO ORG FOUND';
      }
    } catch (e: any) {
      debug.totalMemoriesForOrg = `ERROR: ${e.message}`;
    }

    // 8. Show distinct user_ids in memories
    try {
      const res = await query(`SELECT DISTINCT user_id FROM memories ORDER BY user_id`);
      debug.distinctUserIdsInMemories = res.rows.map((r: any) => r.user_id);
    } catch (e: any) {
      debug.distinctUserIdsInMemories = `ERROR: ${e.message}`;
    }

    // 9. CRITICAL: user_id mismatch detection
    try {
      const res = await query(`SELECT DISTINCT user_id FROM memories ORDER BY user_id`);
      const memUserIds = res.rows.map((r: any) => r.user_id);
      debug.userIdMismatch = {
        dashboardUserId: uid,
        memoryUserIds: memUserIds,
        isMatch: memUserIds.includes(uid),
        diagnosis: memUserIds.includes(uid)
          ? '✓ Dashboard user_id matches memories'
          : memUserIds.length > 0
            ? `✗ MISMATCH! Dashboard user id=${uid} but memories have user_id=[${memUserIds.join(',')}]`
            : 'No memories found at all',
      };
    } catch (e: any) {
      debug.userIdMismatch = `ERROR: ${e.message}`;
    }

    // 10. Show first 5 memories raw
    try {
      const res = await query(
        `SELECT id, pointer_id, user_id, org_id, bucket, title, token_count, is_active, created_at
         FROM memories ORDER BY id ASC LIMIT 5`,
      );
      debug.sampleMemories = res.rows;
    } catch (e: any) {
      debug.sampleMemories = `ERROR: ${e.message}`;
    }

    // 11. All users in the system
    try {
      const res = await query(`SELECT id, clerk_id, email, is_active FROM users ORDER BY id`);
      debug.allUsers = res.rows.map((r: any) => ({
        id: r.id,
        clerk_id: r.clerk_id ? r.clerk_id.slice(0, 20) + '...' : null,
        email: r.email,
        is_active: r.is_active,
      }));
    } catch (e: any) {
      debug.allUsers = `ERROR: ${e.message}`;
    }

    // 12. API keys with user_id mapping
    try {
      const res = await query(
        `SELECT id, key_prefix, user_id, org_id, is_active FROM api_keys ORDER BY id`,
      );
      debug.allApiKeys = res.rows;
    } catch (e: any) {
      debug.allApiKeys = `ERROR: ${e.message}`;
    }

    // 13. Connection test
    try {
      const res = await query(`SELECT NOW() as db_time, current_database() as db_name`);
      debug.connectionTest = res.rows[0];
    } catch (e: any) {
      debug.connectionTest = `ERROR: ${e.message}`;
    }
  } catch (e: any) {
    debug.fatalError = e.message;
  }

  return NextResponse.json(debug, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
