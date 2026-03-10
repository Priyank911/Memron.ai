/**
 * Backfill Embeddings — Compute embeddings for existing memories.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-embeddings.ts
 *
 * Requires:
 *   - OPENAI_API_KEY set in environment
 *   - Database connection env vars (PG_HOST, PG_PORT, etc.)
 *   - ENCRYPTION_SECRET set in environment (to decrypt content)
 *
 * Processes memories in batches of 50, with a 200ms delay between
 * each embedding call to respect OpenAI rate limits.
 */
import { pool } from '../db/client.js';
import { decrypt } from '../lib/encryption.js';
import { generateEmbedding, buildEmbeddingInput, toPgVector, isEmbeddingConfigured } from '../lib/embeddings.js';

const BATCH_SIZE = 50;
const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfill(): Promise<void> {
  if (!isEmbeddingConfigured()) {
    console.error('OPENAI_API_KEY is not set. Cannot compute embeddings.');
    process.exit(1);
  }

  console.log('Starting embedding backfill...');

  let totalProcessed = 0;
  let totalEmbedded = 0;
  let totalFailed = 0;

  while (true) {
    // Fetch a batch of memories without embeddings
    const batch = await pool.query(
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
        // Decrypt content
        const plaintext = decrypt({
          encrypted: row.content_encrypted,
          iv: row.content_iv,
          tag: row.content_tag,
        });

        // Build embedding input from title + tags + content
        const input = buildEmbeddingInput(row.title, row.tags || [], plaintext);
        const embedding = await generateEmbedding(input);

        if (embedding) {
          await pool.query(
            `UPDATE memories SET embedding = $1, updated_at = NOW() WHERE id = $2`,
            [toPgVector(embedding), row.id],
          );
          totalEmbedded++;
        } else {
          totalFailed++;
          console.warn(`  Failed to embed memory id=${row.id}`);
        }
      } catch (err) {
        totalFailed++;
        console.error(`  Error processing memory id=${row.id}:`, err instanceof Error ? err.message : err);
      }

      totalProcessed++;
      await sleep(DELAY_MS);
    }

    console.log(`  Processed ${totalProcessed} (embedded: ${totalEmbedded}, failed: ${totalFailed})`);
  }

  console.log(`\nBackfill complete: ${totalEmbedded} embedded, ${totalFailed} failed out of ${totalProcessed} total.`);
  await pool.end();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
