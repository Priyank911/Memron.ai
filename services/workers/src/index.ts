import { forensicSnapshotWorker } from './forensic-snapshot-worker';
import { trustScoringWorker } from './trust-scoring-worker';
import { contextRotWorker } from './context-rot-worker';

/**
 * Background Workers — Async jobs for the Memron platform.
 */
async function main() {
  console.log('⚙️  Starting Memron background workers...');

  await Promise.all([
    forensicSnapshotWorker.start(),
    trustScoringWorker.start(),
    contextRotWorker.start(),
  ]);

  console.log('✅ All workers running');
}

main().catch(console.error);
