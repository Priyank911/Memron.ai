import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';

/**
 * GET /api/dashboard/stats — Real-time dashboard statistics
 *
 * IMPORTANT: Reads from **Supabase** (where the MCP server writes memories),
 * NOT from Aiven (the landing app's primary DB). User IDs differ between
 * the two databases, so we resolve the Clerk ID → Supabase user_id first.
 *
 * Security: All queries are scoped to the authenticated user's Supabase ID.
 * Each metric is fetched independently so a single failing query
 * doesn't take down the entire endpoint.
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Resolve user in Supabase (MCP database) — NOT Aiven
    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) {
      return NextResponse.json({
        totalMemories: 0, totalTokens: 0, originalTokens: 0,
        activeSessions: 0, buckets: [], sparkMemories: [], dailyChart: [],
      });
    }

    const { id: uid, orgId } = supaUser;
    const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

    console.log(`[Dashboard Stats] supaUid=${uid}, orgId=${orgId}, clerk=${clerkId}`);

    // ── Total memories ────────────────────────────────────────
    let totalMemories = 0;
    try {
      const res = await supaQuery(
        `SELECT COUNT(*) as total FROM memories WHERE (${whereUser}) AND is_active = true`,
        params,
      );
      totalMemories = parseInt(res.rows[0]?.total || '0', 10);
    } catch (e: any) {
      console.error('[Dashboard Stats] memories count error:', e.message);
    }

    // ── Total tokens ──────────────────────────────────────────
    let totalTokens = 0;
    let originalTokens = 0;
    try {
      const res = await supaQuery(
        `SELECT COALESCE(SUM(token_count), 0) as total_tokens,
                COALESCE(SUM(original_tokens), 0) as original_tokens
         FROM memories WHERE (${whereUser}) AND is_active = true`,
        params,
      );
      totalTokens = parseInt(res.rows[0]?.total_tokens || '0', 10);
      originalTokens = parseInt(res.rows[0]?.original_tokens || '0', 10);
    } catch (e: any) {
      console.error('[Dashboard Stats] tokens error:', e.message);
    }

    // ── Bucket breakdown ──────────────────────────────────────
    let buckets: { name: string; count: number }[] = [];
    try {
      const res = await supaQuery(
        `SELECT bucket, COUNT(*) as count FROM memories
         WHERE (${whereUser}) AND is_active = true
         GROUP BY bucket ORDER BY count DESC`,
        params,
      );
      buckets = res.rows.map((r: any) => ({ name: r.bucket || 'default', count: parseInt(r.count, 10) }));
    } catch (e: any) {
      console.error('[Dashboard Stats] bucket error:', e.message);
    }

    // ── Daily activity (last 30 days) ─────────────────────────
    let dailyMemories: any[] = [];
    try {
      const res = await supaQuery(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM memories
         WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        params,
      );
      dailyMemories = res.rows;
    } catch (e: any) {
      console.error('[Dashboard Stats] daily activity error:', e.message);
    }

    // ── Active MCP sessions ───────────────────────────────────
    let activeSessions = 0;
    try {
      const res = await supaQuery(
        `SELECT COUNT(DISTINCT client_id) as count
         FROM mcp_refresh_tokens
         WHERE user_id = $1 AND revoked = false AND expires_at > NOW()`,
        [uid],
      );
      activeSessions = parseInt(res.rows[0]?.count || '0', 10);
    } catch {
      /* table may not exist */
    }

    // ── Sparkline (last 10 data-points) ───────────────────────
    const sparkMemories = dailyMemories.slice(-10).map((r: any) => parseInt(r.count, 10));

    // ── 7-day bar chart ───────────────────────────────────────
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', { weekday: 'short' });
      const match = dailyMemories.find(
        (r: any) =>
          r.day?.toISOString?.().split('T')[0] === dayStr ||
          String(r.day).startsWith(dayStr),
      );
      last7.push({ label, value: match ? parseInt(match.count, 10) : 0 });
    }

    const payload = {
      totalMemories,
      totalTokens,
      originalTokens,
      activeSessions,
      buckets,
      sparkMemories,
      dailyChart: last7,
    };

    console.log('[Dashboard Stats] Result:', JSON.stringify(payload));
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[Dashboard Stats] Fatal error:', error.message, error.stack);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
