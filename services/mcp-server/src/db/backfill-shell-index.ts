/**
 * Backfill / repair Tier 0 shell addresses. Indexes every active memory that
 * has no shell rows (pre-index data or a lost write). Idempotent, resumable.
 *
 *   pnpm --filter @memron/mcp-server db:backfill:shells
 */
import { close } from './client.js';
import { repairShellIndex } from '../retrieval/shell-index.js';

async function main(): Promise<void> {
  let repaired = 0;
  let failed = 0;
  for (;;) {
    const r = await repairShellIndex({ limit: 500 });
    repaired += r.repaired;
    failed += r.failed;
    console.log(`[shell-backfill] repaired=${repaired} failed=${failed}`);
    // Stop when nothing was scanned, or nothing could be fixed this round.
    if (r.scanned === 0 || r.repaired === 0) break;
  }
  console.log(`[shell-backfill] done repaired=${repaired} failed=${failed}`);
  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
