import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import {
  getUserFromPostgres,
  getOrganizationByUserId,
  createBucket,
  deleteBucket,
  query as pgQuery,
} from '@/lib/postgres';
import { syncBucketToSupabase } from '@/lib/supabase-sync';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause, isSupabaseConfigured } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, invalidateEndpoint, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/dashboard/buckets — List all buckets for the current user
 * Protected by: auth + rate limiter + server-side cache (30s TTL).
 * Reads from Supabase (primary), falls back to primary PG if Supabase is unavailable.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(authUser.uid, 'buckets', CACHE_PROFILES.buckets);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 60_000) / 1000)) } },
      );
    }

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const cacheKey = `buckets:${authUser.uid}:${orgId || 'default'}`;
    const data = await cachedQuery(cacheKey, () => fetchBuckets(authUser.uid, orgId), CACHE_PROFILES.buckets);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Dashboard API] Buckets error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Primary bucket fetcher — tries Supabase first, falls back to primary PG.
 */
async function fetchBuckets(userIdOrFirebaseUid: string, targetOrgId: string | null = null) {
  // Try Supabase first (canonical source for MCP-written data)
  if (isSupabaseConfigured()) {
    try {
      const result = await fetchBucketsFromSupabase(userIdOrFirebaseUid, targetOrgId);
      if (result) return result;
    } catch (err: any) {
      console.warn('[Buckets] Supabase read failed, trying primary PG:', err.message);
    }
  }

  // Fallback: read from primary PG (buckets table exists there too)
  return fetchBucketsFromPrimaryPG(userIdOrFirebaseUid);
}

async function fetchBucketsFromSupabase(userIdOrFirebaseUid: string, targetOrgId: string | null) {
  const supaUser = await resolveSupabaseUser(userIdOrFirebaseUid, targetOrgId);
  if (!supaUser) return null; // User not synced to Supabase yet

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

  let buckets: any[] = [];
  try {
    const res = await supaQuery(
      `SELECT b.bucket_id, b.name, b.slug, b.description, b.is_default, b.created_at,
              COALESCE(m.cnt, 0) as memory_count
       FROM buckets b
       LEFT JOIN (
         SELECT bucket, COUNT(*) as cnt FROM memories
         WHERE (${whereUser}) AND is_active = true
         GROUP BY bucket
       ) m ON m.bucket = b.slug
       WHERE b.user_id = $${params.length + 1} AND b.is_active = true
       ORDER BY b.is_default DESC, b.created_at ASC`,
      [...params, uid],
    );
    buckets = res.rows;
  } catch {
    // Fallback: aggregate from memories table directly
    try {
      const res = await supaQuery(
        `SELECT bucket as slug, bucket as name, COUNT(*) as memory_count
         FROM memories
         WHERE (${whereUser}) AND is_active = true
         GROUP BY bucket
         ORDER BY memory_count DESC`,
        params,
      );
      buckets = res.rows.map((r: any) => ({
        bucket_id: r.slug,
        name: r.name,
        slug: r.slug,
        description: null,
        is_default: r.slug === 'main',
        memory_count: parseInt(r.memory_count, 10),
        created_at: new Date().toISOString(),
      }));
    } catch { /* no data */ }
  }

  if (buckets.length === 0) return null; // Signal: try fallback

  return {
    buckets: buckets.map((b: any) => ({
      id: b.bucket_id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      isDefault: b.is_default,
      memoryCount: parseInt(b.memory_count) || 0,
      createdAt: b.created_at,
    })),
  };
}

/**
 * Fallback: read buckets from primary Aiven PG.
 * This handles the case where Supabase is down or user hasn't been synced.
 */
async function fetchBucketsFromPrimaryPG(userIdOrFirebaseUid: string) {
  try {
    const dbUser = await getUserFromPostgres(userIdOrFirebaseUid);
    if (!dbUser) return { buckets: [] };

    const org = await getOrganizationByUserId(dbUser.id);

    let whereClause = 'b.user_id = $1 AND b.is_active = true';
    const params: (number)[] = [dbUser.id];

    if (org) {
      whereClause = 'b.user_id = $1 AND b.is_active = true AND (b.org_id = $2 OR b.org_id IS NULL)';
      params.push(org.id);
    }

    const res = await pgQuery(
      `SELECT b.bucket_id, b.name, b.slug, b.description, b.is_default, b.created_at,
              COALESCE(m.cnt, 0) as memory_count
       FROM buckets b
       LEFT JOIN (
         SELECT bucket, COUNT(*) as cnt FROM memories
         WHERE user_id = $1 AND is_active = true
         GROUP BY bucket
       ) m ON m.bucket = b.slug
       WHERE ${whereClause}
       ORDER BY b.is_default DESC, b.created_at ASC`,
      params,
    );

    return {
      buckets: (res.rows || []).map((b: any) => ({
        id: b.bucket_id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        isDefault: b.is_default,
        memoryCount: parseInt(b.memory_count) || 0,
        createdAt: b.created_at,
      })),
    };
  } catch (err: any) {
    console.error('[Buckets] Primary PG fallback also failed:', err.message);
    return { buckets: [] };
  }
}

/**
 * POST /api/dashboard/buckets — Create a new bucket
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(authUser.uid);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const org = await getOrganizationByUserId(dbUser.id);

    const body = await request.json().catch(() => ({}));
    const name = body.name?.trim();

    if (!name || name.length < 1 || name.length > 100) {
      return NextResponse.json(
        { error: 'Bucket name is required (1–100 characters)' },
        { status: 400 },
      );
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);

    if (!slug) {
      return NextResponse.json(
        { error: 'Invalid bucket name — must contain at least one alphanumeric character' },
        { status: 400 },
      );
    }

    const result = await createBucket({
      userId: dbUser.id,
      orgId: org?.id ?? null,
      name,
      slug,
      description: body.description?.trim() || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create bucket' },
        { status: 400 },
      );
    }

    // Mirror to Supabase
    syncBucketToSupabase({
      bucketId: result.bucket!.bucket_id,
      ownerFirebaseUid: authUser.uid,
      name,
      slug,
      description: body.description?.trim() || null,
      isDefault: false,
    }).catch((e: any) => console.warn('[Dashboard API] Supabase bucket sync (non-fatal):', e.message));

    // Invalidate cache so next GET returns fresh data
    invalidateEndpoint(authUser.uid, 'buckets');

    return NextResponse.json({
      success: true,
      bucket: {
        id: result.bucket!.bucket_id,
        name: result.bucket!.name,
        slug: result.bucket!.slug,
        description: result.bucket!.description,
        isDefault: result.bucket!.is_default,
        memoryCount: 0,
        createdAt: result.bucket!.created_at,
      },
    });
  } catch (error: any) {
    console.error('[Dashboard API] Bucket create error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/buckets — Delete (soft) a bucket
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(authUser.uid);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const bucketId = body.bucketId;

    if (!bucketId) {
      return NextResponse.json({ error: 'Missing bucketId' }, { status: 400 });
    }

    const success = await deleteBucket(bucketId, dbUser.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Bucket not found, already deleted, or is the default bucket' },
        { status: 404 },
      );
    }

    invalidateEndpoint(authUser.uid, 'buckets');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Dashboard API] Bucket delete error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
