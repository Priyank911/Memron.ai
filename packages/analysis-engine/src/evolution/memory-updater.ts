/**
 * Memory Updater
 * Handles memory updates, merges, and invalidations
 */

import { nanoid } from 'nanoid';
import type {
  AtomicMemoryUnit,
  MemoryUpdate,
  ConflictResolution,
} from '../types.js';
import { suggestResolution } from './conflict-detector.js';

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

const DEFAULT_CONFIG: Required<MemoryUpdaterConfig> = {
  autoResolveConflicts: true,
  preserveHistory: true,
  maxMergeAttempts: 3,
};

/**
 * Apply an update to a memory
 */
export function applyUpdate(
  existingMemory: AtomicMemoryUnit,
  newMemory: AtomicMemoryUnit,
  update: MemoryUpdate
): UpdateResult {
  switch (update.relation) {
    case 'updates':
      // New memory supersedes old
      newMemory.supersedesMemoryId = existingMemory.memoryId;
      return {
        action: 'updated',
        memoryId: newMemory.memoryId,
        affectedIds: [existingMemory.memoryId],
        description: `Memory ${newMemory.memoryId} supersedes ${existingMemory.memoryId}`,
      };

    case 'extends':
      // Both should be kept, but linked
      newMemory.graphLinks.push({
        entityId: existingMemory.memoryId,
        entityName: 'extended_memory',
        entityType: 'memory',
        relationshipType: 'extends',
        strength: update.confidence,
      });
      return {
        action: 'updated',
        memoryId: newMemory.memoryId,
        affectedIds: [existingMemory.memoryId],
        description: `Memory ${newMemory.memoryId} extends ${existingMemory.memoryId}`,
      };

    case 'contradicts':
      // Mark both as having a conflict
      return {
        action: 'skipped',
        memoryId: newMemory.memoryId,
        affectedIds: [existingMemory.memoryId],
        description: `Contradiction detected: ${update.evidence}. Manual review needed.`,
      };

    case 'invalidates':
      // Mark old memory as invalid
      existingMemory.validTo = new Date().toISOString();
      return {
        action: 'invalidated',
        memoryId: existingMemory.memoryId,
        affectedIds: [newMemory.memoryId],
        description: `Memory ${existingMemory.memoryId} invalidated by ${newMemory.memoryId}`,
      };

    case 'derives_from':
      // New memory is a synthesis
      newMemory.graphLinks.push({
        entityId: existingMemory.memoryId,
        entityName: 'source_memory',
        entityType: 'memory',
        relationshipType: 'derives_from',
        strength: update.confidence,
      });
      return {
        action: 'created',
        memoryId: newMemory.memoryId,
        affectedIds: [existingMemory.memoryId],
        description: `Memory ${newMemory.memoryId} derived from ${existingMemory.memoryId}`,
      };

    default:
      return {
        action: 'skipped',
        memoryId: newMemory.memoryId,
        affectedIds: [],
        description: 'No update action taken',
      };
  }
}

/**
 * Merge two memories into one
 */
