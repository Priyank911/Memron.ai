/**
 * Auto-Ingest — Shared ingestion logic for both manual and auto-capture pipelines.
 *
 * Runs the analysis pipeline and persists all results (episodes, memories,
 * recipes, entities, relationships) to the database.
 */

import { nanoid } from 'nanoid';
import {
  runPipeline,
  runPipelineSync,
  type ConversationMessage,
} from '@memron/analysis-engine';
import {
  insertEpisode,
  insertAtomicMemory,
  insertRecipe,
  insertEntity,
  getEntityByCanonicalName,
  upsertEntityRelationship,
  getUningestedConversations,
  markConversationIngested,
} from '../db/queries-analysis.js';
import { config } from '../config.js';
import { enqueueAnalysisJob } from './analysis-queue.js';

export interface AutoIngestResult {
  success: boolean;
  stats: {
    episodes: number;
    memories: number;
    recipes: number;
    entities: number;
    relationships: number;
  };
}

/**
 * Run analysis pipeline and store all results in the database.
 *
 * Used by both:
 * - `memory_ingest` MCP tool (manual)
 * - `conversation-collector` flush (automatic)
 */
export async function autoIngest(params: {
  sessionId: string;
  userId: number;
  messages: ConversationMessage[];
  useLLM?: boolean;
}): Promise<AutoIngestResult> {
  const useLLM = params.useLLM ?? false;

  const input = {
    sessionId: params.sessionId,
    userId: String(params.userId),
    messages: params.messages,
  };

  const result = useLLM
    ? await runPipeline(input, { useLLM: true, parallel: true })
    : runPipelineSync(input);

  // Store episodes
  for (const episode of result.episodes) {
    try {
      await insertEpisode({
        episodeId: episode.episodeId,
        sessionId: episode.sessionId,
        userId: params.userId,
        episodeType: episode.episodeType,
        startIndex: episode.startIndex,
        endIndex: episode.endIndex,
        outcome: episode.outcome,
        outcomeConfidence: 0.7,
        summary: episode.summary,
        rawMessages: episode.messages,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert episode ${episode.episodeId}:`, err);
    }
  }

  // Store memories
  for (const memory of result.memories) {
    try {
      await insertAtomicMemory({
        memoryId: memory.memoryId,
        userId: params.userId,
        memoryType: memory.memoryType,
        content: memory.content,
        compressedContent: memory.compressedContent,
        confidence: memory.confidence,
        successScore: memory.successScore,
        failureScore: memory.failureScore,
        transferability: memory.transferability,
        validFrom: memory.validFrom ? new Date(memory.validFrom) : new Date(),
        sharePolicy: memory.sharePolicy,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert memory ${memory.memoryId}:`, err);
    }
  }

  // Store recipes
  for (const recipe of result.recipes) {
    try {
      await insertRecipe({
        recipeId: recipe.recipeId,
        userId: params.userId,
        recipeName: recipe.recipeName,
        taskType: recipe.taskType,
        problemStatement: recipe.problemStatement,
        problemSignature: recipe.problemSignature,
        recipeContent: {
          approach: recipe.approach,
          doList: recipe.doList,
          dontList: recipe.dontList,
          prerequisites: recipe.prerequisites,
          caveats: recipe.caveats,
          failurePatterns: recipe.failurePatterns,
        },
        successRate: recipe.successRate,
        avgTokenCost: recipe.avgTokenCost,
        transferabilityScore: recipe.transferabilityScore,
        recipeVersion: recipe.recipeVersion,
        parentRecipeId: recipe.parentRecipeId,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert recipe ${recipe.recipeId}:`, err);
    }
  }

  // Store entities
  const stableEntityIds = new Map<string, string>();
  for (const entity of result.entities) {
    try {
      const existing = await getEntityByCanonicalName(entity.canonicalName, params.userId);
      const stableEntityId = existing?.entity_id || entity.entityId;
      stableEntityIds.set(entity.entityId, stableEntityId);
      await insertEntity({
        entityId: stableEntityId,
        userId: params.userId,
        name: entity.name,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
        description: entity.description,
        firstSeenIn: entity.firstSeenIn,
        mentionCount: entity.mentionCount,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert entity ${entity.entityId}:`, err);
    }
  }

  // Store explicit relationships, reinforcing an existing normalized pair.
  const explicitPairs = new Set<string>();
  for (const rel of result.relationships) {
    try {
      const sourceEntityId = stableEntityIds.get(rel.sourceEntityId) || rel.sourceEntityId;
      const targetEntityId = stableEntityIds.get(rel.targetEntityId) || rel.targetEntityId;
      const pair = [sourceEntityId, targetEntityId].sort().join('|');
      explicitPairs.add(`${pair}|${rel.relationshipType}`);
      await upsertEntityRelationship({
        relationshipId: `rel_${nanoid(12)}`,
        userId: params.userId,
        sourceEntityId,
        targetEntityId,
        relationshipType: rel.relationshipType,
        strength: rel.strength,
        confidence: rel.strength,
        edgeSource: 'explicit',
        sourceMemories: rel.sourceMemories,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert relationship:`, err);
    }
  }

  // Weak ties keep the graph useful when extraction cannot produce a predicate.
  // Bound the pair count so a long conversation cannot create an O(n²) graph.
  const cooccurrenceEntities = result.entities
    .slice()
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 12);
  const provenance = result.memories.slice(0, 5).map(memory => memory.memoryId);
  for (let i = 0; i < cooccurrenceEntities.length; i++) {
    for (let j = i + 1; j < cooccurrenceEntities.length; j++) {
      const pair = [cooccurrenceEntities[i].entityId, cooccurrenceEntities[j].entityId].sort().join('|');
      if (explicitPairs.has(`${pair}|mentioned_with`)) continue;
      const hasAnyExplicit = result.relationships.some(rel =>
        [stableEntityIds.get(rel.sourceEntityId) || rel.sourceEntityId, stableEntityIds.get(rel.targetEntityId) || rel.targetEntityId].sort().join('|') === pair,
      );
      if (hasAnyExplicit) continue;
      try {
        await upsertEntityRelationship({
          relationshipId: `rel_${nanoid(12)}`,
          userId: params.userId,
          sourceEntityId: stableEntityIds.get(cooccurrenceEntities[i].entityId) || cooccurrenceEntities[i].entityId,
          targetEntityId: stableEntityIds.get(cooccurrenceEntities[j].entityId) || cooccurrenceEntities[j].entityId,
          relationshipType: 'mentioned_with',
          strength: 0.2,
          confidence: 0.2,
          edgeSource: 'co_occurrence',
          sourceMemories: provenance,
        });
      } catch (err) {
        console.warn('[AutoIngest] Failed to insert co-occurrence relationship:', err);
      }
    }
  }

  return {
    success: true,
    stats: {
      episodes: result.episodes.length,
      memories: result.memories.length,
      recipes: result.recipes.length,
      entities: result.entities.length,
      relationships: result.relationships.length,
    },
  };
}

/**
 * Recover un-ingested conversations on startup (crash recovery).
 * Processes any conversations that were captured but never analyzed.
 */
export async function recoverUningestedConversations(): Promise<void> {
  if (!config.autoIngest.enabled) return;

  try {
    const conversations = await getUningestedConversations(20);
    if (conversations.length === 0) return;

    console.log(`[AutoIngest] Recovering ${conversations.length} un-ingested conversation(s)...`);

    for (const conv of conversations) {
      try {
        const messages = (conv.messages as ConversationMessage[]) || [];
        if (messages.length < 2) {
          await markConversationIngested(conv.session_id);
          continue;
        }

        await enqueueAnalysisJob({
          sessionId: conv.session_id,
          userId: conv.user_id!,
          messages,
        });
        console.log(`[AutoIngest] Re-queued session ${conv.session_id}`);
      } catch (err) {
        console.warn(`[AutoIngest] Failed to recover session ${conv.session_id}:`, err);
      }
    }
  } catch (err) {
    console.warn('[AutoIngest] Recovery check failed:', err);
  }
}
