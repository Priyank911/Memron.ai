/**
 * Memory Decay Engine — Ebbinghaus-inspired scoring for memory relevance.
 *
 * Computes a decay score for each memory based on:
 * - Importance weight (0.6)
 * - Access frequency boost (0.4 * log2(access_count + 1))
 * - Exponential time decay with configurable half-life (default 168 hours / 7 days)
 *
 * Score formula: S = (w_i * importance + w_a * log2(access_count + 1)) * e^(-λ * Δt)
 * Where λ = ln(2) / half_life_hours
 */

export const DECAY_DEFAULTS = {
  HALF_LIFE_HOURS: 168,
  IMPORTANCE_WEIGHT: 0.6,
  ACCESS_WEIGHT: 0.4,
  ARCHIVE_THRESHOLD: 0.05,
};

export interface DecayParams {
  importance: number;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
  halfLifeHours?: number;
}

/**
 * Calculates the current decay score for a memory.
 * 
 * @param params - Parameters including importance, access count, and timestamps
 * @returns A score representing current memory relevance
 */
export function calculateDecayScore(params: DecayParams): number {
  const halfLifeHours = params.halfLifeHours ?? DECAY_DEFAULTS.HALF_LIFE_HOURS;
  
  // Base components
  const importanceBoost = DECAY_DEFAULTS.IMPORTANCE_WEIGHT * params.importance;
  const accessBoost = DECAY_DEFAULTS.ACCESS_WEIGHT * Math.log2(params.accessCount + 1);
  const baseScore = importanceBoost + accessBoost;
  
  // Time elapsed (in hours) since last interaction (or creation)
  const referenceTime = params.lastAccessedAt ? params.lastAccessedAt.getTime() : params.createdAt.getTime();
  const timeElapsedMs = Math.max(0, Date.now() - referenceTime);
  const timeElapsedHours = timeElapsedMs / (1000 * 60 * 60);
  
  // Exponential decay: e^(-λ * Δt) where λ = ln(2) / half_life_hours
  const lambda = Math.LN2 / halfLifeHours;
  const decayFactor = Math.exp(-lambda * timeElapsedHours);
  
  return baseScore * decayFactor;
}

/**
 * Determines if a memory's score has dropped below the archival threshold.
 * 
 * @param score - The computed decay score
 * @param threshold - The archival threshold (defaults to 0.05)
 * @returns True if the memory is considered stale
 */
export function isMemoryStale(score: number, threshold: number = DECAY_DEFAULTS.ARCHIVE_THRESHOLD): boolean {
  return score < threshold;
}

/**
 * Calculates decay scores for a batch of memories.
 * 
 * @param memories - Array of memory parameters
 * @returns Array of scores corresponding to the input memories
 */
export function calculateDecayScoreBatch(memories: DecayParams[]): number[] {
  return memories.map(memory => calculateDecayScore(memory));
}
