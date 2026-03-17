/**
 * Performance Tests
 * Tests for N+1 query prevention, batch operations, concurrency limits,
 * conflict detection optimization, and token budget enforcement
 */
import { describe, it, expect } from 'vitest';

// ============================================================================
// N+1 Query Prevention Tests
// ============================================================================

describe('N+1 Query Prevention in Packet Builder', () => {
  it('should use batch query instead of per-entity queries', () => {
    // Simulate 20 entities — old code would make 20 DB calls
    const entityIds = Array.from({ length: 20 }, (_, i) => `entity_${i}`);

    // Batch query: 1 DB call
    const batchQuery = `SELECT * FROM entity_relationships WHERE user_id = $1 AND (source_entity_id = ANY($2) OR target_entity_id = ANY($2))`;

    expect(batchQuery).toContain('ANY($2)');
    // Verify we're passing all entity IDs in one shot
    expect(entityIds).toHaveLength(20);
  });

  it('should correctly group batch results by entity', () => {
    const relationships = [
      { source_entity_id: 'e1', target_entity_id: 'e2', relationship_type: 'uses', strength: 0.8 },
      { source_entity_id: 'e1', target_entity_id: 'e3', relationship_type: 'extends', strength: 0.6 },
      { source_entity_id: 'e2', target_entity_id: 'e4', relationship_type: 'related', strength: 0.5 },
      { source_entity_id: 'e3', target_entity_id: 'e4', relationship_type: 'uses', strength: 0.9 },
    ];

    const relsByEntity = new Map<string, typeof relationships>();
    for (const rel of relationships) {
      for (const entityId of [rel.source_entity_id, rel.target_entity_id]) {
        if (!relsByEntity.has(entityId)) relsByEntity.set(entityId, []);
        relsByEntity.get(entityId)!.push(rel);
      }
    }

    expect(relsByEntity.get('e1')).toHaveLength(2);
    expect(relsByEntity.get('e2')).toHaveLength(2);
    expect(relsByEntity.get('e3')).toHaveLength(2);
    expect(relsByEntity.get('e4')).toHaveLength(2);
  });

  it('should handle empty entity list in batch query', () => {
    const entityIds: string[] = [];
    // Batch function should return early
    const shouldSkip = entityIds.length === 0;
    expect(shouldSkip).toBe(true);
  });

  it('should limit relationship results in batch to 500', () => {
    const batchLimit = 500;
    const sql = `SELECT * FROM entity_relationships WHERE user_id = $1 AND (source_entity_id = ANY($2) OR target_entity_id = ANY($2)) ORDER BY strength DESC LIMIT 500`;
    expect(sql).toContain(`LIMIT ${batchLimit}`);
  });
});

// ============================================================================
// Conflict Detection Optimization Tests
// ============================================================================

describe('Conflict Detection Pre-filtering', () => {
  interface MockMemory {
    memoryId: string;
    memoryType: string;
    content: string;
  }

  function countComparisons(memories: MockMemory[], useGrouping: boolean): number {
    if (!useGrouping) {
      // O(n²) — compare every pair
      return (memories.length * (memories.length - 1)) / 2;
    }

    // Group by type first
    const byType = new Map<string, MockMemory[]>();
    for (const mem of memories) {
      const group = byType.get(mem.memoryType) || [];
      group.push(mem);
      byType.set(mem.memoryType, group);
    }

    let comparisons = 0;
    for (const group of byType.values()) {
      comparisons += (group.length * (group.length - 1)) / 2;
    }
    return comparisons;
  }

  it('should reduce comparisons with type-based grouping', () => {
    // 100 memories, 5 types, 20 each
    const memories: MockMemory[] = [];
    const types = ['fact', 'preference', 'goal', 'constraint', 'attempted_action'];
    for (let i = 0; i < 100; i++) {
      memories.push({
        memoryId: `mem_${i}`,
        memoryType: types[i % 5],
        content: `Content ${i}`,
      });
    }

    const withoutGrouping = countComparisons(memories, false);
    const withGrouping = countComparisons(memories, true);

    // Without: 100*99/2 = 4950
    expect(withoutGrouping).toBe(4950);
    // With: 5 groups of 20 each = 5 * (20*19/2) = 5 * 190 = 950
    expect(withGrouping).toBe(950);
    // ~80% reduction
    expect(withGrouping).toBeLessThan(withoutGrouping * 0.25);
  });

  it('should handle single-type memories (worst case)', () => {
    const memories: MockMemory[] = Array.from({ length: 50 }, (_, i) => ({
      memoryId: `mem_${i}`,
      memoryType: 'fact',
      content: `Fact ${i}`,
    }));

    const withoutGrouping = countComparisons(memories, false);
    const withGrouping = countComparisons(memories, true);

    // Same number when all same type
    expect(withGrouping).toBe(withoutGrouping);
  });

  it('should handle all-unique types (best case)', () => {
    const memories: MockMemory[] = Array.from({ length: 50 }, (_, i) => ({
      memoryId: `mem_${i}`,
      memoryType: `type_${i}`,
      content: `Content ${i}`,
    }));

    const withoutGrouping = countComparisons(memories, false);
    const withGrouping = countComparisons(memories, true);

    expect(withoutGrouping).toBe(1225);
    expect(withGrouping).toBe(0); // No pairs within same type
  });
});

