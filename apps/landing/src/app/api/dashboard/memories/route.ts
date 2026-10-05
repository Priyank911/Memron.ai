import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, invalidateEndpoint, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/dashboard/memories — List the user's memories
 *
 * Protected by: auth + rate limiter + server-side cache (15s TTL, 30s SWR).
 * Reads from Supabase. Content is NOT returned (AES-256-GCM encrypted in DB).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(authUser.uid, 'memories', CACHE_PROFILES.memories);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter || 60_000) / 1000)) } },
      );
    }

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const cacheKey = `memories:${authUser.uid}:${orgId || 'default'}`;
    const data = await cachedQuery(cacheKey, () => fetchMemories(authUser.uid, orgId, authUser.email), CACHE_PROFILES.memories);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Memories] Fatal:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const memoryId = typeof body.memoryId === 'string' ? body.memoryId.trim() : '';
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : '';
    if (!memoryId || !bucket) {
      return NextResponse.json({ error: 'memoryId and bucket are required' }, { status: 400 });
    }

    const user = await resolveSupabaseUser(authUser.uid);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await supaQuery(
      `UPDATE memories
       SET is_active = false, updated_at = NOW()
       WHERE user_id = $1 AND bucket = $2 AND is_active = true
         AND (pointer_id = $3 OR id::text = $3)
         AND metadata ? 'copied_from'
       RETURNING pointer_id`,
      [user.id, bucket, memoryId],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Only copied memories can be removed from a bucket' }, { status: 400 });
    }
    invalidateEndpoint(authUser.uid, 'memories');
    invalidateEndpoint(authUser.uid, 'stats');
    return NextResponse.json({ success: true, memoryId: result.rows[0].pointer_id });
  } catch (error: unknown) {
    console.error('[Dashboard Memories] Delete error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Failed to delete copied memory' }, { status: 500 });
  }
}

async function fetchMemories(userIdOrFirebaseUid: string, targetOrgId: string | null = null, email?: string) {
  const supaUser = await resolveSupabaseUser(userIdOrFirebaseUid, targetOrgId, email);
  if (!supaUser) return { memories: [] };

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

  let memories: any[] = [];

  try {
    const result = await supaQuery(
      `SELECT id, pointer_id, bucket, title, tags, token_count, original_tokens, metadata, status, source, decay_exempt, created_at, updated_at
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
      status: r.status || (r.metadata || {}).status || 'untriaged',
      source: r.source || (r.metadata || {}).source || 'agent',
      decayExempt: Boolean(r.decay_exempt ?? (r.metadata || {}).decay_exempt),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch {
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
    } catch { /* no memories */ }
  }

  return { memories };
}
