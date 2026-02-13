/**
 * ContextRotGuard — Prevents 'context rot' by monitoring memory
 * freshness and automatically refreshing stale context.
 *
 * Context rot occurs when memories become outdated but continue
 * to be injected into inference windows, degrading output quality.
 */
export class ContextRotGuard {
  constructor(
    private maxAgeMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days default
    private refreshThreshold: number = 0.3, // Refresh if relevance < 30%
  ) {}

  /** Check if a memory has rotted (too old + low relevance) */
  isRotted(lastAccessedAt: string, relevanceScore: number): boolean {
    const age = Date.now() - new Date(lastAccessedAt).getTime();
    if (age > this.maxAgeMs && relevanceScore < this.refreshThreshold) {
      return true;
    }
    return false;
  }

  /** Get a freshness score (0 = completely stale, 1 = fresh) */
  freshnessScore(lastAccessedAt: string): number {
    const age = Date.now() - new Date(lastAccessedAt).getTime();
    return Math.max(0, 1 - age / this.maxAgeMs);
  }

  /** Suggest archival for rotted memories */
  suggestArchival(
    memories: Array<{ cid: string; lastAccessedAt: string; relevanceScore: number }>,
  ): string[] {
    return memories
      .filter((m) => this.isRotted(m.lastAccessedAt, m.relevanceScore))
      .map((m) => m.cid);
  }
}
