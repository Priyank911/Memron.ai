/**
 * Backfill Embeddings — Compute embeddings for existing memories.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-embeddings.ts
 *
 * Requires:
 *   - GEMINI_API_KEY (or OPENAI_API_KEY) in .env or environment
 *   - Database connection env vars (PG_HOST, PG_PORT, etc.)
 *   - ENCRYPTION_SECRET set in environment (to decrypt curated memory content)
 *
 * Processes curated `memories` and episodic `atomic_memories` in batches,
 * respecting provider rate limits.
 */
import 'dotenv/config';
import { getPool, close } from '../db/client.js';
import { decrypt } from '../lib/encryption.js';
import {
  generateEmbedding,
  buildEmbeddingInput,
  toPgVector,
  isEmbeddingConfigured,
  getEmbeddingHealth,
} from '../lib/embeddings.js';

const BATCH_SIZE = 50;
const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfill(): Promise<void> {
  if (!isEmbeddingConfigured()) {
    console.error(
      'No configured embedding provider found. Ensure GEMINI_API_KEY (or OPENAI_API_KEY) is set in .env or your environment.',
    );
    process.exit(1);
  }

  console.log('Starting embedding backfill...');

  // ─── 1. Backfill curated memories ─────────────────────────────────────────
  console.log('\n--- Checking curated memories table ---');
  let totalProcessedMemories = 0;
  let totalEmbeddedMemories = 0;
  let totalFailedMemories = 0;

  while (true) {
    const batch = await getPool().query(
      `SELECT id, title, tags, content_encrypted, content_iv, content_tag
       FROM memories
       WHERE embedding IS NULL AND is_active = true
       ORDER BY id ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      try {
        const plaintext = decrypt({
          encrypted: row.content_encrypted,
          iv: row.content_iv,
          tag: row.content_tag,
        });

        const input = buildEmbeddingInput(row.title, row.tags || [], plaintext);
        let embedding = await generateEmbedding(input);
        if (!embedding && getEmbeddingHealth().circuitOpen) {
          const waitMs = Math.max(5000, getEmbeddingHealth().cooldownMsRemaining + 1000);
          console.log(`  Rate limit / quota cooldown: waiting ${Math.round(waitMs / 1000)}s...`);
          await sleep(waitMs);
          embedding = await generateEmbedding(input);
        }

        if (embedding) {
          await getPool().query(
            `UPDATE memories SET embedding = $1, index_status = 'indexed', updated_at = NOW() WHERE id = $2`,
            [toPgVector(embedding), row.id],
          );
          totalEmbeddedMemories++;
        } else {
          totalFailedMemories++;
          console.warn(`  Failed to embed curated memory id=${row.id}`);
        }
      } catch (err) {
        totalFailedMemories++;
        console.error(
          `  Error processing curated memory id=${row.id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      totalProcessedMemories++;
      await sleep(DELAY_MS);
    }

    console.log(
      `  Memories processed: ${totalProcessedMemories} (embedded: ${totalEmbeddedMemories}, failed: ${totalFailedMemories})`,
    );
  }

  // ─── 2. Backfill atomic memories ──────────────────────────────────────────
  console.log('\n--- Checking atomic_memories table ---');
  let totalProcessedAtomic = 0;
  let totalEmbeddedAtomic = 0;
  let totalFailedAtomic = 0;

  const failedAtomicIds = new Set<string>();

  while (true) {
    const batch = await getPool().query(
      `SELECT memory_id, content
       FROM atomic_memories
       WHERE embedding IS NULL AND valid_to IS NULL
         AND NOT (memory_id = ANY($2::text[]))
       ORDER BY id ASC
       LIMIT $1`,
      [BATCH_SIZE, Array.from(failedAtomicIds)],
    );

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      try {
        let embedding = await generateEmbedding(row.content);
        if (!embedding && getEmbeddingHealth().circuitOpen) {
          const waitMs = Math.max(5000, getEmbeddingHealth().cooldownMsRemaining + 1000);
          console.log(`  Rate limit / quota cooldown: waiting ${Math.round(waitMs / 1000)}s...`);
          await sleep(waitMs);
          embedding = await generateEmbedding(row.content);
        }

        if (embedding) {
          await getPool().query(
            `UPDATE atomic_memories SET embedding = $1, updated_at = NOW() WHERE memory_id = $2`,
            [toPgVector(embedding), row.memory_id],
          );
          totalEmbeddedAtomic++;
        } else {
          totalFailedAtomic++;
          failedAtomicIds.add(row.memory_id);
          console.warn(`  Failed to embed atomic memory memory_id=${row.memory_id}`);
        }
      } catch (err) {
        totalFailedAtomic++;
        failedAtomicIds.add(row.memory_id);
        console.error(
          `  Error processing atomic memory memory_id=${row.memory_id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      totalProcessedAtomic++;
      await sleep(DELAY_MS);
    }

    console.log(
      `  Atomic memories processed: ${totalProcessedAtomic} (embedded: ${totalEmbeddedAtomic}, failed: ${totalFailedAtomic})`,
    );
  }

  console.log(
    `\nBackfill complete!\n- Curated memories: ${totalEmbeddedMemories} embedded / ${totalProcessedMemories} total\n- Atomic memories: ${totalEmbeddedAtomic} embedded / ${totalProcessedAtomic} total`,
  );
  await close();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
