/**
 * Memory Packet Builder
 * Builds structured, anti-hallucination memory packets for agent context
 */

import { nanoid } from 'nanoid';
import {
  searchAtomicMemories,
  searchAtomicMemoriesByVector,
  searchRecipes,
  searchRecipesByVector,
  searchEntities,
  getEntityRelationships,
  getEntityRelationshipsBatch,
  type AtomicMemoryRow,
  type RecipeRow,
  type EntityRow,
  type EntityRelationshipRow,
} from '../db/queries-analysis.js';
import {
  verifyMemorySet,
  assessHallucinationRisk,
  filterByVerificationThreshold,
  getResponseWarnings,
  suggestVerificationSteps,
  type VerifiedMemory,
  type HallucinationRisk,
} from './anti-hallucination.js';
import { query } from '../db/client.js';

export interface MemoryPacket {
  packetId: string;
  generatedAt: string;

  // Context content
  userPreferences: string[];
  priorSuccessfulRecipe: RecipeContent | null;
  knownFailuresToAvoid: string[];
  latestFactualUpdates: string[];
  unresolvedSteps: string[];
  relevantEntities: EntityInfo[];

  // Source evidence
  linkedSources: LinkedSource[];

  // Compressed continuation context
  continuationSummary: string;

  // Warnings and verification
  warnings: string[];
  hallucinationRisk: HallucinationRisk;
  verificationSteps: string[];

  // Token accounting
  tokenUsage: {
    total: number;
    budget: number;
    bySection: Record<string, number>;
  };
}

interface RecipeContent {
  recipeId: string;
  recipeName: string;
  taskType: string;
  problemStatement: string;
  approach: unknown[];
  doList: string[];
  dontList: string[];
  successRate: number;
}

interface EntityInfo {
  name: string;
  type: string;
  description: string | null;
  relationships: string[];
}

interface LinkedSource {
  memoryId: string;
  memoryType: string;
  confidence: number;
  relevance: number;
  summary: string;
}

export interface PacketBuildOptions {
  userId: number;
  query: string;
  embedding?: number[];
  tokenBudget?: number;
  minConfidence?: number;
  includePreferences?: boolean;
  includeRecipes?: boolean;
  includeEntities?: boolean;
  includeFailures?: boolean;
  maxMemories?: number;
  maxRecipes?: number;
  maxEntities?: number;
}

const DEFAULT_OPTIONS: Required<Omit<PacketBuildOptions, 'userId' | 'query' | 'embedding'>> = {
  tokenBudget: 2000,
  minConfidence: 0.4,
  includePreferences: true,
  includeRecipes: true,
  includeEntities: true,
  includeFailures: true,
  maxMemories: 20,
  maxRecipes: 3,
  maxEntities: 10,
};

/**
 * Build a memory packet for a given query
 */
