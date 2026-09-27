/**
 * Diagnostic Tools — read-only pipeline eye for operators and agents.
 *
 * These tools change nothing. They exist so a failing recall can be traced
 * to its stage (embedding queued? rate-limited? vector empty? BM25 noise?)
 * without touching system state or guessing from test output.
 *
 * 1. system_diagnostics — embedding provider + circuit state, index queue
 *    depths, recent index failures, DB pool stats.
 * 2. memory_debug — per-pointer autopsy: row exists? embedding present and
 *    what dimensions? index job status/attempts/last error/next retry?
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { query, getPoolStats } from '../db/client.js';
import { getEmbeddingHealth } from '../lib/embeddings.js';
import { getMemoryIndexQueueDepth } from '../lib/memory-index-jobs.js';
import { getCoreUserId } from './core-verbs.js';
import { formatToolError } from '../lib/errors.js';

export function registerDiagnosticTools(server: McpServer): void {
  // ─── system_diagnostics ──────────────────────────────────────
  server.tool(
    'system_diagnostics',
    'Read-only health snapshot of the memory pipeline: embedding provider and circuit-breaker state, background index queue depths, recent indexing failures with reasons, and DB pool stats. Use this first when recalls miss — it tells you whether the problem is embedding (queued/rate-limited), indexing backlog, or database pressure. Changes nothing.',
    {},
    async (_args, extra) => {
      try {
        getCoreUserId((extra as any)?.authInfo);

        const embedding = getEmbeddingHealth();

        const [indexJobs, analysisJobs, recentFailures, indexDepth] = await Promise.all([
          query<{ status: string; count: string }>(
            `SELECT status, COUNT(*)::text AS count FROM memory_index_jobs GROUP BY status`
          ).then((r) => r.rows).catch(() => []),
          query<{ status: string; count: string }>(
            `SELECT status, COUNT(*)::text AS count FROM analysis_jobs GROUP BY status`
          ).then((r) => r.rows).catch(() => []),
          query<{
            pointer_id: string; status: string; attempts: number;
            last_error: string | null; available_at: Date | null; updated_at: Date | null;
          }>(
            `SELECT pointer_id, status, attempts,
                    LEFT(last_error, 300) AS last_error, available_at, updated_at
             FROM memory_index_jobs
             WHERE status = 'dead_letter' OR (status = 'queued' AND attempts > 0)
             ORDER BY updated_at DESC LIMIT 10`
          ).then((r) => r.rows).catch(() => []),
          getMemoryIndexQueueDepth().catch(() => -1),
        ]);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              embedding,
              queues: {
                memoryIndexByStatus: indexJobs,
                memoryIndexQueuedDepth: indexDepth,
                analysisByStatus: analysisJobs,
              },
              recentIndexFailures: recentFailures,
              dbPool: getPoolStats(),
              generatedAt: new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatToolError(error) }], isError: true };
      }
    },
  );

  // ─── memory_debug ────────────────────────────────────────────
  server.tool(
    'memory_debug',
    'Read-only autopsy of one stored memory by pointer ID: does the row exist, is it active, does it have a real embedding (and how many dimensions), and what is the latest background index job for it (status, attempts, last error, next retry)? Answers "why is this fact unfindable" directly. Changes nothing.',
    {
      pointerId: z.string().describe('Pointer ID to inspect (e.g. ptr_xxxxxxxx)'),
    },
    async (args, extra) => {
      try {
        const userId = getCoreUserId((extra as any)?.authInfo);

        const row = await query<{
          pointer_id: string; title: string; bucket: string; tags: string[];
          is_active: boolean; status: string;
          has_embedding: boolean; dims: number | null;
          created_at: Date; updated_at: Date;
        }>(
          `SELECT pointer_id, title, bucket, tags, is_active, status,
                  embedding IS NOT NULL AS has_embedding,
                  CASE WHEN embedding IS NULL THEN NULL ELSE vector_dims(embedding) END AS dims,
                  created_at, updated_at
           FROM memories WHERE pointer_id = $1 AND user_id = $2`,
          [args.pointerId, userId],
        ).then((r) => r.rows[0] ?? null).catch(async () => {
          // vector_dims() needs pgvector ≥0.5; fall back without dimensions.
          const fallback = await query<{
            pointer_id: string; title: string; bucket: string; tags: string[];
            is_active: boolean; status: string;
            has_embedding: boolean; created_at: Date; updated_at: Date;
          }>(
            `SELECT pointer_id, title, bucket, tags, is_active, status,
                    embedding IS NOT NULL AS has_embedding,
                    created_at, updated_at
             FROM memories WHERE pointer_id = $1 AND user_id = $2`,
            [args.pointerId, userId],
          );
          const r = fallback.rows[0];
          return r ? { ...r, dims: null } : null;
        });

        const jobs = await query<{
          status: string; attempts: number; last_error: string | null;
          available_at: Date | null; indexed_at: Date | null; updated_at: Date | null;
        }>(
          `SELECT status, attempts, LEFT(last_error, 300) AS last_error,
                  available_at, indexed_at, updated_at
           FROM memory_index_jobs WHERE pointer_id = $1
           ORDER BY id DESC LIMIT 3`,
          [args.pointerId],
        ).then((r) => r.rows).catch(() => []);

        if (!row && jobs.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                pointerId: args.pointerId,
                verdict: 'NOT_FOUND',
                note: 'No memory row and no index job for this pointer under your account. It was never stored here, was hard-deleted, or belongs to a different account/key.',
              }, null, 2),
            }],
          };
        }

        const verdict = !row
          ? 'ROW_MISSING_JOB_EXISTS'
          : !row.is_active
            ? 'SOFT_DELETED'
            : !row.has_embedding
              ? 'NO_EMBEDDING'
              : 'INDEXED';

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId: args.pointerId,
              verdict,
              row,
              indexJobs: jobs,
              meanings: {
                INDEXED: 'Row is active with a real vector — if recall still misses it, the problem is ranking/thresholds, not storage.',
                NO_EMBEDDING: 'Row exists but has no vector — check indexJobs below for status/attempts/last_error (rate limit, circuit open, dead letter).',
                SOFT_DELETED: 'Row is inactive — excluded from every signal by design. Restore it to make it findable again.',
                ROW_MISSING_JOB_EXISTS: 'Row is gone but a job references it — likely deleted after enqueue; harmless.',
                NOT_FOUND: 'Nothing stored under this pointer for your account.',
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatToolError(error) }], isError: true };
      }
    },
  );
}
