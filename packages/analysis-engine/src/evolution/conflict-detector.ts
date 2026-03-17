/**
 * Conflict Detector
 * Detects conflicts and relationships between memories
 */

import { analyze } from '../llm/groq-client';
import { CONFLICT_DETECTION_PROMPT } from '../llm/prompts';
import type {
  AtomicMemoryUnit,
  MemoryRelation,
  MemoryUpdate,
  ConflictResolution,
} from '../types';

export interface ConflictDetectorConfig {
  useHeuristics?: boolean;
  useLLM?: boolean;
  similarityThreshold?: number;
}

interface LLMConflictResult {
  hasConflict: boolean;
  conflictType: 'contradiction' | 'update' | 'overlap' | 'none';
  relation: MemoryRelation | 'independent';
  resolution: 'keep_newer' | 'keep_older' | 'merge' | 'manual_review';
  confidence: number;
  evidence: string;
  mergedContent?: string;
}

const DEFAULT_CONFIG: Required<ConflictDetectorConfig> = {
  useHeuristics: true,
  useLLM: true,
  similarityThreshold: 0.7,
};

/**
 * Calculate simple similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Detect if two memories are about the same topic
 */
function areSameTopic(memory1: AtomicMemoryUnit, memory2: AtomicMemoryUnit): boolean {
  // Same memory type increases likelihood
  if (memory1.memoryType !== memory2.memoryType) {
    return false;
  }

  // Check content similarity
  const similarity = calculateSimilarity(
    memory1.compressedContent,
    memory2.compressedContent
  );

  return similarity > 0.4;
}

/**
 * Detect contradiction patterns
 */
function detectContradictionPatterns(
  content1: string,
  content2: string
): { isContradiction: boolean; evidence: string } {
  const c1 = content1.toLowerCase();
  const c2 = content2.toLowerCase();

  // Direct negation patterns
  const negationPairs = [
    ['prefer', "don't prefer"],
    ['use', "don't use"],
    ['should', "shouldn't"],
    ['must', "mustn't"],
    ['always', 'never'],
    ['enable', 'disable'],
    ['true', 'false'],
    ['yes', 'no'],
  ];

  for (const [pos, neg] of negationPairs) {
    if ((c1.includes(pos) && c2.includes(neg)) || (c1.includes(neg) && c2.includes(pos))) {
      return {
        isContradiction: true,
        evidence: `Contradicting ${pos}/${neg} statements`,
      };
    }
  }

  // Opposite preference patterns
  if (c1.includes('prefer') && c2.includes('prefer')) {
    // Extract what's preferred
    const match1 = c1.match(/prefer\s+(\w+)/);
    const match2 = c2.match(/prefer\s+(\w+)/);

    if (match1 && match2 && match1[1] !== match2[1]) {
      return {
        isContradiction: true,
        evidence: `Different preferences: ${match1[1]} vs ${match2[1]}`,
      };
    }
  }

  return { isContradiction: false, evidence: '' };
}

/**
 * Detect update relationship
 */
function detectUpdateRelation(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): { isUpdate: boolean; evidence: string } {
  // Newer memory with same topic is likely an update
  const time1 = new Date(memory1.timestamp).getTime();
  const time2 = new Date(memory2.timestamp).getTime();

  if (Math.abs(time1 - time2) < 1000) {
    // Same time, not an update
    return { isUpdate: false, evidence: '' };
  }

  // Check if one extends the other
  const c1 = memory1.compressedContent.toLowerCase();
  const c2 = memory2.compressedContent.toLowerCase();

  // Look for update indicators
  const updateIndicators = ['now', 'changed to', 'updated', 'instead', 'actually'];

  for (const indicator of updateIndicators) {
    if (c1.includes(indicator) || c2.includes(indicator)) {
      return {
        isUpdate: true,
        evidence: `Contains update indicator: "${indicator}"`,
      };
    }
  }

  return { isUpdate: false, evidence: '' };
}

/**
 * Detect extension relationship
 */
