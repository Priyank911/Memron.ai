import { forensicSnapshotWorker } from './forensic-snapshot-worker';
import { trustScoringWorker } from './trust-scoring-worker';
import { contextRotWorker } from './context-rot-worker';

/**
 * Background Workers — Async jobs for the Memron platform.
 */
async function main() {
  await Promise.all([
    forensicSnapshotWorker.start(),
    trustScoringWorker.start(),
    contextRotWorker.start(),
  ]);

  console.log('  Workers       >> 3 background jobs active');
}

main().catch(console.error);
