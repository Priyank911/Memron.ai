import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser } from '@/lib/supabase-read';
import { invalidateEndpoint } from '@/lib/api-cache';

/**
 * POST /api/dashboard/buckets/memories
 * Copies one owned memory into another owned bucket without exposing encrypted content.
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const memoryId = typeof body.memoryId === 'string' ? body.memoryId.trim() : '';
    const bucketSlug = typeof body.bucketSlug === 'string' ? body.bucketSlug.trim() : '';
    if (!memoryId || !bucketSlug) {
      return NextResponse.json({ error: 'memoryId and bucketSlug are required' }, { status: 400 });
    }

    const user = await resolveSupabaseUser(authUser.uid);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const bucketRes = await supaQuery(
      'SELECT bucket_id, slug, name FROM buckets WHERE user_id = $1 AND slug = $2 AND is_active = true LIMIT 1',
      [user.id, bucketSlug],
    );
    if (!bucketRes.rows[0]) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const memoryRes = await supaQuery(
      `SELECT id, pointer_id, title, content_encrypted, content_iv, content_tag,
              content_hash, tags, token_count, original_tokens, metadata, sub_path, importance
       FROM memories
       WHERE user_id = $1 AND is_active = true AND (pointer_id = $2 OR id::text = $2)
       LIMIT 1`,
      [user.id, memoryId],
    );
    const source = memoryRes.rows[0];
    if (!source) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });

    const duplicate = await supaQuery(
      `SELECT pointer_id FROM memories
       WHERE user_id = $1 AND bucket = $2 AND is_active = true
         AND metadata->>'copied_from' = $3
       LIMIT 1`,
      [user.id, bucketSlug, source.pointer_id || String(source.id)],
    );
    if (duplicate.rows[0]) {
      return NextResponse.json({ success: true, duplicate: true, memoryId: duplicate.rows[0].pointer_id });
    }

    const copied = await supaQuery(
      `INSERT INTO memories
        (pointer_id, user_id, org_id, bucket, title, content_encrypted, content_iv,
         content_tag, content_hash, tags, token_count, original_tokens, metadata,
         sub_path, importance)
       VALUES
        ('cp' || substring(md5(random()::text) from 1 for 10), $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, jsonb_set(COALESCE($12::jsonb, '{}'::jsonb),
         '{copied_from}', to_jsonb($13::text)), $14, $15)
       RETURNING pointer_id`,
      [
        user.id,
        user.orgId,
        bucketSlug,
        source.title,
        source.content_encrypted,
        source.content_iv,
        source.content_tag,
        source.content_hash,
        source.tags,
        source.token_count,
        source.original_tokens,
        JSON.stringify(source.metadata || {}),
        source.pointer_id || String(source.id),
        source.sub_path,
        source.importance,
      ],
    );

    invalidateEndpoint(authUser.uid, 'memories');
    invalidateEndpoint(authUser.uid, 'buckets');
    return NextResponse.json({ success: true, memoryId: copied.rows[0]?.pointer_id });
  } catch (error: unknown) {
    console.error('[Dashboard API] Memory copy error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Failed to copy memory' }, { status: 500 });
  }
}
