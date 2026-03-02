import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

/**
 * GET /api/dashboard/stats — Real-time dashboard statistics
 *
 * Resolves the user through Clerk → users table, then also checks
 * org_id ownership so memories stored via MCP still show up even
 * if user_id doesn't match (e.g. OAuth vs API-key auth paths).
 *
 * Each metric is fetched independently so a single failing query
 * doesn't take down the entire endpoint.
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(clerkId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let uid = dbUser.id;

    // Also resolve org_id — memories may be linked via org_id through MCP
    let orgId: number | null = null;
    try {
      const orgRes = await query(
        `SELECT id FROM organizations WHERE owner_id = $1 AND is_active = true LIMIT 1`,
        [uid],
      );
      orgId = orgRes.rows[0]?.id ?? null;
    } catch {
      /* table may not exist */
    }

    // Build flexible WHERE clause: match user_id OR org_id
    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [uid];
    let pIdx = 2;

    if (orgId) {
      conditions.push(`org_id = $${pIdx}`);
      params.push(orgId);
      pIdx++;
    }

    let whereUser = conditions.join(' OR ');

    console.log(`[Dashboard Stats] uid=${uid}, orgId=${orgId}, clerk=${clerkId}`);

    // ── Total memories ────────────────────────────────────────
    let totalMemories = 0;
    try {
      const res = await query(
        `SELECT COUNT(*) as total FROM memories WHERE (${whereUser})`,
        params,
      );
      totalMemories = parseInt(res.rows[0]?.total || '0', 10);

      // If still 0, check for single-tenant scenario (user_id mismatch)
      if (totalMemories === 0) {
        const allRes = await query(`SELECT COUNT(*) as total FROM memories`);
        const allCount = parseInt(allRes.rows[0]?.total || '0', 10);
        if (allCount > 0) {
          console.warn(`[Dashboard Stats] Found ${allCount} memories but none match uid=${uid} or orgId=${orgId}`);
          // If there's only one user in memories, it's likely a user_id mismatch
          const distinctRes = await query(`SELECT DISTINCT user_id FROM memories`);
          if (distinctRes.rows.length === 1) {
            const memUserId = distinctRes.rows[0].user_id;
            console.warn(`[Dashboard Stats] Single-tenant: memories have user_id=${memUserId}, dashboard user has id=${uid}. Using memory user_id.`);
            // Override for all subsequent queries
            uid = memUserId;
            params[0] = memUserId;
            // Also rebuild whereUser with new uid
            const newConditions: string[] = [`user_id = $1`];
            const newParams: any[] = [memUserId];
            if (orgId) {
              newConditions.push(`org_id = $2`);
              newParams.push(orgId);
            }
            whereUser = newConditions.join(' OR ');
            params.length = 0;
            newParams.forEach(p => params.push(p));
            totalMemories = allCount;
          }
        }
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
         FROM memories WHERE (${whereUser})`,
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
      const res = await query(
        `SELECT bucket, COUNT(*) as count FROM memories WHERE (${whereUser}) GROUP BY bucket ORDER BY count DESC`,
        params,
      );
      buckets = res.rows.map((r: any) => ({ name: r.bucket || 'default', count: parseInt(r.count, 10) }));
    } catch (e: any) {
      console.error('[Dashboard Stats] bucket error:', e.message);
    }

    // ── Daily activity (last 30 days) ─────────────────────────
    let dailyMemories: any[] = [];
    try {
      const res = await query(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM memories
         WHERE (${whereUser}) AND created_at > NOW() - INTERVAL '30 days'
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
      const res = await query(
        `SELECT COUNT(DISTINCT client_id) as count
         FROM mcp_refresh_tokens
         WHERE user_id = $1 AND revoked = false AND expires_at > NOW()`,
        [dbUser.id],
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
      _debug: {
        dbUserId: dbUser.id,
        resolvedUid: uid,
        orgId,
        clerkId,
      },
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
