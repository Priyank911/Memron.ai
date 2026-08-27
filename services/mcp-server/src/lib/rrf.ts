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
  vector: 1.0,
  bm25: 0.8,
  graph: 1.2,
  recency: 0.6,
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

  // Convert map to array and sort by fused score descending
  const fusedResults = Array.from(documentScores.values())
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, topK);

  return fusedResults;
}
