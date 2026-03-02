import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

/**
 * GET /api/dashboard/memories — List the user's memories
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const uid = dbUser.id;
    console.log(`[Dashboard Memories] Fetching for user id=${uid}`);

    let memories: any[] = [];

    // Try full query first, fall back to simpler one if columns missing
    try {
      const result = await query(
        `SELECT id, pointer_id, bucket, title, tags, token_count, metadata, created_at, updated_at
         FROM memories
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [uid],
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

      // Fallback: just get the basic columns
      try {
        const result = await query(
          `SELECT id, pointer_id, bucket, title, created_at
           FROM memories
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [uid],
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
