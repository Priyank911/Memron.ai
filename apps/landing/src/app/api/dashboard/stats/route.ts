import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/dashboard/stats — Real-time dashboard statistics
 *
 * Protected by: auth + rate limiter + server-side cache (30s TTL, 60s SWR).
 * Reads from Supabase (MCP database). User-scoped via clerk_id resolution.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit
    const rl = checkRateLimit(clerkId, 'stats', CACHE_PROFILES.stats);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter || 60_000) / 1000)) } },
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';
    const orgId = searchParams.get('orgId') || null;

    // Cache key scoped to user + time range + workspace
    const cacheKey = `stats:${clerkId}:${range}:${orgId || 'default'}`;

    const payload = await cachedQuery(cacheKey, () => fetchStats(clerkId, range, orgId), CACHE_PROFILES.stats);
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Stats] Fatal:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const EMPTY_STATS = {
  totalMemories: 0, totalTokens: 0, originalTokens: 0,
  activeSessions: 0, buckets: [], sparkMemories: [], dailyChart: [],
  hourlyChart: [], heatmapData: [], peakHour: '-',
  memoryDelta: 0, previousMemories: 0, range: '30d', mcpFetchChart: [],
};

async function fetchStats(clerkId: string, range: string, targetOrgId: string | null = null) {
  const intervalMap: Record<string, string> = {
    today: '1 day', '7d': '7 days', '30d': '30 days', quarter: '90 days', year: '365 days',
  };
  const interval = intervalMap[range] || '30 days';

  const supaUser = await resolveSupabaseUser(clerkId, targetOrgId);
  if (!supaUser) return { ...EMPTY_STATS, range };

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params } = buildUserWhereClause(uid, orgId);

  // Run independent queries in parallel for speed
  const [memoriesRes, tokensRes, prevRes, bucketsRes, dailyRes, sessionsRes, hourlyRes, heatmapRes, tokenChartRes] =
    await Promise.allSettled([
      supaQuery(`SELECT COUNT(*) as total FROM memories WHERE (${whereUser}) AND is_active = true`, params),
      supaQuery(`SELECT COALESCE(SUM(token_count), 0) as total_tokens, COALESCE(SUM(original_tokens), 0) as original_tokens FROM memories WHERE (${whereUser}) AND is_active = true`, params),
      supaQuery(`SELECT COUNT(*) as total FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}' * 2 AND created_at <= NOW() - INTERVAL '${interval}'`, params),
      supaQuery(`SELECT bucket, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true GROUP BY bucket ORDER BY count DESC`, params),
      supaQuery(`SELECT DATE(created_at) as day, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}' GROUP BY DATE(created_at) ORDER BY day ASC`, params),
      supaQuery(`SELECT COUNT(DISTINCT client_id) as count FROM mcp_refresh_tokens WHERE user_id = $1 AND revoked = false AND expires_at > NOW()`, [uid]),
      supaQuery(`SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}' GROUP BY hour ORDER BY hour ASC`, params),
      supaQuery(`SELECT DATE(created_at) as day, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '150 days' GROUP BY DATE(created_at) ORDER BY day ASC`, params),
      supaQuery(`SELECT DATE(created_at) as day, COALESCE(SUM(token_count), 0)::bigint as count FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}' GROUP BY DATE(created_at) ORDER BY day ASC`, params),
    ]);

  // Extract results safely
  const totalMemories = memoriesRes.status === 'fulfilled' ? parseInt(memoriesRes.value.rows[0]?.total || '0', 10) : 0;
  const totalTokens = tokensRes.status === 'fulfilled' ? parseInt(tokensRes.value.rows[0]?.total_tokens || '0', 10) : 0;
  const originalTokens = tokensRes.status === 'fulfilled' ? parseInt(tokensRes.value.rows[0]?.original_tokens || '0', 10) : 0;
  const previousMemories = prevRes.status === 'fulfilled' ? parseInt(prevRes.value.rows[0]?.total || '0', 10) : 0;

  const buckets = bucketsRes.status === 'fulfilled'
    ? bucketsRes.value.rows.map((r: any) => ({ name: r.bucket || 'default', count: parseInt(r.count, 10) }))
    : [];

  const dailyMemories = dailyRes.status === 'fulfilled' ? dailyRes.value.rows : [];
  const activeSessions = sessionsRes.status === 'fulfilled' ? parseInt(sessionsRes.value.rows[0]?.count || '0', 10) : 0;

  // Sparkline
  const sparkMemories = dailyMemories.slice(-10).map((r: any) => parseInt(r.count, 10));

  // Daily chart
  const rangeDays: Record<string, number> = { today: 1, '7d': 7, '30d': 30, quarter: 90, year: 365 };
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
      (r: any) => r.day?.toISOString?.().split('T')[0] === dayStr || String(r.day).startsWith(dayStr),
    );
    dailyChart.push({ label, value: match ? parseInt(match.count, 10) : 0 });
  }

  // Hourly chart
  let hourlyChart: { label: string; value: number }[] = [];
  if (hourlyRes.status === 'fulfilled') {
    const hourMap = new Map<number, number>();
    for (const r of hourlyRes.value.rows) {
      hourMap.set(parseInt(r.hour, 10), parseInt(r.count, 10));
    }
    for (let h = 0; h < 24; h++) {
      hourlyChart.push({ label: `${String(h).padStart(2, '0')}:00`, value: hourMap.get(h) || 0 });
    }
  } else {
    hourlyChart = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
  }

  // Peak hour
  let peakHour = '-';
  const maxVal = Math.max(...hourlyChart.map(h => h.value));
  if (maxVal > 0) {
    const peakIdx = hourlyChart.findIndex(h => h.value === maxVal);
    peakHour = `${String(peakIdx).padStart(2, '0')}:00 - ${String(Math.min(peakIdx + 4, 23)).padStart(2, '0')}:00`;
  }

  // Heatmap
  let heatmapData: { month: string; weeks: number[][] }[] = [];
  if (heatmapRes.status === 'fulfilled') {
    const dayMap = new Map<string, number>();
    for (const r of heatmapRes.value.rows) {
      const key = r.day?.toISOString?.().split('T')[0] || String(r.day).slice(0, 10);
      dayMap.set(key, parseInt(r.count, 10));
    }
    const now = new Date();
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
            week.push(-1);
          } else {
            week.push(dayMap.get(date.toISOString().split('T')[0]) || 0);
          }
        }
        weeks.push(week);
      }
      heatmapData.push({ month: monthLabel, weeks });
    }
  }

  const memoryDelta = previousMemories > 0
    ? parseFloat(((totalMemories - previousMemories) / previousMemories * 100).toFixed(1))
    : totalMemories > 0 ? 100 : 0;

  // MCP Fetch chart — daily token sums as proxy for fetch/read query volume
  const tokenDailyRows = tokenChartRes.status === 'fulfilled' ? tokenChartRes.value.rows : [];
  const mcpFetchChart = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStr = date.toISOString().split('T')[0];
    const label = days <= 7
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : days <= 30
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const match = tokenDailyRows.find(
      (r: any) => r.day?.toISOString?.().split('T')[0] === dayStr || String(r.day).startsWith(dayStr),
    );
    mcpFetchChart.push({ label, value: match ? parseInt(match.count, 10) : 0 });
  }

  return {
    totalMemories, totalTokens, originalTokens, activeSessions,
    buckets, sparkMemories, dailyChart, hourlyChart, heatmapData,
    peakHour, memoryDelta, previousMemories, range, mcpFetchChart,
  };
}
