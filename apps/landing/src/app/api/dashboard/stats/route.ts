import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/dashboard/stats — Real-time dashboard statistics
 *
 * Protected by: auth + rate limiter + server-side cache (30s TTL, 60s SWR).
 * Reads from Supabase (MCP database). User-scoped via firebase_uid resolution.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await auth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const firebaseUid = user.uid;

    // Rate limit
    const rl = checkRateLimit(firebaseUid, 'stats', CACHE_PROFILES.stats);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter || 60_000) / 1000)) } },
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';
    const orgId = searchParams.get('orgId') || null;
    const requestedTimezone = searchParams.get('timezone') || 'UTC';
    const timezone = isValidTimezone(requestedTimezone) ? requestedTimezone : 'UTC';

    // Cache key scoped to user + time range + workspace
    const cacheKey = `stats:${firebaseUid}:${range}:${timezone}:${orgId || 'default'}`;

    const cacheProfile = range === 'today'
      ? { ...CACHE_PROFILES.stats, ttl: 5_000, swr: 5_000 }
      : CACHE_PROFILES.stats;
    const forceRefresh = searchParams.get('refresh') === '1';
    const payload = forceRefresh
      ? await fetchStats(firebaseUid, range, orgId, timezone)
      : await cachedQuery(cacheKey, () => fetchStats(firebaseUid, range, orgId, timezone), cacheProfile);
    return NextResponse.json(payload, forceRefresh ? { headers: { 'Cache-Control': 'no-store' } } : undefined);
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
  generatedAt: new Date().toISOString(),
  observedHours: 24,
};

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getCalendarDate(timezone: string, daysAgo: number): { date: Date; key: string } {
  const currentKey = formatDateInTimezone(new Date(), timezone);
  const date = new Date(`${currentKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return { date, key: date.toISOString().slice(0, 10) };
}

async function fetchStats(
  firebaseUid: string,
  range: string,
  targetOrgId: string | null = null,
  timezone = 'UTC',
) {
  const intervalMap: Record<string, string> = {
    today: '1 day', '7d': '7 days', '30d': '30 days', quarter: '90 days', year: '365 days',
  };
  const interval = intervalMap[range] || '30 days';

  const supaUser = await resolveSupabaseUser(firebaseUid, targetOrgId);
  if (!supaUser) return { ...EMPTY_STATS, range };

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params } = buildUserWhereClause(uid, orgId);
  const timezoneParam = `$${params.length + 1}`;
  const queryParams = [...params, timezone];
  const activityWindow = range === 'today'
    ? `(created_at >= (date_trunc('day', NOW() AT TIME ZONE ${timezoneParam}) AT TIME ZONE ${timezoneParam})
        AND created_at < ((date_trunc('day', NOW() AT TIME ZONE ${timezoneParam}) + INTERVAL '1 day') AT TIME ZONE ${timezoneParam}))`
    : `created_at > NOW() - INTERVAL '${interval}'`;

  // Run independent queries in parallel for speed
  const [memoriesRes, tokensRes, prevRes, bucketsRes, dailyRes, sessionsRes, hourlyRes, heatmapRes, tokenChartRes] =
    await Promise.allSettled([
      supaQuery(`SELECT COUNT(*) as total FROM memories WHERE (${whereUser}) AND is_active = true`, params),
      supaQuery(`SELECT COALESCE(SUM(token_count), 0) as total_tokens, COALESCE(SUM(original_tokens), 0) as original_tokens FROM memories WHERE (${whereUser}) AND is_active = true`, params),
      supaQuery(`SELECT COUNT(*) as total FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '${interval}' * 2 AND created_at <= NOW() - INTERVAL '${interval}'`, params),
      supaQuery(`SELECT bucket, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true GROUP BY bucket ORDER BY count DESC`, params),
      supaQuery(`SELECT DATE(created_at AT TIME ZONE ${timezoneParam}) as day, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND ${activityWindow} GROUP BY DATE(created_at AT TIME ZONE ${timezoneParam}) ORDER BY day ASC`, queryParams),
      supaQuery(`SELECT COUNT(DISTINCT client_id) as count FROM mcp_refresh_tokens WHERE user_id = $1 AND revoked = false AND expires_at > NOW()`, [uid]),
      supaQuery(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE ${timezoneParam})::int as hour, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND ${activityWindow} GROUP BY hour ORDER BY hour ASC`, queryParams),
      supaQuery(`SELECT DATE(created_at AT TIME ZONE ${timezoneParam}) as day, COUNT(*) as count FROM memories WHERE (${whereUser}) AND is_active = true AND created_at > NOW() - INTERVAL '150 days' GROUP BY DATE(created_at AT TIME ZONE ${timezoneParam}) ORDER BY day ASC`, queryParams),
      supaQuery(`SELECT DATE(created_at AT TIME ZONE ${timezoneParam}) as day, COALESCE(SUM(token_count), 0)::bigint as count FROM memories WHERE (${whereUser}) AND is_active = true AND ${activityWindow} GROUP BY DATE(created_at AT TIME ZONE ${timezoneParam}) ORDER BY day ASC`, queryParams),
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
    const { date, key: dayStr } = getCalendarDate(timezone, i);
    const label = days <= 7
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : days <= 30
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const match = dailyMemories.find(
      (r: any) => r.day?.toISOString?.().split('T')[0] === dayStr || String(r.day).startsWith(dayStr),
    );
    dailyChart.push({ label, date: dayStr, value: match ? parseInt(match.count, 10) : 0 });
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

  // Peak four-hour window, based on contiguous observed local hours.
  let peakHour = '-';
  const localHourPart = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date()).find(part => part.type === 'hour')?.value;
  const observedHours = range === 'today'
    ? Math.min(24, Math.max(1, Number(localHourPart || 0) + 1))
    : 24;
  if (hourlyChart.some(h => h.value > 0)) {
    const windowSize = 4;
    let bestStart = 0;
    let bestTotal = -1;
    const lastStart = Math.max(0, observedHours - windowSize);
    for (let start = 0; start <= lastStart; start++) {
      const total = hourlyChart.slice(start, Math.min(start + windowSize, observedHours))
        .reduce((sum, point) => sum + point.value, 0);
      if (total > bestTotal) {
        bestTotal = total;
        bestStart = start;
      }
    }
    const end = Math.min(bestStart + windowSize, observedHours);
    peakHour = `${String(bestStart).padStart(2, '0')}:00 - ${String(end).padStart(2, '0')}:00`;
  }

  // Heatmap
  let heatmapData: { month: string; weeks: { date: string | null; value: number }[][] }[] = [];
  if (heatmapRes.status === 'fulfilled') {
    const dayMap = new Map<string, number>();
    for (const r of heatmapRes.value.rows) {
      const key = r.day?.toISOString?.().split('T')[0] || String(r.day).slice(0, 10);
      dayMap.set(key, parseInt(r.count, 10));
    }
    const currentDateKey = formatDateInTimezone(new Date(), timezone);
    const now = new Date(`${currentDateKey}T00:00:00Z`);
    for (let m = 4; m >= 0; m--) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
      const leadingDays = monthStart.getUTCDay();
      const daysInMonth = monthEnd.getUTCDate();
      const weekCount = Math.ceil((leadingDays + daysInMonth) / 7);
      const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      const weeks: { date: string | null; value: number }[][] = [];
      for (let w = 0; w < weekCount; w++) {
        const week: { date: string | null; value: number }[] = [];
        for (let d = 0; d < 7; d++) {
          const dayIndex = w * 7 + d - leadingDays + 1;
          if (dayIndex < 1 || dayIndex > daysInMonth) {
            week.push({ date: null, value: -1 });
          } else {
            const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), dayIndex));
            const dateKey = date.toISOString().split('T')[0];
            week.push({
              date: dateKey,
              value: dateKey > currentDateKey ? -1 : (dayMap.get(dateKey) || 0),
            });
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
    const { date, key: dayStr } = getCalendarDate(timezone, i);
    const label = days <= 7
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : days <= 30
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const match = tokenDailyRows.find(
      (r: any) => r.day?.toISOString?.().split('T')[0] === dayStr || String(r.day).startsWith(dayStr),
    );
    mcpFetchChart.push({ label, date: dayStr, value: match ? parseInt(match.count, 10) : 0 });
  }

  return {
    totalMemories, totalTokens, originalTokens, activeSessions,
    buckets, sparkMemories, dailyChart, hourlyChart, heatmapData,
    peakHour, memoryDelta, previousMemories, range, mcpFetchChart,
    generatedAt: new Date().toISOString(), observedHours,
  };
}