function detectExtensionRelation(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): { isExtension: boolean; evidence: string } {
  const c1 = memory1.compressedContent.toLowerCase();
  const c2 = memory2.compressedContent.toLowerCase();

  // Check if one is a subset of the other
  const words1 = c1.split(/\s+/).filter((w) => w.length > 3);
  const words2 = c2.split(/\s+/).filter((w) => w.length > 3);

  const overlap = words1.filter((w) => words2.includes(w));

  // If most of shorter content is in longer, it's an extension
  const shorterLength = Math.min(words1.length, words2.length);
  if (shorterLength > 0 && overlap.length / shorterLength > 0.7) {
    const longerMemory =
      memory1.compressedContent.length > memory2.compressedContent.length
        ? memory1
        : memory2;

    return {
      isExtension: true,
      evidence: `${longerMemory.memoryId} extends with additional details`,
    };
  }

  // Extension indicators
  const extensionIndicators = ['also', 'additionally', 'furthermore', 'and also', 'as well as'];

  for (const indicator of extensionIndicators) {
    if (c1.includes(indicator) || c2.includes(indicator)) {
      return {
        isExtension: true,
        evidence: `Contains extension indicator: "${indicator}"`,
      };
    }
  }

  return { isExtension: false, evidence: '' };
}

/**
 * Detect relationship using heuristics
 */
function detectRelationHeuristic(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): { relation: MemoryRelation | 'independent'; evidence: string; confidence: number } {
  // First check if they're about the same topic
  if (!areSameTopic(memory1, memory2)) {
    return { relation: 'independent', evidence: 'Different topics', confidence: 0.8 };
  }

  // Check for contradiction
  const contradiction = detectContradictionPatterns(
    memory1.compressedContent,
    memory2.compressedContent
  );
  if (contradiction.isContradiction) {
    return {
      relation: 'contradicts',
      evidence: contradiction.evidence,
      confidence: 0.85,
    };
  }

  // Check for update
  const update = detectUpdateRelation(memory1, memory2);
  if (update.isUpdate) {
    return { relation: 'updates', evidence: update.evidence, confidence: 0.75 };
  }

  // Check for extension
  const extension = detectExtensionRelation(memory1, memory2);
  if (extension.isExtension) {
    return { relation: 'extends', evidence: extension.evidence, confidence: 0.7 };
  }

  // Default: might be related but no clear relationship
  return { relation: 'independent', evidence: 'No clear relationship', confidence: 0.5 };
}

/**
 * Detect relationship using LLM
 */
async function detectRelationLLM(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): Promise<LLMConflictResult> {
  const prompt = CONFLICT_DETECTION_PROMPT
    .replace('{memory1}', memory1.compressedContent)
    .replace('{memory2}', memory2.compressedContent);

  const result = await analyze<LLMConflictResult>(prompt, '');
  return result.data;
}

/**
 * Detect conflict or relationship between two memories
 */
export async function detectConflict(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit,
  config: ConflictDetectorConfig = {}
): Promise<MemoryUpdate | null> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Heuristic detection
  let result: {
    relation: MemoryRelation | 'independent';
    evidence: string;
    confidence: number;
  };

  if (fullConfig.useHeuristics) {
    result = detectRelationHeuristic(memory1, memory2);

    // If confident enough without LLM, return early
    if (result.confidence > 0.8 || result.relation === 'independent') {
      if (result.relation === 'independent') {
        return null;
      }

      return {
        newMemoryId: memory2.memoryId,
        affectedMemoryId: memory1.memoryId,
        relation: result.relation,
        confidence: result.confidence,
        evidence: result.evidence,
      };
    }
  }

  // LLM detection for nuanced cases
  if (fullConfig.useLLM) {
    try {
      const llmResult = await detectRelationLLM(memory1, memory2);

      if (!llmResult.hasConflict || llmResult.relation === 'independent') {
        return null;
      }

      return {
        newMemoryId: memory2.memoryId,
        affectedMemoryId: memory1.memoryId,
        relation: llmResult.relation as MemoryRelation,
        confidence: llmResult.confidence,
        evidence: llmResult.evidence,
      };
    } catch (error) {
      console.warn('LLM conflict detection failed:', error);
    }
  }

  // Fall back to heuristic result
  if (result!.relation === 'independent') {
    return null;
  }

  return {
    newMemoryId: memory2.memoryId,
    affectedMemoryId: memory1.memoryId,
    relation: result!.relation,
    confidence: result!.confidence,
    evidence: result!.evidence,
  };
}

