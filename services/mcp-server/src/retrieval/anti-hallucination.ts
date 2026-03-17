/**
 * Anti-Hallucination Module
 * Validates and filters retrieved content to reduce hallucination risk
 */

import type { AtomicMemoryRow, RecipeRow, EntityRow } from '../db/queries-analysis.js';

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  warnings: string[];
  corrections: string[];
}

export interface VerifiedMemory {
  memory: AtomicMemoryRow;
  verificationScore: number;
  consistencyChecks: {
    temporalConsistency: boolean;
    sourceVerified: boolean;
    noContradictions: boolean;
  };
}

export interface HallucinationRisk {
  level: 'low' | 'medium' | 'high';
  factors: string[];
  mitigations: string[];
}

/**
 * Validate memory content for potential hallucination indicators
 */
export function validateMemory(memory: AtomicMemoryRow): ValidationResult {
  const warnings: string[] = [];
  const corrections: string[] = [];
  let confidence = memory.confidence;

  // Check for suspicious patterns
  const content = memory.content.toLowerCase();

  // Vague or uncertain language
  if (/\b(maybe|perhaps|probably|might|could be|i think)\b/.test(content)) {
    warnings.push('Contains uncertain language');
    confidence *= 0.8;
  }

  // Specific but unverifiable claims
  if (/\b(always|never|every|all|none)\b/.test(content) && memory.confidence < 0.8) {
    warnings.push('Contains absolute claims with low confidence');
    confidence *= 0.7;
  }

  // Check for temporal validity
  if (memory.valid_to && new Date(memory.valid_to) < new Date()) {
    warnings.push('Memory has expired');
    confidence *= 0.5;
    corrections.push('Consider refreshing this information');
  }

  // Check for low success score on factual memories
  if (memory.memory_type === 'fact' && memory.success_score < 0.5) {
    warnings.push('Factual memory has low success score');
    confidence *= 0.7;
  }

  // Check for contradiction indicators
  if (memory.supersedes_memory_id) {
    corrections.push('This memory supersedes an older version');
  }

  return {
    isValid: confidence > 0.3,
    confidence: Math.max(0, Math.min(1, confidence)),
    warnings,
    corrections,
  };
}

/**
 * Verify a set of memories for consistency
 */
export function verifyMemorySet(memories: AtomicMemoryRow[]): VerifiedMemory[] {
  const verified: VerifiedMemory[] = [];

  for (const memory of memories) {
    const validation = validateMemory(memory);

    // Check for contradictions with other memories
    const contradictions = findContradictions(memory, memories);
    const hasContradictions = contradictions.length > 0;

    // Check temporal consistency
    const temporallyConsistent = checkTemporalConsistency(memory, memories);

    // Check if source is verified
    const sourceVerified = memory.episode_id !== null || memory.source_span_start > 0;

    const verificationScore = calculateVerificationScore(
      validation.confidence,
      !hasContradictions,
      temporallyConsistent,
      sourceVerified
    );

    verified.push({
      memory,
      verificationScore,
      consistencyChecks: {
        temporalConsistency: temporallyConsistent,
        sourceVerified,
        noContradictions: !hasContradictions,
      },
    });
  }

  return verified.sort((a, b) => b.verificationScore - a.verificationScore);
}

/**
 * Find contradictions between memories
 */
function findContradictions(
  target: AtomicMemoryRow,
  allMemories: AtomicMemoryRow[]
): AtomicMemoryRow[] {
  const contradictions: AtomicMemoryRow[] = [];

  for (const other of allMemories) {
    if (other.memory_id === target.memory_id) continue;
    if (other.memory_type !== target.memory_type) continue;

    // Check if same topic but different conclusions
    if (target.supersedes_memory_id === other.memory_id) {
      continue; // This is expected, not a contradiction
    }

    // Simple overlap check - in production would use embedding similarity
    const targetWords = new Set(target.content.toLowerCase().split(/\s+/));
    const otherWords = new Set(other.content.toLowerCase().split(/\s+/));
    const overlap = [...targetWords].filter(w => otherWords.has(w)).length;
    const overlapRatio = overlap / Math.min(targetWords.size, otherWords.size);

    if (overlapRatio > 0.5) {
      // High topic overlap, check for contradicting signals
      if (
        (target.success_score > 0.7 && other.failure_score > 0.7) ||
        (target.failure_score > 0.7 && other.success_score > 0.7)
      ) {
        contradictions.push(other);
      }
    }
  }

  return contradictions;
}

/**
 * Check temporal consistency of a memory
 */
function checkTemporalConsistency(
  target: AtomicMemoryRow,
  allMemories: AtomicMemoryRow[]
): boolean {
  const targetDate = new Date(target.valid_from);

  for (const other of allMemories) {
    if (other.memory_id === target.memory_id) continue;
    if (target.supersedes_memory_id !== other.memory_id) continue;

    // If target supersedes other, target should be newer
    const otherDate = new Date(other.valid_from);
    if (targetDate < otherDate) {
      return false; // Temporal inconsistency
    }
  }

  return true;
}

/**
 * Calculate verification score
 */
function calculateVerificationScore(
  confidence: number,
  noContradictions: boolean,
  temporallyConsistent: boolean,
  sourceVerified: boolean
): number {
  let score = confidence * 0.5;

  if (noContradictions) score += 0.2;
  if (temporallyConsistent) score += 0.15;
  if (sourceVerified) score += 0.15;

  return Math.max(0, Math.min(1, score));
}

/**
 * Assess hallucination risk for a query response
 */
