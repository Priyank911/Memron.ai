/**
 * One-time backfill: generate embeddings for all memories where embedding IS NULL.
 *
 * Usage:
 *   GEMINI_API_KEY=... PG_HOST=... node --loader ts-node/esm scripts/backfill-embeddings.ts
 *
 * Or via pnpm:
 *   pnpm --filter @memron/mcp-server tsx scripts/backfill-embeddings.ts
 *
 * Environment variables:
 *   BACKFILL_USER_ID   — Optional. Limit to a specific user (numeric id).
 *   BACKFILL_BATCH     — Optional. Rows per batch (default 50).
 *   BACKFILL_DELAY_MS  — Optional. Delay between batches in ms (default 1000).
 */
import 'dotenv/config';
import { query, close } from '../services/mcp-server/src/db/client.js';
import { runMigrations } from '../services/mcp-server/src/db/schema.js';
import { generateEmbedding, buildEmbeddingInput, toPgVector, isEmbeddingConfigured } from '../services/mcp-server/src/lib/embeddings.js';

interface PendingMemory {
  pointer_id: string;
  user_id: number;
  title: string;
  tags: string[];
  content_encrypted: Buffer;
  content_iv: Buffer;
  content_tag: Buffer;
}

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH || 50);
const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS || 1000);
const USER_FILTER = process.env.BACKFILL_USER_ID ? Number(process.env.BACKFILL_USER_ID) : null;

async function decryptContent(row: PendingMemory): Promise<string> {
  // Use dynamic import to avoid circular deps in the script context
  const { decrypt } = await import('../services/mcp-server/src/lib/encryption.js');
  return decrypt({
    encrypted: row.content_encrypted,
    iv: row.content_iv,
    tag: row.content_tag,
  });
}

async function main() {
  if (!isEmbeddingConfigured()) {
    console.error('[Backfill] No embedding provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
    process.exit(1);
  }

  console.log('[Backfill] Running migrations...');
  await runMigrations();

  // Count total rows needing backfill
  const countQuery = USER_FILTER
    ? `SELECT COUNT(*)::int AS count FROM memories WHERE embedding IS NULL AND is_active = true AND user_id = $1`
    : `SELECT COUNT(*)::int AS count FROM memories WHERE embedding IS NULL AND is_active = true`;
  const countParams = USER_FILTER ? [USER_FILTER] : [];
  const countResult = await query<{ count: number }>(countQuery, countParams);
  const total = countResult.rows[0]?.count ?? 0;

  if (total === 0) {
    console.log('[Backfill] No memories with NULL embedding found. Nothing to do.');
    await close();
    return;
  }

  console.log(`[Backfill] Found ${total} memories with NULL embedding. Processing in batches of ${BATCH_SIZE}...`);

  let processed = 0;
  let failed = 0;
  let offset = 0;

  while (offset < total) {
    const fetchQuery = USER_FILTER
      ? `SELECT pointer_id, user_id, title, tags, content_encrypted, content_iv, content_tag
         FROM memories WHERE embedding IS NULL AND is_active = true AND user_id = $1
         ORDER BY id LIMIT $2 OFFSET $3`
      : `SELECT pointer_id, user_id, title, tags, content_encrypted, content_iv, content_tag
         FROM memories WHERE embedding IS NULL AND is_active = true
         ORDER BY id LIMIT $1 OFFSET $2`;
    const fetchParams = USER_FILTER
      ? [USER_FILTER, BATCH_SIZE, offset]
      : [BATCH_SIZE, offset];

    const batch = await query<PendingMemory>(fetchQuery, fetchParams);
    if (batch.rows.length === 0) break;

    // Generate embeddings in parallel (batch of 10 at a time via the embedding service)
    const inputs = await Promise.all(
      batch.rows.map(async (row) => {
        try {
          const content = await decryptContent(row);
          return buildEmbeddingInput(row.title, row.tags || [], content);
        } catch {
          return buildEmbeddingInput(row.title, row.tags || [], '');
        }
      })
    );

    const embeddings = await Promise.all(inputs.map(input => generateEmbedding(input)));

    // Write each embedding back
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i];
      const emb = embeddings[i];
      if (!emb) {
        failed++;
        continue;
      }
      try {
        await query(
          `UPDATE memories SET embedding = $1, updated_at = NOW()
           WHERE pointer_id = $2 AND user_id = $3 AND is_active = true`,
          [toPgVector(emb), row.pointer_id, row.user_id],
        );
        processed++;
      } catch (err) {
        console.warn(`[Backfill] Failed to update ${row.pointer_id}:`, err instanceof Error ? err.message : err);
        failed++;
      }
    }

    offset += batch.rows.length;
    const pct = Math.min(100, Math.round((offset / total) * 100));
    console.log(`[Backfill] Progress: ${offset}/${total} (${pct}%) | OK: ${processed} | Failed: ${failed}`);

    if (offset < total) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[Backfill] Complete. Processed: ${processed}, Failed: ${failed}, Total: ${total}`);
  await close();
}

main().catch(async (error) => {
  console.error('[Backfill] Fatal error:', error);
  await close();
  process.exitCode = 1;
});
