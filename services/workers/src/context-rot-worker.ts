/**
 * Context Rot Worker — Scans for stale memories and triggers
 * archival or refresh to prevent context rot.
 */
export const contextRotWorker = {
  async start(): Promise<void> {
    console.log('  🧹 Context rot worker started');
    // TODO: Scheduled scan of memory freshness scores
  },
};
