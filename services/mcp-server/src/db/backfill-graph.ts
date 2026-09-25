import 'dotenv/config';
import { close } from './client.js';
import { runMigrations } from './schema.js';
import { backfillGraph } from '../lib/graph-backfill.js';

async function main() {
  const rawUserId = process.env.GRAPH_BACKFILL_USER_ID;
  if (!rawUserId || !/^\d+$/.test(rawUserId)) {
    throw new Error('Set GRAPH_BACKFILL_USER_ID to the numeric Memron user id before running the backfill');
  }
  await runMigrations();
  const result = await backfillGraph({
    userId: Number(rawUserId),
    limit: Number(process.env.GRAPH_BACKFILL_LIMIT || 1000),
    useLLM: process.env.GRAPH_BACKFILL_USE_LLM === 'true',
  });
  console.log('[GraphBackfill] Completed:', result);
  await close();
}

main().catch(async error => {
  console.error('[GraphBackfill] Failed:', error);
  await close();
  process.exitCode = 1;
});
