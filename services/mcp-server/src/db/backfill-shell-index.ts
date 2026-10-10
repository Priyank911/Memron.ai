/**
 * Backfill Tier 0 shell addresses for memories stored before the shell index
 * existed. Idempotent and resumable: indexMemoryShells replaces per memory.
 *
 *   pnpm --filter @memron/mcp-server db:backfill:shells
 */
import { query, close } from './client.js';
import { decrypt } from '../lib/encryption.js';
import { indexMemoryShells } from '../retrieval/shell-index.js';

async function main(): Promise<void> {
  let lastId = 0;
  let indexed = 0;
  let failed = 0;
  for (;;) {
    const batch = await query<any>(
      `SELECT id, user_id, pointer_id, tags, content_encrypted, content_iv, content_tag
       FROM memories
       WHERE is_active = true AND id > $1
       ORDER BY id ASC
       LIMIT 200`,
      [lastId],
    );
    if (!batch.rows.length) break;
    for (const row of batch.rows) {
      lastId = row.id;
      try {
        const content = decrypt({ encrypted: row.content_encrypted, iv: row.content_iv, tag: row.content_tag });
        await indexMemoryShells({ userId: row.user_id, pointerId: row.pointer_id, content, tags: row.tags || [] });
        indexed++;
      } catch (error) {
        failed++;
        console.warn(`[shell-backfill] ${row.pointer_id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    console.log(`[shell-backfill] indexed=${indexed} failed=${failed} lastId=${lastId}`);
  }
  console.log(`[shell-backfill] done indexed=${indexed} failed=${failed}`);
  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