export async function buildMemoryPacket(
  options: PacketBuildOptions
): Promise<MemoryPacket> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tokenBudget = opts.tokenBudget;
  const tokenUsage: Record<string, number> = {};
  let totalTokens = 0;

  // Step 1: Retrieve relevant memories
  let memories: AtomicMemoryRow[] = [];

  if (options.embedding) {
    const vectorResults = await searchAtomicMemoriesByVector({
      userId: opts.userId,
      embedding: options.embedding,
      limit: opts.maxMemories,
      minSimilarity: 0.5,
    });
    memories = vectorResults;
  } else {
    memories = await searchAtomicMemories({
      userId: opts.userId,
      minConfidence: opts.minConfidence,
      limit: opts.maxMemories,
    });
  }

  // Step 2: Verify and filter memories
  const verifiedMemories = verifyMemorySet(memories);
  const validMemories = filterByVerificationThreshold(verifiedMemories, opts.minConfidence);

  // Step 3: Categorize memories
  const preferences: string[] = [];
  const facts: string[] = [];
  const failures: string[] = [];
  const unresolvedSteps: string[] = [];
  const linkedSources: LinkedSource[] = [];

  for (const verified of validMemories) {
    const mem = verified.memory;
    const summary = mem.compressed_content || mem.content.slice(0, 200);
    const tokens = estimateTokens(summary);

    if (totalTokens + tokens > tokenBudget * 0.6) break; // Reserve space for recipes & entities

    linkedSources.push({
      memoryId: mem.memory_id,
      memoryType: mem.memory_type,
      confidence: mem.confidence,
      relevance: verified.verificationScore,
      summary,
    });

    if (mem.memory_type === 'preference' && opts.includePreferences) {
      preferences.push(summary);
      tokenUsage['preferences'] = (tokenUsage['preferences'] || 0) + tokens;
    } else if (mem.memory_type === 'fact') {
      facts.push(summary);
      tokenUsage['facts'] = (tokenUsage['facts'] || 0) + tokens;
    } else if (
      (mem.memory_type === 'observed_failure' || mem.failure_score > 0.7) &&
      opts.includeFailures
    ) {
      failures.push(summary);
      tokenUsage['failures'] = (tokenUsage['failures'] || 0) + tokens;
    } else if (mem.memory_type === 'attempted_action' && mem.success_score < 0.5) {
      unresolvedSteps.push(summary);
      tokenUsage['unresolved'] = (tokenUsage['unresolved'] || 0) + tokens;
    }

    totalTokens += tokens;
  }

  // Step 4: Retrieve relevant recipes
  let priorRecipe: RecipeContent | null = null;
  const recipes: RecipeRow[] = [];

  if (opts.includeRecipes) {
    if (options.embedding) {
      const recipeResults = await searchRecipesByVector({
        userId: opts.userId,
        embedding: options.embedding,
        limit: opts.maxRecipes,
      });
      recipes.push(...recipeResults);
    } else {
      const recipeResults = await searchRecipes({
        userId: opts.userId,
        minSuccessRate: 0.5,
        limit: opts.maxRecipes,
      });
      recipes.push(...recipeResults);
    }

    if (recipes.length > 0) {
      const bestRecipe = recipes[0];
      const recipeContent = bestRecipe.recipe_content as {
        approach?: unknown[];
        doList?: string[];
        dontList?: string[];
      };

      priorRecipe = {
        recipeId: bestRecipe.recipe_id,
        recipeName: bestRecipe.recipe_name,
        taskType: bestRecipe.task_type,
        problemStatement: bestRecipe.problem_statement,
        approach: recipeContent.approach || [],
        doList: recipeContent.doList || [],
        dontList: recipeContent.dontList || [],
        successRate: bestRecipe.success_rate,
      };

      const recipeTokens = estimateTokens(JSON.stringify(priorRecipe));
      tokenUsage['recipe'] = recipeTokens;
      totalTokens += recipeTokens;
    }
  }

  // Step 5: Retrieve relevant entities
  const entities: EntityInfo[] = [];

  if (opts.includeEntities) {
    const entityResults = await searchEntities({
      userId: opts.userId,
      searchTerm: extractMainTerm(opts.query),
      limit: opts.maxEntities,
    });

    // Batch fetch all relationships for found entities
    const allRelationships = await getEntityRelationshipsBatch(
      entityResults.map(e => e.entity_id),
      opts.userId
    );

    // Group relationships by entity
    const relsByEntity = new Map<string, EntityRelationshipRow[]>();
    for (const rel of allRelationships) {
      for (const entityId of [rel.source_entity_id, rel.target_entity_id]) {
        if (!relsByEntity.has(entityId)) relsByEntity.set(entityId, []);
        relsByEntity.get(entityId)!.push(rel);
      }
    }

    for (const entity of entityResults) {
      if (totalTokens >= tokenBudget * 0.9) break;

      const relationships = relsByEntity.get(entity.entity_id) || [];
      const relDescriptions = relationships
        .slice(0, 3)
        .map(r => `${r.relationship_type || 'related'}: ${r.target_entity_id}`);

      entities.push({
        name: entity.name,
        type: entity.entity_type || 'unknown',
        description: entity.description,
        relationships: relDescriptions,
      });

      const entityTokens = estimateTokens(JSON.stringify(entities[entities.length - 1]));
      tokenUsage['entities'] = (tokenUsage['entities'] || 0) + entityTokens;
      totalTokens += entityTokens;
    }
  }

  // Step 6: Assess hallucination risk
  const risk = assessHallucinationRisk(opts.query, memories, recipes, entities as unknown as EntityRow[]);
  const warnings = getResponseWarnings(validMemories, risk);
  const verificationSteps = suggestVerificationSteps(risk, validMemories);

  // Step 7: Build continuation summary
  const continuationSummary = buildContinuationSummary(
    preferences,
    facts,
    priorRecipe,
    failures
  );
  tokenUsage['summary'] = estimateTokens(continuationSummary);
  totalTokens += tokenUsage['summary'];

  return {
    packetId: `pkt_${nanoid(12)}`,
    generatedAt: new Date().toISOString(),
    userPreferences: preferences,
    priorSuccessfulRecipe: priorRecipe,
    knownFailuresToAvoid: failures,
    latestFactualUpdates: facts,
    unresolvedSteps,
    relevantEntities: entities,
    linkedSources,
    continuationSummary,
    warnings,
    hallucinationRisk: risk,
    verificationSteps,
    tokenUsage: {
      total: totalTokens,
      budget: tokenBudget,
      bySection: tokenUsage,
    },
  };
}

