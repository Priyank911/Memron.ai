import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

/**
 * GET /api/dashboard/memories — List the user's memories
 *
 * Uses the same user_id / org_id fallback logic as the stats route
 * to handle user_id mismatches between Clerk and MCP auth paths.
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(clerkId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let uid = dbUser.id;

    // Resolve org_id — memories may be linked via org_id through MCP
    let orgId: number | null = null;
    try {
      const orgRes = await query(
        `SELECT id FROM organizations WHERE owner_id = $1 AND is_active = true LIMIT 1`,
        [uid],
      );
      orgId = orgRes.rows[0]?.id ?? null;
    } catch {
      /* table may not exist */
    }

    // Build WHERE clause: match user_id OR org_id
    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [uid];

    if (orgId) {
      conditions.push(`org_id = $2`);
      params.push(orgId);
    }

    let whereUser = conditions.join(' OR ');

    console.log(`[Dashboard Memories] uid=${uid}, orgId=${orgId}, clerk=${clerkId}`);

    let memories: any[] = [];

    // Try full query first, fall back to simpler one if columns missing
    try {
      const result = await query(
        `SELECT id, pointer_id, bucket, title, tags, token_count, metadata, created_at, updated_at
         FROM memories
         WHERE (${whereUser})
         ORDER BY created_at DESC
         LIMIT 100`,
        params,
      );

      memories = result.rows.map((r: any) => ({
        id: r.pointer_id || String(r.id),
        bucket: r.bucket || 'unknown',
        title: r.title || '(untitled)',
        tags: Array.isArray(r.tags) ? r.tags : [],
        tokenCount: parseInt(r.token_count || '0', 10),
        metadata: r.metadata || {},
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e: any) {
      console.error('[Dashboard Memories] Full query failed, trying fallback:', e.message);

      try {
        const result = await query(
          `SELECT id, pointer_id, bucket, title, created_at
           FROM memories
           WHERE (${whereUser})
           ORDER BY created_at DESC
           LIMIT 100`,
          params,
        );

        memories = result.rows.map((r: any) => ({
          id: r.pointer_id || String(r.id),
          bucket: r.bucket || 'unknown',
          title: r.title || '(untitled)',
          tags: [],
          tokenCount: 0,
          metadata: {},
          createdAt: r.created_at,
          updatedAt: r.created_at,
        }));
      } catch (e2: any) {
        console.error('[Dashboard Memories] Fallback query also failed:', e2.message);
      }
    }

    // If still 0 memories, check for single-tenant user_id mismatch
    if (memories.length === 0) {
      try {
        const allRes = await query(`SELECT COUNT(*) as total FROM memories`);
        const allCount = parseInt(allRes.rows[0]?.total || '0', 10);
        if (allCount > 0) {
          const distinctRes = await query(`SELECT DISTINCT user_id FROM memories`);
          if (distinctRes.rows.length === 1) {
            const memUserId = distinctRes.rows[0].user_id;
            console.warn(`[Dashboard Memories] Single-tenant fallback: memories have user_id=${memUserId}, using it.`);
            const result = await query(
              `SELECT id, pointer_id, bucket, title, tags, token_count, metadata, created_at, updated_at
               FROM memories
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT 100`,
              [memUserId],
            );
            memories = result.rows.map((r: any) => ({
              id: r.pointer_id || String(r.id),
              bucket: r.bucket || 'unknown',
              title: r.title || '(untitled)',
              tags: Array.isArray(r.tags) ? r.tags : [],
              tokenCount: parseInt(r.token_count || '0', 10),
              metadata: r.metadata || {},
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            }));
          }
        }
      } catch {
        /* fallback check failed, continue */
      }
    }

    console.log(`[Dashboard Memories] Returning ${memories.length} memories`);
    return NextResponse.json({ memories });
  } catch (error: any) {
    console.error('[Dashboard Memories] Fatal error:', error.message, error.stack);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
