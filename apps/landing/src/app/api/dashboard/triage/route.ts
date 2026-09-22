import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { invalidateUser } from '@/lib/api-cache';

/**
 * POST /api/dashboard/triage — Execute triage actions on a memory item
 *
 * Supported actions:
 * - move_to_context   → Sets status = 'context', decay_exempt = false
 * - move_to_knowledge → Sets status = 'knowledge', decay_exempt = true
 * - pin / unpin       → Toggles pinned status in metadata / pinned_facts
 * - discard           → Soft-deletes memory (is_active = false)
 * - edit              → Updates title, tags, or metadata
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { pointerId, action, data } = body;

    if (!pointerId || !action) {
      return NextResponse.json({ error: 'pointerId and action are required' }, { status: 400 });
    }

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const supaUser = await resolveSupabaseUser(authUser.uid, orgId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id: uid, orgId: userOrgId } = supaUser;
    // Each SQL statement has a different pointer placeholder. Build the
    // scoped user predicate with the correct starting parameter index so the
    // pointer and user_id can never collide.
    const scoped = (pointerIndex: number) => buildUserWhereClause(uid, userOrgId, pointerIndex + 1);

    // Fetch existing memory to merge metadata
    const existingScope = scoped(1);
    const existing = await supaQuery(
      `SELECT id, pointer_id, metadata, title, tags FROM memories WHERE pointer_id = $1 AND (${existingScope.where}) AND is_active = true LIMIT 1`,
      [pointerId, ...existingScope.params]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    const row = existing.rows[0];
    const currentMeta = (row.metadata || {}) as Record<string, unknown>;

    const updateScoped = async (sql: string, values: unknown[], fallbackSql?: string, fallbackValues?: unknown[]) => {
      try {
        await supaQuery(sql, values);
      } catch (error: any) {
        // Existing installations may not have run the lifecycle migration yet.
        // Preserve a working triage flow by falling back to metadata-only writes;
        // the migration will make the first-class columns available later.
        if (error?.code !== '42703' || !fallbackSql) throw error;
        await supaQuery(fallbackSql, fallbackValues ?? values);
      }
    };

    switch (action) {
      case 'move_to_context': {
        const updatedMeta = {
          ...currentMeta,
          status: 'context',
          decay_exempt: false,
          triaged_at: new Date().toISOString(),
        };
        const scope = scoped(2);
        await updateScoped(
          `UPDATE memories SET metadata = $1, status = 'context', decay_exempt = false, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params],
          `UPDATE memories SET metadata = $1, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params]
        );
        break;
      }

      case 'move_to_knowledge': {
        const updatedMeta = {
          ...currentMeta,
          status: 'knowledge',
          decay_exempt: true,
          triaged_at: new Date().toISOString(),
        };
        const scope = scoped(2);
        await updateScoped(
          `UPDATE memories SET metadata = $1, status = 'knowledge', decay_exempt = true, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params],
          `UPDATE memories SET metadata = $1, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params]
        );
        break;
      }

      case 'pin': {
        const updatedMeta = {
          ...currentMeta,
          is_pinned: true,
          pinned_at: new Date().toISOString(),
        };
        const scope = scoped(2);
        await supaQuery(
          `UPDATE memories SET metadata = $1, importance = 1.0, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params]
        );
        break;
      }

      case 'unpin': {
        const updatedMeta = {
          ...currentMeta,
          is_pinned: false,
        };
        const scope = scoped(2);
        await supaQuery(
          `UPDATE memories SET metadata = $1, importance = 0.5, updated_at = NOW() WHERE pointer_id = $2 AND (${scope.where})`,
          [JSON.stringify(updatedMeta), pointerId, ...scope.params]
        );
        break;
      }

      case 'discard': {
        const scope = scoped(1);
        await supaQuery(
          `UPDATE memories SET is_active = false, updated_at = NOW() WHERE pointer_id = $1 AND (${scope.where})`,
          [pointerId, ...scope.params]
        );
        break;
      }

      case 'edit': {
        const newTitle = data?.title || row.title;
        const newTags = data?.tags || row.tags;
        const updatedMeta = {
          ...currentMeta,
          ...(data?.metadata || {}),
        };
        const scope = scoped(4);
        await supaQuery(
          `UPDATE memories SET title = $1, tags = $2, metadata = $3, updated_at = NOW() WHERE pointer_id = $4 AND (${scope.where})`,
          [newTitle, newTags, JSON.stringify(updatedMeta), pointerId, ...scope.params]
        );
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    // Invalidate dashboard memories cache
    invalidateUser(authUser.uid);

    return NextResponse.json({ success: true, pointerId, action });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Triage] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
