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
  bm25: 1.0,     // Keyword overlap on curated memories (title/tags/bucket)
  bm25Atomic: 0.15, // Keyword overlap on pipeline-distilled atomic rows. Deliberately
                   // tiny so ingested chatter echoes can never outrank curated memories
                   // on keyword overlap alone. They still surface when vector/graph agree.
  graph: 1.2,    // Graph edges carry curated entity semantics — slightly above BM25
  recency: 0.3,  // Low — time decay is supplementary, not primary
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
      // Defense in depth: a document has exactly one rank per retrieval
      // system. If a signal emits the same id twice, the first (best-ranked)
      // occurrence wins; extras must not multiply its score.
      let doc = documentScores.get(result.id);
      if (doc && doc.signals[signal.name] !== undefined) return;
      const rank = index + 1; // 1-based rank
      let rrfScore = signal.weight / (k + rank);

      // Score-aware boosting for vector signal: a cosine similarity of 0.9
      // should contribute much more than 0.52 (barely above floor). Without
      // this, rank-only RRF treats a junk neighbor identically to a true
      // semantic match.
      if (signal.name === 'vector' && typeof result.score === 'number') {
        // Quadratic scaling: emphasizes high-similarity matches, suppresses
        // marginal ones. sim=0.9 -> 0.81 multiplier, sim=0.5 -> 0.25 multiplier.
        rrfScore *= result.score * result.score;
      }

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
  // Minimum threshold: a result must earn at least 20% of the max possible
  // single-signal score to be included. This eliminates padding results that
  // add noise without relevance.
  const maxSingleSignal = Math.max(...signals.map(s => s.weight / (k + 1)), 0.01);
  const minScore = maxSingleSignal * 0.20;

  const fusedResults = Array.from(documentScores.values())
    .filter(r => r.fusedScore >= minScore)
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, topK);

  return fusedResults;
}