export function assessHallucinationRisk(
  query: string,
  retrievedMemories: AtomicMemoryRow[],
  retrievedRecipes: RecipeRow[],
  retrievedEntities: EntityRow[]
): HallucinationRisk {
  const factors: string[] = [];
  const mitigations: string[] = [];
  let riskScore = 0;

  // Check if we have relevant context
  if (retrievedMemories.length === 0 && retrievedRecipes.length === 0) {
    factors.push('No relevant memories or recipes found');
    riskScore += 0.4;
    mitigations.push('Request more context or clarification');
  }

  // Check memory quality
  const avgMemoryConfidence = retrievedMemories.length > 0
    ? retrievedMemories.reduce((sum, m) => sum + m.confidence, 0) / retrievedMemories.length
    : 0;

  if (avgMemoryConfidence < 0.5 && retrievedMemories.length > 0) {
    factors.push('Low average memory confidence');
    riskScore += 0.2;
    mitigations.push('Verify claims against source documents');
  }

  // Check for expired content
  const expiredCount = retrievedMemories.filter(
    m => m.valid_to && new Date(m.valid_to) < new Date()
  ).length;

  if (expiredCount > 0) {
    factors.push(`${expiredCount} memory/memories have expired`);
    riskScore += 0.1 * expiredCount;
    mitigations.push('Update or refresh expired information');
  }

  // Check entity coverage
  const queryEntities = extractQueryEntities(query);
  const knownEntities = new Set(retrievedEntities.map(e => e.canonical_name?.toLowerCase()));
  const unknownEntities = queryEntities.filter(e => !knownEntities.has(e.toLowerCase()));

  if (unknownEntities.length > 0) {
    factors.push(`Unknown entities in query: ${unknownEntities.join(', ')}`);
    riskScore += 0.15 * unknownEntities.length;
    mitigations.push('Research unknown entities before responding');
  }

  // Check recipe success rates
  const lowSuccessRecipes = retrievedRecipes.filter(r => r.success_rate < 0.5);
  if (lowSuccessRecipes.length > 0) {
    factors.push('Some recipes have low success rates');
    riskScore += 0.1;
    mitigations.push('Consider alternative approaches with better success rates');
  }

  // Determine risk level
  let level: HallucinationRisk['level'];
  if (riskScore >= 0.6) {
    level = 'high';
  } else if (riskScore >= 0.3) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, factors, mitigations };
}

/**
 * Extract potential entity names from a query
 */
function extractQueryEntities(query: string): string[] {
  const entities: string[] = [];

  // Extract quoted strings
  const quoted = query.match(/"([^"]+)"/g);
  if (quoted) {
    entities.push(...quoted.map(q => q.replace(/"/g, '')));
  }

  // Extract capitalized words (potential proper nouns)
  const capitalized = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
  if (capitalized) {
    entities.push(...capitalized);
  }

  // Extract tech terms
  const techPatterns = [
    /\b[A-Za-z]+\.[A-Za-z]+\b/g,  // File extensions, packages
    /\b[A-Za-z]+(?:JS|TS|API|SDK|CLI|UI)\b/gi,  // Tech suffixes
    /\b(?:http|https|ftp):\/\/[^\s]+/g,  // URLs
  ];

  for (const pattern of techPatterns) {
    const matches = query.match(pattern);
    if (matches) entities.push(...matches);
  }

  return [...new Set(entities)];
}

/**
 * Filter memories by verification threshold
 */
export function filterByVerificationThreshold(
  memories: VerifiedMemory[],
  threshold: number = 0.5
): VerifiedMemory[] {
  return memories.filter(m => m.verificationScore >= threshold);
}

/**
 * Get anti-hallucination warnings for a response
 */
export function getResponseWarnings(
  verifiedMemories: VerifiedMemory[],
  risk: HallucinationRisk
): string[] {
  const warnings: string[] = [];

  // Risk-based warnings
  if (risk.level === 'high') {
    warnings.push('HIGH HALLUCINATION RISK: Verify all claims before use');
  } else if (risk.level === 'medium') {
    warnings.push('Some information may require verification');
  }

  // Memory-specific warnings
  const unverifiedCount = verifiedMemories.filter(
    m => !m.consistencyChecks.sourceVerified
  ).length;

  if (unverifiedCount > 0) {
    warnings.push(`${unverifiedCount} memory/memories lack source verification`);
  }

  const contradictionCount = verifiedMemories.filter(
    m => !m.consistencyChecks.noContradictions
  ).length;

  if (contradictionCount > 0) {
    warnings.push(`${contradictionCount} memory/memories have potential contradictions`);
  }

  return warnings;
}

/**
 * Suggest verification steps for high-risk content
 */
export function suggestVerificationSteps(
  risk: HallucinationRisk,
  verifiedMemories: VerifiedMemory[]
): string[] {
  const steps: string[] = [];

  if (risk.level === 'low' && verifiedMemories.every(m => m.verificationScore > 0.7)) {
    return ['No additional verification needed'];
  }

  // Add risk mitigations as steps
  steps.push(...risk.mitigations);

  // Add memory-specific verification steps
  const unverifiedMemories = verifiedMemories.filter(
    m => !m.consistencyChecks.sourceVerified
  );

  if (unverifiedMemories.length > 0) {
    steps.push('Verify unverified memories against original sources');
  }

  const inconsistentMemories = verifiedMemories.filter(
    m => !m.consistencyChecks.temporalConsistency
  );

  if (inconsistentMemories.length > 0) {
    steps.push('Resolve temporal inconsistencies in memory chain');
  }

  return steps;
}
