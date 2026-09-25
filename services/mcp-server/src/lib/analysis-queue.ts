import type { ConversationMessage } from '@memron/analysis-engine';
import { query } from '../db/client.js';

export async function enqueueAnalysisJob(params: {
  sessionId: string;
  userId: number;
  messages: ConversationMessage[];
}): Promise<void> {
  await query(
    `INSERT INTO analysis_jobs(job_type, session_id, user_id, payload)
     SELECT 'conversation_ingest', $1, $2, $3::jsonb
     ON CONFLICT (session_id, job_type) WHERE status IN ('queued', 'running') DO NOTHING`,
    [params.sessionId, params.userId, JSON.stringify({ messages: params.messages })],
  );
}
