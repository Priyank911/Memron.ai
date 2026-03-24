/**
 * Run Recorder
 * Records and analyzes execution runs with full version tracking
 */

import { nanoid } from 'nanoid';
import {
  insertRunRecord,
  getRunRecordById,
  getRunRecordsBySession,
  updateRunRecordFeedback,
  type RunRecordRow,
} from '../db/queries-analysis.js';
import { query } from '../db/client.js';

export interface RunContext {
  userId: number;
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  taskId?: string;
}

export interface VersionLinks {
  promptVersionId?: string;
  contextVersionId?: string;
  retrievalVersionId?: string;
  toolingVersionId?: string;
  evaluationVersionId?: string;
}

export interface ExecutionMetrics {
  modelName?: string;
  modelParams?: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost?: number;
}

export interface RunOutcome {
  hallucinationFlag?: boolean;
  successScore?: number;
  userFeedback?: 'positive' | 'negative' | 'neutral';
  finalAcceptance?: boolean;
  failureReason?: string;
}

export interface RunRecordInfo {
  runId: string;
  context: RunContext;
  versions: VersionLinks;
  metrics: ExecutionMetrics;
  outcome: RunOutcome;
  sourceArtifacts: string[];
  createdAt: Date;
}

/**
 * Start recording a new run (returns runId for later updates)
 */
export async function startRun(
  context: RunContext,
  versions: VersionLinks
): Promise<string> {
  const runId = `run_${nanoid(12)}`;

  await insertRunRecord({
    runId,
    userId: context.userId,
    sessionId: context.sessionId,
    agentId: context.agentId,
    workspaceId: context.workspaceId,
    taskId: context.taskId,
    promptVersionId: versions.promptVersionId,
    contextVersionId: versions.contextVersionId,
    retrievalVersionId: versions.retrievalVersionId,
    toolingVersionId: versions.toolingVersionId,
    evaluationVersionId: versions.evaluationVersionId,
  });

  return runId;
}

/**
 * Complete a run with metrics and outcome
 */
export async function completeRun(
  runId: string,
  userId: number,
  metrics: ExecutionMetrics,
  outcome: RunOutcome,
  sourceArtifacts?: string[]
): Promise<RunRecordRow | null> {
  const result = await query<RunRecordRow>(
    `UPDATE run_records SET
       model_name = $3,
       model_params = $4,
       input_tokens = $5,
       output_tokens = $6,
       latency_ms = $7,
       cost = $8,
       hallucination_flag = $9,
       success_score = $10,
       user_feedback = $11,
       final_acceptance = $12,
       failure_reason = $13,
       source_artifacts = $14
     WHERE run_id = $1 AND user_id = $2
     RETURNING *`,
    [
      runId,
      userId,
      metrics.modelName || null,
      metrics.modelParams ? JSON.stringify(metrics.modelParams) : null,
      metrics.inputTokens,
      metrics.outputTokens,
      metrics.latencyMs,
      metrics.cost || null,
      outcome.hallucinationFlag || false,
      outcome.successScore || 0.5,
      outcome.userFeedback || null,
      outcome.finalAcceptance || false,
      outcome.failureReason || null,
      sourceArtifacts || null,
    ]
  );

  return result.rows[0] || null;
}

/**
 * Record a complete run in one call
 */
export async function recordRun(
  context: RunContext,
  versions: VersionLinks,
  metrics: ExecutionMetrics,
  outcome: RunOutcome,
  sourceArtifacts?: string[]
): Promise<RunRecordRow> {
  const runId = `run_${nanoid(12)}`;

  return insertRunRecord({
    runId,
    userId: context.userId,
    sessionId: context.sessionId,
    agentId: context.agentId,
    workspaceId: context.workspaceId,
    taskId: context.taskId,
    promptVersionId: versions.promptVersionId,
    contextVersionId: versions.contextVersionId,
    retrievalVersionId: versions.retrievalVersionId,
    toolingVersionId: versions.toolingVersionId,
    evaluationVersionId: versions.evaluationVersionId,
    modelName: metrics.modelName,
    modelParams: metrics.modelParams,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    latencyMs: metrics.latencyMs,
    cost: metrics.cost,
    hallucinationFlag: outcome.hallucinationFlag,
    successScore: outcome.successScore,
    userFeedback: outcome.userFeedback,
    finalAcceptance: outcome.finalAcceptance,
    failureReason: outcome.failureReason,
    sourceArtifacts,
  });
}

