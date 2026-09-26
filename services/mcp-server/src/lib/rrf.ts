/**
 * Reciprocal Rank Fusion (RRF) — Combines ranked results from multiple
 * retrieval signals (vector, BM25, graph, recency) into a single fused ranking.
 *
 * Score(d) = Σ w_i / (k + rank_i(d))
 *
 * The RRF algorithm ignores raw scores and uses only rank positions,
 * making it ideal for combining signals with incompatible score distributions.
 */

export interface RRFSignal {
  name: string;
  weight: number;
  results: Array<{ id: string; score?: number }>;
}

export interface RRFResult {
  id: string;
  fusedScore: number;
  signals: Record<string, number>;
}

export const DEFAULT_SIGNAL_WEIGHTS = {
  vector: 3.0,   // Semantic similarity is the primary signal — it understands meaning, not just keywords
  bm25: 0.8,     // Reduced — keyword overlap causes false positives (e.g. "key" matching unrelated docs)
  graph: 1.0,    // Moderate — graph adds useful context when entities are recognized
  recency: 0.4,  // Low — time decay is supplementary, not primary
};

/**
 * Fuses multiple retrieval signals into a single ranking using RRF.
 *
 * @param signals - Array of retrieval signals with their respective weights and results
 * @param options - Configuration options for RRF (k and topK)
 * @returns Array of fused results sorted by fusedScore descending
 */
export function fuseWithRRF(
  signals: RRFSignal[],
  options?: { k?: number; topK?: number }
): RRFResult[] {
  const k = options?.k ?? 60;
  const topK = options?.topK ?? 20;

  const documentScores = new Map<string, RRFResult>();

  for (const signal of signals) {
    // Sort results by raw score if provided, else use index order
    // Ensure we don't mutate the original array
    const sortedResults = [...signal.results].sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      return scoreB - scoreA;
    });

    sortedResults.forEach((result, index) => {
      const rank = index + 1; // 1-based rank
      const rrfScore = signal.weight / (k + rank);

      let doc = documentScores.get(result.id);
      if (!doc) {
        doc = {
          id: result.id,
          fusedScore: 0,
          signals: {},
        };
        documentScores.set(result.id, doc);
      }

      doc.fusedScore += rrfScore;
      doc.signals[signal.name] = rank;
    });
  }

  // Convert map to array, filter noise, and sort by fused score descending.
  // Minimum threshold: a result must earn at least 1% of the max possible
  // single-signal score to be included. This eliminates padding results that
  // add noise without relevance.
  const maxSingleSignal = Math.max(...signals.map(s => s.weight / (k + 1)), 0.01);
  const minScore = maxSingleSignal * 0.15;

  const fusedResults = Array.from(documentScores.values())
    .filter(r => r.fusedScore >= minScore)
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, topK);

  return fusedResults;
}