export function mergeMemories(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): AtomicMemoryUnit {
  const timestamp = new Date().toISOString();

  // Determine which is primary (higher confidence or more recent)
  const primary =
    memory1.confidence > memory2.confidence
      ? memory1
      : memory2.confidence > memory1.confidence
        ? memory2
        : new Date(memory1.timestamp) > new Date(memory2.timestamp)
          ? memory1
          : memory2;

  const secondary = primary === memory1 ? memory2 : memory1;

  // Merge content
  const mergedContent = mergeContent(primary.content, secondary.content);
  const mergedCompressed = mergeContent(
    primary.compressedContent,
    secondary.compressedContent
  );

  // Merge graph links
  const mergedLinks = [...primary.graphLinks];
  for (const link of secondary.graphLinks) {
    if (!mergedLinks.some((l) => l.entityId === link.entityId)) {
      mergedLinks.push(link);
    }
  }

  // Add links to source memories
  mergedLinks.push(
    {
      entityId: memory1.memoryId,
      entityName: 'source_memory',
      entityType: 'memory',
      relationshipType: 'derives_from',
      strength: 1.0,
    },
    {
      entityId: memory2.memoryId,
      entityName: 'source_memory',
      entityType: 'memory',
      relationshipType: 'derives_from',
      strength: 1.0,
    }
  );

  return {
    memoryId: `mem_${nanoid(16)}`,
    userId: primary.userId,
    workspaceId: primary.workspaceId || secondary.workspaceId,
    agentId: primary.agentId || secondary.agentId,
    taskId: primary.taskId || secondary.taskId,
    memoryType: primary.memoryType,
    content: mergedContent,
    compressedContent: mergedCompressed,
    confidence: Math.max(memory1.confidence, memory2.confidence),
    successScore: (memory1.successScore + memory2.successScore) / 2,
    failureScore: Math.min(memory1.failureScore, memory2.failureScore),
    transferability: Math.max(memory1.transferability, memory2.transferability),
    timestamp,
    eventTime: primary.eventTime || secondary.eventTime,
    validFrom: primary.validFrom,
    validTo: undefined,
    supersedesMemoryId: undefined,
    sourceSpan: {
      start: Math.min(memory1.sourceSpan.start, memory2.sourceSpan.start),
      end: Math.max(memory1.sourceSpan.end, memory2.sourceSpan.end),
    },
    graphLinks: mergedLinks,
    sharePolicy: primary.sharePolicy === 'public' || secondary.sharePolicy === 'public'
      ? 'public'
      : primary.sharePolicy === 'team' || secondary.sharePolicy === 'team'
        ? 'team'
        : 'private',
    expiry: undefined,
    embedding: undefined, // Will need to regenerate
  };
}

/**
 * Merge two content strings intelligently
 */
function mergeContent(content1: string, content2: string): string {
  // If one is subset of other, use longer
  if (content1.includes(content2)) return content1;
  if (content2.includes(content1)) return content2;

  // Find unique parts
  const words1 = new Set(content1.split(/\s+/));
  const words2 = new Set(content2.split(/\s+/));

  const uniqueTo1 = [...words1].filter((w) => !words2.has(w));
  const uniqueTo2 = [...words2].filter((w) => !words1.has(w));

  // If little unique content, just use longer
  if (uniqueTo1.length < 5 && uniqueTo2.length < 5) {
    return content1.length >= content2.length ? content1 : content2;
  }

  // Combine with separator
  return `${content1}\n\nAdditionally: ${uniqueTo2.join(' ')}`;
}

/**
 * Resolve a conflict and apply the resolution
 */
export function resolveConflict(
  resolution: ConflictResolution,
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit,
  config: MemoryUpdaterConfig = {}
): UpdateResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  switch (resolution.resolution) {
    case 'keep_newer': {
      const newer =
        new Date(memory1.timestamp) > new Date(memory2.timestamp) ? memory1 : memory2;
      const older = newer === memory1 ? memory2 : memory1;

      newer.supersedesMemoryId = older.memoryId;
      if (fullConfig.preserveHistory) {
        older.validTo = new Date().toISOString();
      }

      return {
        action: 'updated',
        memoryId: newer.memoryId,
        affectedIds: [older.memoryId],
        description: `Kept newer memory ${newer.memoryId}, superseding ${older.memoryId}`,
      };
    }

    case 'keep_older': {
      const older2 =
        new Date(memory1.timestamp) < new Date(memory2.timestamp) ? memory1 : memory2;
      const newer2 = older2 === memory1 ? memory2 : memory1;

      if (fullConfig.preserveHistory) {
        newer2.validTo = new Date().toISOString();
      }

      return {
        action: 'invalidated',
        memoryId: newer2.memoryId,
        affectedIds: [older2.memoryId],
        description: `Kept older memory ${older2.memoryId}, invalidating ${newer2.memoryId}`,
      };
    }

    case 'merge': {
      const merged = mergeMemories(memory1, memory2);

      if (fullConfig.preserveHistory) {
        memory1.validTo = new Date().toISOString();
        memory2.validTo = new Date().toISOString();
      }

      return {
        action: 'merged',
        memoryId: merged.memoryId,
        affectedIds: [memory1.memoryId, memory2.memoryId],
        description: `Merged memories into ${merged.memoryId}`,
      };
    }

    case 'manual_review':
    default:
      return {
        action: 'skipped',
        memoryId: memory1.memoryId,
        affectedIds: [memory2.memoryId],
        description: 'Manual review required for conflict resolution',
      };
  }
}

