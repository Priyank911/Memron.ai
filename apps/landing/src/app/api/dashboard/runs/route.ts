import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';

/**
 * GET /api/dashboard/runs — Fetch execution runs and summary metrics
 * POST /api/dashboard/runs — Update run feedback / acceptance
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const supaUser = await resolveSupabaseUser(authUser.uid, orgId);
    if (!supaUser) {
      return NextResponse.json({
        metrics: {
          totalRuns: 0,
          hallucinationRate: 0,
          avgLatencyMs: 0,
          avgTokens: 0,
          successRate: 0,
        },
        runs: [],
      });
    }

    const { id: uid, orgId: userOrgId } = supaUser;
    const { where: whereUser, params } = buildUserWhereClause(uid, userOrgId);

    try {
      const runsResult = await supaQuery(
        `SELECT id, run_id, session_id, agent_id, workspace_id, task_id,
                prompt_version_id, model_name, input_tokens, output_tokens,
                latency_ms, cost, hallucination_flag, success_score,
                user_feedback, final_acceptance, failure_reason, created_at
         FROM run_records
         WHERE (${whereUser})
         ORDER BY created_at DESC
         LIMIT 100`,
        params
      );

      const rows = runsResult.rows || [];
      const totalRuns = rows.length;

      let hallucinationCount = 0;
      let totalLatency = 0;
      let totalTokens = 0;
      let successCount = 0;

      for (const r of rows) {
        if (r.hallucination_flag) hallucinationCount++;
        totalLatency += Number(r.latency_ms || 0);
        totalTokens += Number(r.input_tokens || 0) + Number(r.output_tokens || 0);
        if (r.final_acceptance || Number(r.success_score || 0) >= 0.7) successCount++;
      }

      const metrics = {
        totalRuns,
        hallucinationRate: totalRuns > 0 ? Math.round((hallucinationCount / totalRuns) * 100) : 0,
        avgLatencyMs: totalRuns > 0 ? Math.round(totalLatency / totalRuns) : 0,
        avgTokens: totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0,
        successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 100,
      };

      const runs = rows.map((r: any) => ({
        id: r.id,
        runId: r.run_id,
        sessionId: r.session_id,
        agentId: r.agent_id,
        workspaceId: r.workspace_id,
        taskId: r.task_id,
        promptVersionId: r.prompt_version_id,
        modelName: r.model_name || 'default',
        inputTokens: Number(r.input_tokens || 0),
        outputTokens: Number(r.output_tokens || 0),
        latencyMs: Number(r.latency_ms || 0),
        cost: r.cost != null ? Number(r.cost) : null,
        hallucinationFlag: Boolean(r.hallucination_flag),
        successScore: Number(r.success_score || 0),
        userFeedback: r.user_feedback,
        finalAcceptance: Boolean(r.final_acceptance),
        failureReason: r.failure_reason,
        createdAt: r.created_at,
      }));

      return NextResponse.json({ metrics, runs });
    } catch {
      // Table may not have records yet
      return NextResponse.json({
        metrics: {
          totalRuns: 0,
          hallucinationRate: 0,
          avgLatencyMs: 0,
          avgTokens: 0,
          successRate: 100,
        },
        runs: [],
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Runs GET] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const supaUser = await resolveSupabaseUser(authUser.uid, orgId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { runId, feedback, finalAcceptance } = body;

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const { id: uid } = supaUser;

    const result = await supaQuery(
      `UPDATE run_records
       SET user_feedback = $3,
           final_acceptance = COALESCE($4, final_acceptance),
           success_score = CASE
             WHEN $3::text = 'positive' THEN LEAST(success_score + 0.1, 1.0)
             WHEN $3::text = 'negative' THEN GREATEST(success_score - 0.1, 0.0)
             ELSE success_score
           END
       WHERE run_id = $1 AND user_id = $2
       RETURNING *`,
      [runId, uid, feedback || null, finalAcceptance != null ? finalAcceptance : null]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Run record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, run: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Runs POST] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