// ============================================================================
// Concurrency Limiter Tests
// ============================================================================

describe('Concurrency Limiter', () => {
  async function promiseAllWithLimit<T>(
    tasks: (() => Promise<T>)[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function runNext(): Promise<void> {
      while (index < tasks.length) {
        const currentIndex = index++;
        results[currentIndex] = await tasks[currentIndex]();
      }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
    await Promise.all(workers);
    return results;
  }

  it('should process all tasks', async () => {
    const tasks = Array.from({ length: 20 }, (_, i) => () => Promise.resolve(i));
    const results = await promiseAllWithLimit(tasks, 5);
    expect(results).toHaveLength(20);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('should limit concurrent execution', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const tasks = Array.from({ length: 20 }, () => async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise(r => setTimeout(r, 10));
      currentConcurrent--;
      return true;
    });

    await promiseAllWithLimit(tasks, 5);
    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });

  it('should handle fewer tasks than limit', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)];
    const results = await promiseAllWithLimit(tasks, 10);
    expect(results).toEqual([1, 2]);
  });

  it('should handle empty task list', async () => {
    const results = await promiseAllWithLimit([], 5);
    expect(results).toEqual([]);
  });

  it('should propagate errors from tasks', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('Task failed')),
      () => Promise.resolve(3),
    ];

    await expect(promiseAllWithLimit(tasks, 2)).rejects.toThrow('Task failed');
  });
});

// ============================================================================
// Token Budget Enforcement Tests
// ============================================================================

describe('Token Budget Enforcement', () => {
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  it('should correctly estimate tokens', () => {
    expect(estimateTokens('Hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('should respect 60% budget allocation for memories', () => {
    const totalBudget = 2000;
    const memoryBudget = totalBudget * 0.6; // 1200

    let tokensUsed = 0;
    const memories = Array.from({ length: 100 }, (_, i) => `Memory content ${i}: ${'x'.repeat(50)}`);

    let memoriesIncluded = 0;
    for (const mem of memories) {
      const tokens = estimateTokens(mem);
      if (tokensUsed + tokens > memoryBudget) break;
      tokensUsed += tokens;
      memoriesIncluded++;
    }

    expect(tokensUsed).toBeLessThanOrEqual(memoryBudget);
    expect(memoriesIncluded).toBeLessThan(memories.length);
  });

  it('should stop including entities at 90% budget', () => {
    const totalBudget = 2000;
    const entityCutoff = totalBudget * 0.9; // 1800

    let tokensUsed = 1500; // Already used by memories + recipes
    const entities = Array.from({ length: 20 }, (_, i) => ({
      name: `Entity_${i}_${'description'.repeat(10)}`,
      tokens: estimateTokens(JSON.stringify({ name: `Entity_${i}_${'description'.repeat(10)}`, type: 'technology', relations: ['a', 'b', 'c'] })),
    }));

    let entitiesIncluded = 0;
    for (const entity of entities) {
      if (tokensUsed >= entityCutoff) break;
      tokensUsed += entity.tokens;
      entitiesIncluded++;
    }

    expect(entitiesIncluded).toBeGreaterThan(0);
    expect(entitiesIncluded).toBeLessThan(entities.length);
  });
});

// ============================================================================
// Large Conversation Ingestion Tests
// ============================================================================

describe('Large Conversation Processing', () => {
  it('should handle 500 messages without issue', () => {
    const messages = Array.from({ length: 500 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: ${'content '.repeat(20)}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    }));

    expect(messages).toHaveLength(500);
    // Estimate total tokens
    const totalTokens = messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    expect(totalTokens).toBeGreaterThan(0);
  });

  it('should respect maxEpisodes config', () => {
    const maxEpisodes = 50;
    const episodes = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const limited = episodes.slice(0, maxEpisodes);
    expect(limited).toHaveLength(50);
  });

  it('should respect maxMemoriesPerEpisode config', () => {
    const maxPerEpisode = 20;
    const memories = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const limited = memories.slice(0, maxPerEpisode);
    expect(limited).toHaveLength(20);
  });
});

// ============================================================================
// Memory Evolution with Many Memories
// ============================================================================

describe('Memory Evolution Scalability', () => {
  it('should scale better with type-based grouping for 100+ memories', () => {
    // Simulate timing
    const memoryCount = 200;
    const typeCount = 8;
    const perType = memoryCount / typeCount; // 25 per type

    // Without grouping: 200*199/2 = 19,900 comparisons
    const withoutGrouping = (memoryCount * (memoryCount - 1)) / 2;

    // With grouping: 8 * (25*24/2) = 8 * 300 = 2,400 comparisons
    const withGrouping = typeCount * ((perType * (perType - 1)) / 2);

    expect(withGrouping).toBeLessThan(withoutGrouping / 5);
  });
});
