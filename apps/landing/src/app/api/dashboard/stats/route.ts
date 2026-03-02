import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

/**
 * GET /api/dashboard/stats — Real-time dashboard statistics
 *
 * Each metric is fetched independently so a single failing query
 * doesn't take down the entire endpoint.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const uid = dbUser.id;
    console.log(`[Dashboard Stats] Fetching for user id=${uid} (clerk=${userId})`);

    // ── Total memories ────────────────────────────────────────
    let totalMemories = 0;
    try {
      // Try with is_active first, fall back to without
      let res = await query(
        `SELECT COUNT(*) as total FROM memories WHERE user_id = $1 AND is_active = true`,
        [uid],
      );
      totalMemories = parseInt(res.rows[0]?.total || '0', 10);

      // If 0, try without is_active filter (maybe column missing)
      if (totalMemories === 0) {
        res = await query(
          `SELECT COUNT(*) as total FROM memories WHERE user_id = $1`,
          [uid],
        );
        totalMemories = parseInt(res.rows[0]?.total || '0', 10);
      }
    } catch (e: any) {
      console.error('[Dashboard Stats] memories count error:', e.message);
    }

    // ── Total tokens ──────────────────────────────────────────
    let totalTokens = 0;
    let originalTokens = 0;
    try {
      const res = await query(
        `SELECT COALESCE(SUM(token_count), 0) as total_tokens,
                COALESCE(SUM(original_tokens), 0) as original_tokens
         FROM memories WHERE user_id = $1`,
        [uid],
      );
      totalTokens = parseInt(res.rows[0]?.total_tokens || '0', 10);
      originalTokens = parseInt(res.rows[0]?.original_tokens || '0', 10);
    } catch (e: any) {
      console.error('[Dashboard Stats] tokens error:', e.message);
    }

    // ── Bucket breakdown ──────────────────────────────────────
    let buckets: { name: string; count: number }[] = [];
    try {
      const res = await query(
        `SELECT bucket, COUNT(*) as count FROM memories WHERE user_id = $1 GROUP BY bucket ORDER BY count DESC`,
        [uid],
      );
      buckets = res.rows.map((r: any) => ({ name: r.bucket, count: parseInt(r.count, 10) }));
    } catch (e: any) {
      console.error('[Dashboard Stats] bucket error:', e.message);
    }

    // ── Daily activity (last 30 days) ─────────────────────────
    let dailyMemories: any[] = [];
    try {
      const res = await query(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM memories
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        [uid],
      );
      dailyMemories = res.rows;
    } catch (e: any) {
      console.error('[Dashboard Stats] daily activity error:', e.message);
    }

    // ── Active MCP sessions ───────────────────────────────────
    let activeSessions = 0;
    try {
      const res = await query(
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