/**
 * Update run with user feedback
 */
export async function recordFeedback(
  runId: string,
  userId: number,
  feedback: 'positive' | 'negative' | 'neutral',
  accepted?: boolean
): Promise<RunRecordRow | null> {
  return updateRunRecordFeedback(runId, userId, feedback, accepted);
}

/**
 * Get session analytics
 */
export async function getSessionAnalytics(
  sessionId: string,
  userId: number
): Promise<{
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgSuccessScore: number;
  totalTokens: number;
  totalLatencyMs: number;
  hallucinationCount: number;
  acceptanceRate: number;
}> {
  const runs = await getRunRecordsBySession(sessionId, userId);

  if (runs.length === 0) {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      avgSuccessScore: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      hallucinationCount: 0,
      acceptanceRate: 0,
    };
  }

  const successfulRuns = runs.filter(r => r.success_score >= 0.7).length;
  const failedRuns = runs.filter(r => r.success_score < 0.3).length;
  const avgSuccessScore = runs.reduce((sum, r) => sum + r.success_score, 0) / runs.length;
  const totalTokens = runs.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
  const totalLatencyMs = runs.reduce((sum, r) => sum + r.latency_ms, 0);
  const hallucinationCount = runs.filter(r => r.hallucination_flag).length;
  const acceptedRuns = runs.filter(r => r.final_acceptance).length;

  return {
    totalRuns: runs.length,
    successfulRuns,
    failedRuns,
    avgSuccessScore,
    totalTokens,
    totalLatencyMs,
    hallucinationCount,
    acceptanceRate: acceptedRuns / runs.length,
  };
}

/**
 * Get aggregated stats by prompt version
 */
export async function getStatsByPromptVersion(
  userId: number,
  limit: number = 10
): Promise<Array<{
  promptVersionId: string;
  runCount: number;
  avgSuccessScore: number;
  hallucinationRate: number;
  acceptanceRate: number;
  avgTokens: number;
}>> {
  const result = await query<{
    prompt_version_id: string;
    run_count: string;
    avg_success_score: string;
    hallucination_rate: string;
    acceptance_rate: string;
    avg_tokens: string;
  }>(
    `SELECT
       prompt_version_id,
       COUNT(*) as run_count,
       AVG(success_score) as avg_success_score,
       AVG(CASE WHEN hallucination_flag THEN 1 ELSE 0 END) as hallucination_rate,
       AVG(CASE WHEN final_acceptance THEN 1 ELSE 0 END) as acceptance_rate,
       AVG(input_tokens + output_tokens) as avg_tokens
     FROM run_records
     WHERE user_id = $1 AND prompt_version_id IS NOT NULL
     GROUP BY prompt_version_id
     ORDER BY run_count DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    promptVersionId: row.prompt_version_id,
    runCount: parseInt(row.run_count, 10),
    avgSuccessScore: parseFloat(row.avg_success_score),
    hallucinationRate: parseFloat(row.hallucination_rate),
    acceptanceRate: parseFloat(row.acceptance_rate),
    avgTokens: parseFloat(row.avg_tokens),
  }));
}

/**
 * Get runs with specific failure patterns
 */
export async function getFailedRuns(
  userId: number,
  options: {
    minDate?: Date;
    maxDate?: Date;
    limit?: number;
  } = {}
): Promise<RunRecordRow[]> {
  let sql = `SELECT * FROM run_records
             WHERE user_id = $1 AND (success_score < 0.3 OR failure_reason IS NOT NULL)`;
  const values: unknown[] = [userId];
  let paramIndex = 2;

  if (options.minDate) {
    sql += ` AND created_at >= $${paramIndex}`;
    values.push(options.minDate);
    paramIndex++;
  }

  if (options.maxDate) {
    sql += ` AND created_at <= $${paramIndex}`;
    values.push(options.maxDate);
    paramIndex++;
  }

  sql += ` ORDER BY created_at DESC`;

  if (options.limit) {
    sql += ` LIMIT $${paramIndex}`;
    values.push(options.limit);
  }

  const result = await query<RunRecordRow>(sql, values);
  return result.rows;
}

/**
 * Get hallucination patterns
 */
export async function getHallucinationPatterns(
  userId: number,
  limit: number = 20
): Promise<Array<{
  runId: string;
  sessionId: string;
  promptVersionId: string | null;
  failureReason: string | null;
  createdAt: Date;
}>> {
  const result = await query<RunRecordRow>(
    `SELECT run_id, session_id, prompt_version_id, failure_reason, created_at
     FROM run_records
     WHERE user_id = $1 AND hallucination_flag = true
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    runId: row.run_id,
    sessionId: row.session_id,
    promptVersionId: row.prompt_version_id,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  }));
}

