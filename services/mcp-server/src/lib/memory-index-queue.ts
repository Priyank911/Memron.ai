/** Durable Postgres-backed queue for post-write memory graph indexing. */
import { query } from '../db/client.js';

export interface MemoryIndexJob {
  pointerId: string;
  userId: number;
  orgId?: number;
  title: string;
  content: string;
  type: string;
  bucket: string;
}

/**
 * Enqueue only after the memory row is durable. The consumer is intentionally
 * separate from the MCP request path so embedding and graph work cannot hold
 * up the client response or multiply connection usage during a burst.
 */
export async function enqueueMemoryIndexJob(job: MemoryIndexJob): Promise<void> {
  await query(
    `INSERT INTO memory_index_jobs(pointer_id, user_id, org_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (pointer_id) DO NOTHING`,
    [
      job.pointerId,
      job.userId,
      job.orgId ?? null,
      JSON.stringify({
        title: job.title,
        content: job.content,
        type: job.type,
        bucket: job.bucket,
      }),
    ],
  );
}
