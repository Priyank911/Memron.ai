/**
 * Conflict Detector
 * Detects conflicts and relationships between memories
 */
import type { AtomicMemoryUnit, MemoryUpdate, ConflictResolution } from '../types';
export interface ConflictDetectorConfig {
    useHeuristics?: boolean;
    useLLM?: boolean;
    similarityThreshold?: number;
}
/**
 * Detect conflict or relationship between two memories
 */
export declare function detectConflict(memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit, config?: ConflictDetectorConfig): Promise<MemoryUpdate | null>;
/**
 * Detect conflicts synchronously using heuristics
 */
export declare function detectConflictSync(memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit, config?: ConflictDetectorConfig): MemoryUpdate | null;
/**
 * Suggest resolution for a conflict
 */
export declare function suggestResolution(update: MemoryUpdate, memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit): ConflictResolution;
/**
 * Find all conflicts in a set of memories
 */
export declare function findAllConflicts(memories: AtomicMemoryUnit[], config?: ConflictDetectorConfig): Promise<MemoryUpdate[]>;
/**
 * Find conflicts synchronously
 */
export declare function findAllConflictsSync(memories: AtomicMemoryUnit[], config?: ConflictDetectorConfig): MemoryUpdate[];
//# sourceMappingURL=conflict-detector.d.ts.map