/**
 * Calculate cost breakdown by time period
 */
export async function getCostBreakdown(
  userId: number,
  groupBy: 'day' | 'week' | 'month' = 'day',
  limit: number = 30
): Promise<Array<{
  period: string;
  totalCost: number;
  totalRuns: number;
  avgCostPerRun: number;
}>> {
  const truncFn = groupBy === 'day' ? 'day' :
                  groupBy === 'week' ? 'week' : 'month';

  const result = await query<{
    period: Date;
    total_cost: string;
    total_runs: string;
    avg_cost: string;
  }>(
    `SELECT
       DATE_TRUNC($2, created_at) as period,
       SUM(COALESCE(cost, 0)) as total_cost,
       COUNT(*) as total_runs,
       AVG(COALESCE(cost, 0)) as avg_cost
     FROM run_records
     WHERE user_id = $1
     GROUP BY DATE_TRUNC($2, created_at)
     ORDER BY period DESC
     LIMIT $3`,
    [userId, truncFn, limit]
  );

  return result.rows.map(row => ({
    period: row.period.toISOString().split('T')[0],
    totalCost: parseFloat(row.total_cost),
    totalRuns: parseInt(row.total_runs, 10),
    avgCostPerRun: parseFloat(row.avg_cost),
  }));
}

/**
 * Get run by ID with full context
 */
export async function getRun(
  runId: string,
  userId: number
): Promise<RunRecordInfo | null> {
  const record = await getRunRecordById(runId, userId);
  if (!record) return null;

  return {
    runId: record.run_id,
    context: {
      userId: record.user_id,
      sessionId: record.session_id,
      agentId: record.agent_id || undefined,
      workspaceId: record.workspace_id || undefined,
      taskId: record.task_id || undefined,
    },
    versions: {
      promptVersionId: record.prompt_version_id || undefined,
      contextVersionId: record.context_version_id || undefined,
      retrievalVersionId: record.retrieval_version_id || undefined,
      toolingVersionId: record.tooling_version_id || undefined,
      evaluationVersionId: record.evaluation_version_id || undefined,
    },
    metrics: {
      modelName: record.model_name || undefined,
      modelParams: record.model_params as Record<string, unknown> | undefined,
      inputTokens: record.input_tokens,
      outputTokens: record.output_tokens,
      latencyMs: record.latency_ms,
      cost: record.cost || undefined,
    },
    outcome: {
      hallucinationFlag: record.hallucination_flag,
      successScore: record.success_score,
      userFeedback: record.user_feedback as RunOutcome['userFeedback'],
      finalAcceptance: record.final_acceptance,
      failureReason: record.failure_reason || undefined,
    },
    sourceArtifacts: record.source_artifacts || [],
    createdAt: record.created_at,
  };
}