/**
 * Detect conflicts synchronously using heuristics
 */
export function detectConflictSync(
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit,
  config: ConflictDetectorConfig = {}
): MemoryUpdate | null {
  const result = detectRelationHeuristic(memory1, memory2);

  if (result.relation === 'independent') {
    return null;
  }

  return {
    newMemoryId: memory2.memoryId,
    affectedMemoryId: memory1.memoryId,
    relation: result.relation,
    confidence: result.confidence,
    evidence: result.evidence,
  };
}

/**
 * Suggest resolution for a conflict
 */
export function suggestResolution(
  update: MemoryUpdate,
  memory1: AtomicMemoryUnit,
  memory2: AtomicMemoryUnit
): ConflictResolution {
  const time1 = new Date(memory1.timestamp).getTime();
  const time2 = new Date(memory2.timestamp).getTime();

  let resolution: 'keep_newer' | 'keep_older' | 'merge' | 'manual_review';
  let confidence = 0.6;

  switch (update.relation) {
    case 'updates':
    case 'invalidates':
      // Newer should supersede
      resolution = 'keep_newer';
      confidence = 0.85;
      break;

    case 'extends':
      // Merge both
      resolution = 'merge';
      confidence = 0.8;
      break;

    case 'contradicts':
      // For contradictions, prefer newer but with lower confidence
      if (memory2.confidence > memory1.confidence) {
        resolution = 'keep_newer';
        confidence = 0.6;
      } else if (memory1.confidence > memory2.confidence) {
        resolution = 'keep_older';
        confidence = 0.6;
      } else {
        resolution = 'manual_review';
        confidence = 0.4;
      }
      break;

    default:
      resolution = 'manual_review';
      confidence = 0.3;
  }

  return {
    conflictId: `conflict_${Date.now()}`,
    memory1Id: memory1.memoryId,
    memory2Id: memory2.memoryId,
    conflictType:
      update.relation === 'contradicts'
        ? 'contradiction'
        : update.relation === 'updates'
          ? 'update'
          : 'overlap',
    resolution,
    resolvedMemoryId:
      resolution === 'keep_newer'
        ? memory2.memoryId
        : resolution === 'keep_older'
          ? memory1.memoryId
          : undefined,
    confidence,
  };
}

/**
 * Find all conflicts in a set of memories
 */
export async function findAllConflicts(
  memories: AtomicMemoryUnit[],
  config: ConflictDetectorConfig = {}
): Promise<MemoryUpdate[]> {
  const updates: MemoryUpdate[] = [];

  // Pre-filter: only compare memories of the same type (conflicts only occur within same type)
  const byType = new Map<string, AtomicMemoryUnit[]>();
  for (const mem of memories) {
    const group = byType.get(mem.memoryType) || [];
    group.push(mem);
    byType.set(mem.memoryType, group);
  }

  for (const group of byType.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const update = await detectConflict(group[i], group[j], config);
        if (update) {
          updates.push(update);
        }
      }
    }
  }

  return updates;
}

/**
 * Find conflicts synchronously
 */
export function findAllConflictsSync(
  memories: AtomicMemoryUnit[],
  config: ConflictDetectorConfig = {}
): MemoryUpdate[] {
  const updates: MemoryUpdate[] = [];

  // Pre-filter: only compare memories of the same type
  const byType = new Map<string, AtomicMemoryUnit[]>();
  for (const mem of memories) {
    const group = byType.get(mem.memoryType) || [];
    group.push(mem);
    byType.set(mem.memoryType, group);
  }

  for (const group of byType.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const update = detectConflictSync(group[i], group[j], config);
        if (update) {
          updates.push(update);
        }
      }
    }
  }

  return updates;
}
