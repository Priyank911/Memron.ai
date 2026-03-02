import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Parallel queries for dashboard stats
    const [memoriesRes, tokensRes, bucketsRes, recentRes] = await Promise.all([
      // Total memories
      query(
        `SELECT COUNT(*) as total FROM memories WHERE user_id = $1 AND is_active = true`,
        [dbUser.id],
      ),
      // Total tokens stored
      query(
        `SELECT COALESCE(SUM(token_count), 0) as total_tokens, COALESCE(SUM(original_tokens), 0) as original_tokens FROM memories WHERE user_id = $1 AND is_active = true`,
        [dbUser.id],
      ),
      // Bucket breakdown
      query(
        `SELECT bucket, COUNT(*) as count FROM memories WHERE user_id = $1 AND is_active = true GROUP BY bucket ORDER BY count DESC`,
        [dbUser.id],
      ),
      // Recent memory activity (last 30 days)
      query(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM memories
         WHERE user_id = $1 AND is_active = true AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        [dbUser.id],
      ),
    ]);

    // Active MCP sessions (connected clients via OAuth)
    let activeSessions = 0;
    try {
      const sessionsRes = await query(
        `SELECT COUNT(DISTINCT client_id) as count FROM mcp_refresh_tokens WHERE user_id = $1 AND revoked = false AND expires_at > NOW()`,
        [dbUser.id],
      );
      activeSessions = parseInt(sessionsRes.rows[0]?.count || '0', 10);
    } catch { /* table may not exist yet */ }

    // Token usage sparkline (last 10 data points from last 30 days)
    const dailyMemories = recentRes.rows;
    const sparkMemories = dailyMemories.slice(-10).map((r: any) => parseInt(r.count, 10));

    // 7-day bar chart
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', { weekday: 'short' });
      const match = dailyMemories.find((r: any) => r.day?.toISOString?.().split('T')[0] === dayStr || String(r.day) === dayStr);
      last7.push({ label, value: match ? parseInt(match.count, 10) : 0 });
    }

    return NextResponse.json({
      totalMemories: parseInt(memoriesRes.rows[0]?.total || '0', 10),
      totalTokens: parseInt(tokensRes.rows[0]?.total_tokens || '0', 10),
      originalTokens: parseInt(tokensRes.rows[0]?.original_tokens || '0', 10),
      activeSessions,
      buckets: bucketsRes.rows.map((r: any) => ({ name: r.bucket, count: parseInt(r.count, 10) })),
      sparkMemories,
      dailyChart: last7,
    });
  } catch (error: any) {
    console.error('[Dashboard API] Stats error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
