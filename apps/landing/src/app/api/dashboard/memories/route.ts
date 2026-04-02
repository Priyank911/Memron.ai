import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';

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
    const data = await cachedQuery(cacheKey, () => fetchMemories(authUser.uid, orgId), CACHE_PROFILES.memories);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Memories] Fatal:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchMemories(userIdOrFirebaseUid: string, targetOrgId: string | null = null) {
  const supaUser = await resolveSupabaseUser(userIdOrFirebaseUid, targetOrgId);
  if (!supaUser) return { memories: [] };

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

  let memories: any[] = [];

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
