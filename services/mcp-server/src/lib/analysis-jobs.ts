/** Durable Postgres-backed queue for conversation analysis. */
import type { ConversationMessage } from '@memron/analysis-engine';
import { query } from '../db/client.js';
import { autoIngest } from './auto-ingest.js';
import { markConversationIngested } from '../db/queries-analysis.js';
import { config } from '../config.js';
import { enqueueAnalysisJob } from './analysis-queue.js';

const MAX_ATTEMPTS = 5;

export async function processOneAnalysisJob(): Promise<boolean> {
  const claimed = await query<{
    id: string;
    session_id: string;
    user_id: number;
    payload: { messages?: ConversationMessage[] };
    attempts: number;
  }>(
    `WITH candidate AS (
       SELECT id FROM analysis_jobs
       WHERE status = 'queued' AND available_at <= NOW()
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE analysis_jobs j
     SET status = 'running', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
     FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.id, j.session_id, j.user_id, j.payload, j.attempts`,
  );
  const job = claimed.rows[0];
  if (!job) return false;

  try {
    const messages = Array.isArray(job.payload?.messages) ? job.payload.messages : [];
    await autoIngest({ sessionId: job.session_id, userId: job.user_id, messages, useLLM: config.autoIngest.useLLM });
    await markConversationIngested(job.session_id);
    await query(`DELETE FROM analysis_jobs WHERE id = $1`, [job.id]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts >= MAX_ATTEMPTS) {
      await query(`UPDATE analysis_jobs SET status = 'failed', last_error = $2, updated_at = NOW() WHERE id = $1`, [job.id, message.slice(0, 2000)]);
    } else {
      await query(
        `UPDATE analysis_jobs
         SET status = 'queued', last_error = $2,
             available_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
         WHERE id = $1`,
        [job.id, message.slice(0, 2000), Math.min(60, 2 ** job.attempts)],
      );
    }
  }
  return true;
}

export async function processAnalysisJobs(maxJobs = 5): Promise<number> {
  let processed = 0;
  for (let i = 0; i < maxJobs; i++) {
    if (!(await processOneAnalysisJob())) break;
    processed++;
  }
  return processed;
}
