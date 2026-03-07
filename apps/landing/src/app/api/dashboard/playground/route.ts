import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * POST /api/dashboard/playground — Search memories with optional bucket filter
 *
 * Body: { query: string, bucket?: string, limit?: number }
 * Returns: { memories: [...with score], query, bucket }
 */

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

/** Simple text-overlap relevance score (0–1) */
function computeScore(query: string, title: string, tags: string[]): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return 0.5;

  const corpus = `${title} ${tags.join(' ')}`.toLowerCase();

  let hits = 0;
  for (const w of words) {
    if (corpus.includes(w)) hits++;
  }
  const wordScore = hits / words.length;

  // Exact substring match bonus
  const exactBonus = corpus.includes(q) ? 0.2 : 0;

  return Math.min(parseFloat((wordScore * 0.8 + exactBonus + 0.05).toFixed(2)), 1.0);
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(clerkId, 'playground', CACHE_PROFILES.memories);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 60_000) / 1000)) } },
      );
    }

    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : '';
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : null;
    const limit = Math.min(Math.max(parseInt(String(body.limit), 10) || 10, 1), 50);

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) return NextResponse.json({ memories: [] });

    const { id: uid, orgId } = supaUser;
    const { where: whereUser, params: userParams, nextIdx } = buildUserWhereClause(uid, orgId);

    const queryParams: (string | number)[] = [...userParams];
    let idx = nextIdx;

    let sql = `SELECT id, pointer_id, bucket, title, tags, token_count, metadata, created_at
               FROM memories
               WHERE (${whereUser}) AND is_active = true`;

    if (bucket) {
      sql += ` AND bucket = $${idx}`;
      queryParams.push(bucket);
      idx++;
    }

    const likePattern = `%${escapeLike(query)}%`;
    sql += ` AND (title ILIKE $${idx} OR array_to_string(tags, ' ') ILIKE $${idx})`;
    queryParams.push(likePattern);
    idx++;

    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    queryParams.push(limit);

    let memories: any[] = [];

    try {
      const result = await supaQuery(sql, queryParams);
      memories = result.rows.map((r: any) => {
        const tags = Array.isArray(r.tags) ? r.tags : [];
        return {
          id: r.pointer_id || String(r.id),
          bucket: r.bucket || 'unknown',
          title: r.title || '(untitled)',
          tags,
          tokenCount: parseInt(r.token_count || '0', 10),
          score: computeScore(query, r.title || '', tags),
          metadata: r.metadata || {},
          createdAt: r.created_at,
        };
      });
    } catch (e: any) {
      console.error('[Playground API] Full query failed, trying fallback:', e.message);
      try {
        let fbSql = `SELECT id, pointer_id, bucket, title, created_at
                     FROM memories
                     WHERE (${whereUser}) AND is_active = true`;
        const fbParams: (string | number)[] = [...userParams];
        let fbIdx = nextIdx;

        if (bucket) {
          fbSql += ` AND bucket = $${fbIdx}`;
          fbParams.push(bucket);
          fbIdx++;
        }

        fbSql += ` AND title ILIKE $${fbIdx}`;
        fbParams.push(likePattern);
        fbIdx++;

        fbSql += ` ORDER BY created_at DESC LIMIT $${fbIdx}`;
        fbParams.push(limit);

        const result = await supaQuery(fbSql, fbParams);
        memories = result.rows.map((r: any) => ({
          id: r.pointer_id || String(r.id),
          bucket: r.bucket || 'unknown',
          title: r.title || '(untitled)',
          tags: [],
          tokenCount: 0,
          score: computeScore(query, r.title || '', []),
          metadata: {},
          createdAt: r.created_at,
        }));
      } catch (e2: any) {
        console.error('[Playground API] Fallback query also failed:', e2.message);
      }
    }

    // Sort by score descending
    memories.sort((a: any, b: any) => b.score - a.score);

    console.log(`[Playground] bucket=${bucket || 'all'} results=${memories.length}`);
    return NextResponse.json({ memories, query, bucket });
  } catch (error: unknown) {
    console.error('[Playground API] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
