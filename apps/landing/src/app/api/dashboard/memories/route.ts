import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';

/**
 * GET /api/dashboard/memories — List the user's memories
 *
 * Reads from **Supabase** (where the MCP server writes memories).
 * Resolves Clerk ID → Supabase user_id to ensure correct data isolation.
 *
 * Security: Only returns memories belonging to the authenticated user.
 * Content is NOT returned (it's AES-256-GCM encrypted in the DB).
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Resolve user in Supabase (MCP database)
    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) {
      return NextResponse.json({ memories: [] });
    }

    const { id: uid, orgId } = supaUser;
    const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

    console.log(`[Dashboard Memories] supaUid=${uid}, orgId=${orgId}, clerk=${clerkId}`);

    let memories: any[] = [];

    // Try full query first, fall back to simpler one if columns missing
    try {
      const result = await supaQuery(
        `SELECT id, pointer_id, bucket, title, tags, token_count, original_tokens, metadata, created_at, updated_at
         FROM memories
         WHERE (${whereUser}) AND is_active = true
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
        originalTokens: parseInt(r.original_tokens || '0', 10),
        metadata: r.metadata || {},
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e: any) {
      console.error('[Dashboard Memories] Full query failed, trying fallback:', e.message);

      try {
        const result = await supaQuery(
          `SELECT id, pointer_id, bucket, title, created_at
           FROM memories
           WHERE (${whereUser}) AND is_active = true
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
          originalTokens: 0,
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
