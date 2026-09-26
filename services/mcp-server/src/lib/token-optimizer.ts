/**
 * Token Optimization Library
 *
 * Advanced token budgeting and compression strategies for
 * efficient memory retrieval and context building.
 */

import { estimateTokens } from './pointer.js';

export interface TokenBudget {
  total: number;
  sections: {
    preferences: number;
    facts: number;
    recipes: number;
    entities: number;
    failures: number;
    context: number;
  };
}

export interface MemoryWithTokens {
  content: string;
  tokens: number;
  priority: number;
  metadata?: {
    memoryType?: string;
    confidence?: number;
    recency?: number;
  };
}

/**
 * Adaptive token budgeting based on query complexity
 */
export function calculateAdaptiveBudget(
  baseBudget: number,
  queryComplexity: number, // 0-1 score
  memoryCount: number
): TokenBudget {
  const complexityMultiplier = 1 + (queryComplexity * 0.5); // 1.0-1.5x
  const adjustedTotal = Math.min(baseBudget * complexityMultiplier, baseBudget * 1.5);

  // Dynamic section allocation based on memory count
  const perMemoryBase = adjustedTotal / Math.max(memoryCount, 10);

  return {
    total: Math.floor(adjustedTotal),
    sections: {
      preferences: Math.floor(perMemoryBase * 2),
      facts: Math.floor(perMemoryBase * 3),
      recipes: Math.floor(perMemoryBase * 2),
      entities: Math.floor(perMemoryBase * 1.5),
      failures: Math.floor(perMemoryBase * 1),
      context: Math.floor(perMemoryBase * 0.5),
    },
  };
}

/**
 * Calculate query complexity score
 */
