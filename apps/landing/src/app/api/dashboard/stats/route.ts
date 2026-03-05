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
export async function GET(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse time range from query
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';
    const intervalMap: Record<string, string> = {
      today: '1 day',
      '7d': '7 days',
      '30d': '30 days',
      quarter: '90 days',
      year: '365 days',
    };
    const interval = intervalMap[range] || '30 days';

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

    // ── Previous period memory count (for delta %) ────────────
    let previousMemories = 0;
    try {
      const res = await supaQuery(
        `SELECT COUNT(*) as total FROM memories
         WHERE (${whereUser}) AND is_active = true
         AND created_at > NOW() - INTERVAL '${interval}' * 2
         AND created_at <= NOW() - INTERVAL '${interval}'`,
        params,
      );
      previousMemories = parseInt(res.rows[0]?.total || '0', 10);
    } catch (e: any) {
      console.error('[Dashboard Stats] previous period error:', e.message);
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
         WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}'
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

    // ── Daily chart — match the selected time range ───────────
    const rangeDays: Record<string, number> = {
      today: 1, '7d': 7, '30d': 30, quarter: 90, year: 365,
    };
    const days = rangeDays[range] || 30;
    const dailyChart = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toISOString().split('T')[0];
      const label = days <= 7
        ? date.toLocaleDateString('en-US', { weekday: 'short' })
        : days <= 30
          ? `${date.getMonth() + 1}/${date.getDate()}`
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const match = dailyMemories.find(
        (r: any) =>
          r.day?.toISOString?.().split('T')[0] === dayStr ||
          String(r.day).startsWith(dayStr),
      );
      dailyChart.push({ label, value: match ? parseInt(match.count, 10) : 0 });
    }

    // ── Hourly activity (for area chart) ──────────────────────
    let hourlyChart: { label: string; value: number }[] = [];
    try {
      const res = await supaQuery(
        `SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as count
         FROM memories
         WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}'
         GROUP BY hour ORDER BY hour ASC`,
        params,
      );
      const hourMap = new Map<number, number>();
      for (const r of res.rows) {
        hourMap.set(parseInt(r.hour, 10), parseInt(r.count, 10));
      }
      for (let h = 0; h < 24; h++) {
        hourlyChart.push({
          label: `${String(h).padStart(2, '0')}:00`,
          value: hourMap.get(h) || 0,
        });
      }
    } catch (e: any) {
      console.error('[Dashboard Stats] hourly activity error:', e.message);
      hourlyChart = Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, '0')}:00`,
        value: 0,
      }));
    }

    // ── Peak activity hour ────────────────────────────────────
    let peakHour = '—';
    if (hourlyChart.length > 0) {
      const maxVal = Math.max(...hourlyChart.map(h => h.value));
      if (maxVal > 0) {
        const peakIdx = hourlyChart.findIndex(h => h.value === maxVal);
        const endIdx = Math.min(peakIdx + 4, 23);
        peakHour = `${String(peakIdx).padStart(2, '0')}:00 - ${String(endIdx).padStart(2, '0')}:00`;
      }
    }

    // ── Heatmap data (last ~5 months of weekly data) ──────────
    let heatmapData: { month: string; weeks: number[][] }[] = [];
    try {
      const res = await supaQuery(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM memories
         WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '150 days'
         GROUP BY DATE(created_at) ORDER BY day ASC`,
        params,
      );
      const dayMap = new Map<string, number>();
      for (const r of res.rows) {
        const key = r.day?.toISOString?.().split('T')[0] || String(r.day).slice(0, 10);
        dayMap.set(key, parseInt(r.count, 10));
      }

      // Group into months with 5 weeks of 7 days
      const months: string[] = [];
      const now = new Date();
      for (let m = 4; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        months.push(d.toLocaleDateString('en-US', { month: 'short' }));
      }

      // Build grid: 5 months × 5 weeks × 7 days
      for (let m = 4; m >= 0; m--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short' });
        const weeks: number[][] = [];
        for (let w = 0; w < 5; w++) {
          const week: number[] = [];
          for (let d = 0; d < 7; d++) {
            const date = new Date(monthStart);
            date.setDate(monthStart.getDate() + w * 7 + d);
            if (date.getMonth() !== monthStart.getMonth() && w > 0) {
              week.push(-1); // out of month
            } else {
              const key = date.toISOString().split('T')[0];
              week.push(dayMap.get(key) || 0);
            }
          }
          weeks.push(week);
        }
        heatmapData.push({ month: monthLabel, weeks });
      }
    } catch (e: any) {
      console.error('[Dashboard Stats] heatmap error:', e.message);
    }

    // Delta percentage
    const memoryDelta = previousMemories > 0
      ? ((totalMemories - previousMemories) / previousMemories * 100).toFixed(1)
      : totalMemories > 0 ? '100' : '0';

    const payload = {
      totalMemories,
      totalTokens,
      originalTokens,
      activeSessions,
      buckets,
      sparkMemories,
      dailyChart,
      hourlyChart,
      heatmapData,
      peakHour,
      memoryDelta: parseFloat(memoryDelta as string),
      previousMemories,
      range,
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
