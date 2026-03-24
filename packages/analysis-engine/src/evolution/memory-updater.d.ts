/**
 * Memory Updater
 * Handles memory updates, merges, and invalidations
 */
import type { AtomicMemoryUnit, MemoryUpdate, ConflictResolution } from '../types.js';
export interface UpdateResult {
    action: 'created' | 'updated' | 'merged' | 'invalidated' | 'skipped';
    memoryId: string;
    affectedIds: string[];
    description: string;
}
export interface MemoryUpdaterConfig {
    autoResolveConflicts?: boolean;
    preserveHistory?: boolean;
    maxMergeAttempts?: number;
}
/**
 * Apply an update to a memory
 */
export declare function applyUpdate(existingMemory: AtomicMemoryUnit, newMemory: AtomicMemoryUnit, update: MemoryUpdate): UpdateResult;
/**
 * Merge two memories into one
 */
export declare function mergeMemories(memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit): AtomicMemoryUnit;
/**
 * Resolve a conflict and apply the resolution
 */
export declare function resolveConflict(resolution: ConflictResolution, memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit, config?: MemoryUpdaterConfig): UpdateResult;
/**
 * Process an update and apply it
 */
export declare function processUpdate(update: MemoryUpdate, existingMemory: AtomicMemoryUnit, newMemory: AtomicMemoryUnit, config?: MemoryUpdaterConfig): UpdateResult;
/**
 * Batch process updates
 */
export declare function processBatchUpdates(updates: MemoryUpdate[], memoryMap: Map<string, AtomicMemoryUnit>, config?: MemoryUpdaterConfig): UpdateResult[];
/**
 * Update memory confidence based on feedback
 */
export declare function updateConfidence(memory: AtomicMemoryUnit, feedback: 'positive' | 'negative', amount?: number): AtomicMemoryUnit;
/**
 * Expire outdated memories
 */
export declare function expireMemories(memories: AtomicMemoryUnit[], maxAgeMs?: number): UpdateResult[];
/**
 * Get summary of update results
 */
export declare function getUpdateSummary(results: UpdateResult[]): string;
//# sourceMappingURL=memory-updater.d.ts.map