export function calculateQueryComplexity(query: string): number {
  const factors = {
    length: Math.min(query.length / 500, 1), // Longer queries = more complex
    questionWords: (query.match(/\b(what|how|why|when|where|which|who)\b/gi) || []).length / 10,
    technicalTerms: (query.match(/\b(api|database|authentication|encryption|vector|embedding|graph)\b/gi) || []).length / 5,
    operators: (query.match(/[&|!(){}\[\]^"~*?:]/g) || []).length / 10,
  };

  return Math.min(
    factors.length +
    factors.questionWords +
    factors.technicalTerms +
    factors.operators,
    1
  );
}

/**
 * Prioritize memories for token budget
 */
export function prioritizeMemories(
  memories: MemoryWithTokens[],
  budget: number
): MemoryWithTokens[] {
  // Score each memory by multiple factors
  const scored = memories.map(mem => ({
    ...mem,
    score: calculateMemoryPriority(mem),
  }));

  // Sort by priority score
  scored.sort((a, b) => b.score - a.score);

  // Select memories within budget
  const selected: MemoryWithTokens[] = [];
  let usedTokens = 0;

  for (const mem of scored) {
    if (usedTokens + mem.tokens <= budget) {
      selected.push(mem);
      usedTokens += mem.tokens;
    } else if (selected.length === 0) {
      // Always include at least one memory, truncated if needed
      const truncated = truncateMemory(mem, budget - usedTokens);
      if (truncated) {
        selected.push(truncated);
        usedTokens += truncated.tokens;
      }
    }
  }

  return selected;
}

/**
 * Calculate memory priority score
 */
function calculateMemoryPriority(mem: MemoryWithTokens): number {
  let score = 0;

  // Memory type priority
  const typePriority: Record<string, number> = {
    preference: 1.0,
    fact: 0.9,
    goal: 0.85,
    constraint: 0.8,
    observed_success: 0.75,
    attempted_action: 0.7,
    observed_failure: 0.65,
  };

  if (mem.metadata?.memoryType) {
    score += typePriority[mem.metadata.memoryType] || 0.5;
  }

  // Confidence score
  if (mem.metadata?.confidence) {
    score += mem.metadata.confidence * 0.3;
  }

  // Recency bonus (newer memories get slight boost)
  if (mem.metadata?.recency) {
    score += mem.metadata.recency * 0.2;
  }

  // Length penalty (shorter memories are more token-efficient)
  const lengthEfficiency = 1 - Math.min(mem.tokens / 500, 0.5);
  score += lengthEfficiency * 0.2;

  return score;
}

/**
 * Truncate memory to fit token budget
 */
export function truncateMemory(
  mem: MemoryWithTokens,
  maxTokens: number
): MemoryWithTokens | null {
  if (maxTokens < 20) return null; // Too small to be useful

  const truncateRatio = maxTokens / mem.tokens;
  const truncatedLength = Math.floor(mem.content.length * truncateRatio);

  if (truncatedLength < 50) return null; // Too short to be useful

  return {
    ...mem,
    content: mem.content.slice(0, truncatedLength) + '...',
    tokens: maxTokens,
  };
}

/**
 * Progressive memory loading for large contexts
 */
export function progressiveMemoryLoad(
  memories: MemoryWithTokens[],
  budget: number,
  priorityThreshold: number = 0.7
): {
  highPriority: MemoryWithTokens[];
  lowPriority: MemoryWithTokens[];
  remainingBudget: number;
} {
  const scored = memories.map(mem => ({
    ...mem,
    score: calculateMemoryPriority(mem),
  }));

  const highPriority = scored.filter(m => m.score >= priorityThreshold);
  const lowPriority = scored.filter(m => m.score < priorityThreshold);

  // Allocate budget to high priority first
  let usedBudget = 0;
  const selectedHigh: MemoryWithTokens[] = [];

  for (const mem of highPriority) {
    if (usedBudget + mem.tokens <= budget * 0.8) {
      selectedHigh.push(mem);
      usedBudget += mem.tokens;
    }
  }

  return {
    highPriority: selectedHigh,
    lowPriority,
    remainingBudget: budget - usedBudget,
  };
}

/**
 * Differential compression for similar memories
 */
export function compressSimilarMemories(
  memories: MemoryWithTokens[],
  similarityThreshold: number = 0.8
): MemoryWithTokens[] {
  // Group similar memories by content similarity
  const groups: MemoryWithTokens[][] = [];
  const processed = new Set<number>();

  for (let i = 0; i < memories.length; i++) {
    if (processed.has(i)) continue;

    const group = [memories[i]];
    processed.add(i);

    for (let j = i + 1; j < memories.length; j++) {
      if (processed.has(j)) continue;

      const similarity = calculateContentSimilarity(
        memories[i].content,
        memories[j].content
      );

      if (similarity >= similarityThreshold) {
        group.push(memories[j]);
        processed.add(j);
      }
    }

    groups.push(group);
  }

  // Compress each group
  const compressed: MemoryWithTokens[] = [];

  for (const group of groups) {
    if (group.length === 1) {
      compressed.push(group[0]);
    } else {
      // Create a compressed representation
      const compressedMem = compressGroup(group);
      compressed.push(compressedMem);
    }
  }

  return compressed;
}

/**
 * Calculate content similarity (simple word overlap)
 */
function calculateContentSimilarity(content1: string, content2: string): number {
  const words1 = content1.toLowerCase().split(/\s+/);
  const words2 = content2.toLowerCase().split(/\s+/);

  const intersection = words1.filter(word => words2.includes(word));
  const union = Array.from(new Set([...words1, ...words2]));

  return union.length > 0 ? intersection.length / union.length : 0;
}

/**
 * Compress a group of similar memories
 */
function compressGroup(group: MemoryWithTokens[]): MemoryWithTokens {
  // Take the highest priority memory as base
  const base = group.sort((a, b) => calculateMemoryPriority(b) - calculateMemoryPriority(a))[0];

  // Create a summary that indicates multiple similar memories
  const summary = `[${group.length} similar memories] ${base.content}`;

  return {
    ...base,
    content: summary,
    tokens: estimateTokens(summary),
  };
}

/**
 * Cache-friendly memory selection
 */
export class MemoryCache {
  private cache = new Map<string, { memories: MemoryWithTokens[]; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes

  set(key: string, memories: MemoryWithTokens[]): void {
    this.cache.set(key, {
      memories,
      timestamp: Date.now(),
    });
  }

  get(key: string): MemoryWithTokens[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.memories;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Optimize retrieval with caching and compression
 */
export async function optimizedRetrieval(
  query: string,
  memories: MemoryWithTokens[],
  budget: number,
  cache?: MemoryCache
): Promise<{
  memories: MemoryWithTokens[];
  cacheHit: boolean;
  compressionRatio: number;
}> {
  const cacheKey = `${query}-${budget}`;

  // Check cache first
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        memories: cached,
        cacheHit: true,
        compressionRatio: 1,
      };
    }
  }

  // Calculate adaptive budget
  const complexity = calculateQueryComplexity(query);
  const adaptiveBudget = calculateAdaptiveBudget(budget, complexity, memories.length);

  // Compress similar memories
  const compressed = compressSimilarMemories(memories);

  // Prioritize and select memories
  const selected = prioritizeMemories(compressed, adaptiveBudget.total);

  // Cache the result
  if (cache) {
    cache.set(cacheKey, selected);
  }

  const originalTokens = memories.reduce((sum, m) => sum + m.tokens, 0);
  const selectedTokens = selected.reduce((sum, m) => sum + m.tokens, 0);
  const compressionRatio = originalTokens > 0 ? 1 - (selectedTokens / originalTokens) : 0;

  return {
    memories: selected,
    cacheHit: false,
    compressionRatio,
  };
}
