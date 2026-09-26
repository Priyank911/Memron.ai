/** Postgres-backed consumer for asynchronous memory graph indexing. */
import { query } from '../db/client.js';
import { buildEmbeddingInput, generateEmbeddings, isEmbeddingConfigured, toPgVector } from './embeddings.js';
import { indexStoredMemoryInGraph } from './memory-graph.js';
import { updateMemoryEmbeddingByPointer } from '../db/queries.js';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;

type ClaimedJob = {
  id: number;
  pointer_id: string;
  user_id: number;
  payload: { title?: string; content?: string; type?: string; bucket?: string };
  attempts: number;
};

async function claimBatch(limit = BATCH_SIZE): Promise<ClaimedJob[]> {
  const result = await query<ClaimedJob>(
    `WITH candidates AS (
       SELECT id FROM memory_index_jobs
       WHERE status = 'queued' AND available_at <= NOW()
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE memory_index_jobs j
     SET status = 'running', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
     FROM candidates
     WHERE j.id = candidates.id
     RETURNING j.id, j.pointer_id, j.user_id, j.payload, j.attempts`,
    [limit],
  );
  return result.rows;
}

async function retryOrDeadLetter(job: ClaimedJob, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  if (job.attempts >= MAX_ATTEMPTS) {
    await query(
      `UPDATE memory_index_jobs
       SET status = 'dead_letter', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [job.id, message],
    );
    console.error(JSON.stringify({ event: 'memory_index_dead_letter', jobId: job.id, pointerId: job.pointer_id, attempts: job.attempts }));
    return;
  }
  const delaySeconds = Math.min(300, 2 ** job.attempts);
  await query(
    `UPDATE memory_index_jobs
     SET status = 'queued', last_error = $2,
         available_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
     WHERE id = $1`,
    [job.id, message, delaySeconds],
  );
}

export async function processMemoryIndexBatch(): Promise<number> {
  const jobs = await claimBatch();
  if (jobs.length === 0) return 0;
  const started = Date.now();
  const inputs = jobs.map(job => buildEmbeddingInput(job.payload.title || '', [], job.payload.content || ''));
  let embeddings: Array<number[] | null>;
  try {
    embeddings = await generateEmbeddings(inputs);
    if (isEmbeddingConfigured() && embeddings.some(embedding => embedding === null)) {
      throw new Error('Embedding batch did not return a vector for every queued memory');
    }
  } catch (error) {
    await Promise.all(jobs.map(job => retryOrDeadLetter(job, error)));
    console.warn(JSON.stringify({ event: 'memory_index_batch_failed', batchSize: jobs.length, latencyMs: Date.now() - started }));
    return 0;
  }
  let processed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const title = job.payload.title || 'Untitled memory';
      const content = job.payload.content || '';
      const result = await indexStoredMemoryInGraph({
        userId: job.user_id,
        pointerId: job.pointer_id,
        title,
        content,
        createMemoryNode: true,
        memoryEmbedding: embeddings[i],
      });
      if (embeddings[i]) {
        await updateMemoryEmbeddingByPointer(
          job.pointer_id,
          job.user_id,
          toPgVector(embeddings[i]!),
        );
      }
      await query(
        `UPDATE memory_index_jobs
         SET status = 'completed', indexed_at = NOW(), updated_at = NOW(), last_error = NULL
         WHERE id = $1`,
        [job.id],
      );
      processed++;
      console.info(JSON.stringify({ event: 'memory_index_complete', jobId: job.id, pointerId: job.pointer_id, entities: result.entities, relationships: result.relationships }));
    } catch (error) {
      await retryOrDeadLetter(job, error);
    }
  }
  console.info(JSON.stringify({ event: 'memory_index_batch', batchSize: jobs.length, processed, latencyMs: Date.now() - started }));
  return processed;
}

export async function getMemoryIndexQueueDepth(): Promise<number> {
  const result = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM memory_index_jobs WHERE status = 'queued'`);
  return Number(result.rows[0]?.count || 0);
}