/**
 * Build a compact memory packet (for smaller context windows)
 */
export async function buildCompactPacket(
  options: PacketBuildOptions
): Promise<MemoryPacket> {
  return buildMemoryPacket({
    ...options,
    tokenBudget: Math.min(options.tokenBudget || 500, 500),
    maxMemories: 5,
    maxRecipes: 1,
    maxEntities: 3,
    includeFailures: false,
  });
}

/**
 * Build continuation summary from extracted content
 */
function buildContinuationSummary(
  preferences: string[],
  facts: string[],
  recipe: RecipeContent | null,
  failures: string[]
): string {
  const parts: string[] = [];

  if (preferences.length > 0) {
    parts.push(`User preferences: ${preferences.slice(0, 3).join('; ')}`);
  }

  if (facts.length > 0) {
    parts.push(`Key facts: ${facts.slice(0, 3).join('; ')}`);
  }

  if (recipe) {
    parts.push(`Prior successful approach (${Math.round(recipe.successRate * 100)}% success): ${recipe.recipeName}`);
  }

  if (failures.length > 0) {
    parts.push(`Avoid: ${failures.slice(0, 2).join('; ')}`);
  }

  return parts.join('. ') || 'No prior context available.';
}

/**
 * Extract main search term from query
 */
function extractMainTerm(query: string): string {
  // Simple extraction - get longest word or quoted phrase
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  const words = query.split(/\s+/).filter(w => w.length > 3);
  return words.sort((a, b) => b.length - a.length)[0] || query.slice(0, 20);
}

/**
 * Estimate token count for a string
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format packet for prompt injection
 */
export function formatPacketForPrompt(packet: MemoryPacket): string {
  const sections: string[] = [];

  sections.push('<memory_context>');

  if (packet.userPreferences.length > 0) {
    sections.push('<preferences>');
    sections.push(packet.userPreferences.join('\n'));
    sections.push('</preferences>');
  }

  if (packet.priorSuccessfulRecipe) {
    sections.push('<prior_recipe>');
    sections.push(`Name: ${packet.priorSuccessfulRecipe.recipeName}`);
    sections.push(`Task: ${packet.priorSuccessfulRecipe.taskType}`);
    sections.push(`Success rate: ${Math.round(packet.priorSuccessfulRecipe.successRate * 100)}%`);
    if (packet.priorSuccessfulRecipe.doList.length > 0) {
      sections.push(`Do: ${packet.priorSuccessfulRecipe.doList.join(', ')}`);
    }
    if (packet.priorSuccessfulRecipe.dontList.length > 0) {
      sections.push(`Avoid: ${packet.priorSuccessfulRecipe.dontList.join(', ')}`);
    }
    sections.push('</prior_recipe>');
  }

  if (packet.latestFactualUpdates.length > 0) {
    sections.push('<facts>');
    sections.push(packet.latestFactualUpdates.join('\n'));
    sections.push('</facts>');
  }

  if (packet.knownFailuresToAvoid.length > 0) {
    sections.push('<avoid>');
    sections.push(packet.knownFailuresToAvoid.join('\n'));
    sections.push('</avoid>');
  }

  if (packet.warnings.length > 0) {
    sections.push('<warnings>');
    sections.push(packet.warnings.join('\n'));
    sections.push('</warnings>');
  }

  sections.push('</memory_context>');

  return sections.join('\n');
}

/**
 * Store packet for later retrieval
 */
export async function storePacket(
  packet: MemoryPacket,
  userId: number
): Promise<void> {
  await query(
    `INSERT INTO memory_packets (
      packet_id, user_id, query_embedding, packet_content,
      token_count, risk_level, source_memory_ids
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      packet.packetId,
      userId,
      null, // Would store embedding if available
      JSON.stringify(packet),
      packet.tokenUsage.total,
      packet.hallucinationRisk.level,
      packet.linkedSources.map(s => s.memoryId),
    ]
  );
}

/**
 * Get packet by ID
 */
export async function getPacket(
  packetId: string,
  userId: number
): Promise<MemoryPacket | null> {
  const result = await query<{ packet_content: unknown }>(
    `SELECT packet_content FROM memory_packets WHERE packet_id = $1 AND user_id = $2`,
    [packetId, userId]
  );

  if (result.rows.length === 0) return null;

  return result.rows[0].packet_content as MemoryPacket;
}