/**
 * Process an update and apply it
 */
export function processUpdate(
  update: MemoryUpdate,
  existingMemory: AtomicMemoryUnit,
  newMemory: AtomicMemoryUnit,
  config: MemoryUpdaterConfig = {}
): UpdateResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // For contradictions, try to resolve automatically if configured
  if (update.relation === 'contradicts' && fullConfig.autoResolveConflicts) {
    const resolution = suggestResolution(update, existingMemory, newMemory);

    if (resolution.resolution !== 'manual_review' && resolution.confidence > 0.7) {
      return resolveConflict(resolution, existingMemory, newMemory, config);
    }
  }

  return applyUpdate(existingMemory, newMemory, update);
}

/**
 * Batch process updates
 */
export function processBatchUpdates(
  updates: MemoryUpdate[],
  memoryMap: Map<string, AtomicMemoryUnit>,
  config: MemoryUpdaterConfig = {}
): UpdateResult[] {
  const results: UpdateResult[] = [];

  for (const update of updates) {
    const existingMemory = memoryMap.get(update.affectedMemoryId);
    const newMemory = memoryMap.get(update.newMemoryId);

    if (!existingMemory || !newMemory) {
      results.push({
        action: 'skipped',
        memoryId: update.newMemoryId,
        affectedIds: [update.affectedMemoryId],
        description: 'Memory not found in map',
      });
      continue;
    }

    const result = processUpdate(update, existingMemory, newMemory, config);
    results.push(result);
  }

  return results;
}

/**
 * Update memory confidence based on feedback
 */
export function updateConfidence(
  memory: AtomicMemoryUnit,
  feedback: 'positive' | 'negative',
  amount: number = 0.1
): AtomicMemoryUnit {
  const delta = feedback === 'positive' ? amount : -amount;

  return {
    ...memory,
    confidence: Math.max(0, Math.min(1, memory.confidence + delta)),
    successScore:
      feedback === 'positive'
        ? Math.min(1, memory.successScore + amount)
        : memory.successScore,
    failureScore:
      feedback === 'negative'
        ? Math.min(1, memory.failureScore + amount)
        : memory.failureScore,
  };
}

/**
 * Expire outdated memories
 */
export function expireMemories(
  memories: AtomicMemoryUnit[],
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days default
): UpdateResult[] {
  const now = Date.now();
  const results: UpdateResult[] = [];

  for (const memory of memories) {
    const age = now - new Date(memory.timestamp).getTime();

    if (age > maxAgeMs && !memory.validTo) {
      memory.validTo = new Date().toISOString();

      results.push({
        action: 'invalidated',
        memoryId: memory.memoryId,
        affectedIds: [],
        description: `Memory expired after ${Math.round(age / (24 * 60 * 60 * 1000))} days`,
      });
    }
  }

  return results;
}

/**
 * Get summary of update results
 */
export function getUpdateSummary(results: UpdateResult[]): string {
  const counts = {
    created: 0,
    updated: 0,
    merged: 0,
    invalidated: 0,
    skipped: 0,
  };

  for (const result of results) {
    counts[result.action]++;
  }

  return `Updates: ${counts.updated} updated, ${counts.merged} merged, ` +
    `${counts.invalidated} invalidated, ${counts.created} created, ${counts.skipped} skipped`;
}
