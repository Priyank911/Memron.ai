/** Durable Postgres-backed queue for post-write memory graph indexing. */
import { query } from '../db/client.js';

export interface MemoryIndexJob {
  pointerId: string;
  userId: number;
  orgId?: number;
  title: string;
  /** Optional only for compatibility with older callers; v2 omits plaintext. */
  content?: string;
  type: string;
  bucket: string;
}

/** Structural type shared by Cloudflare Queues and test doubles. */
export interface MemoryIndexQueue {
  send(message: MemoryIndexJob): Promise<unknown>;
}

/**
 * Enqueue only after the memory row is durable. The consumer is intentionally
 * separate from the MCP request path so embedding and graph work cannot hold
 * up the client response or multiply connection usage during a burst.
 */
export async function enqueueMemoryIndexJob(job: MemoryIndexJob, queue?: MemoryIndexQueue): Promise<void> {
  // Cloudflare Queues is the production async transport at the edge. It is
  // at-least-once, so pointerId is part of the message and graph upserts must
  // remain idempotent. Railway keeps the Postgres queue as its pull consumer.
  if (queue) {
    try {
      await queue.send(job);
      return;
    } catch (error) {
      // The canonical memory row is already durable. Fall back to the
      // Railway-compatible outbox so a transient Cloudflare Queue failure
      // cannot turn a successful write into a lost enrichment job.
      console.error(JSON.stringify({
        event: 'memory_index_queue_publish_failed',
        pointerId: job.pointerId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
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
        type: job.type,
        bucket: job.bucket,
      }),
    ],
  );
}
