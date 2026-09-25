import 'dotenv/config';
import { decrypt } from '../lib/encryption.js';
import { query, close } from './client.js';
import { indexStoredMemoryInGraph } from '../lib/memory-graph.js';

async function main() {
  const userId = Number(process.env.GRAPH_BACKFILL_USER_ID);
  const limit = Number(process.env.GRAPH_BACKFILL_LIMIT || 1000);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('GRAPH_BACKFILL_USER_ID must be a numeric database user id');

  const rows = await query<{
    pointer_id: string;
    title: string;
    content_encrypted: Buffer;
    content_iv: Buffer;
    content_tag: Buffer;
  }>(
    `SELECT pointer_id, title, content_encrypted, content_iv, content_tag
     FROM memories WHERE user_id = $1 AND is_active = true
     ORDER BY created_at ASC LIMIT $2`,
    [userId, limit],
  );

  let indexed = 0;
  for (const row of rows.rows) {
    try {
      const content = decrypt({ encrypted: row.content_encrypted, iv: row.content_iv, tag: row.content_tag });
      await indexStoredMemoryInGraph({ userId, pointerId: row.pointer_id, title: row.title, content, createMemoryNode: true });
      indexed++;
    } catch (error) {
      console.warn(`[GraphBackfill] Failed ${row.pointer_id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`[GraphBackfill] Indexed ${indexed}/${rows.rows.length} stored memories for user ${userId}`);
  await close();
}

main().catch(async error => {
  console.error('[GraphBackfill] Failed:', error);
  await close();
  process.exit(1);
});
