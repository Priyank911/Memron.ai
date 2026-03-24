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
  insertEntityRelationship,
  getUningestedConversations,
  markConversationIngested,
} from '../db/queries-analysis.js';
import { config } from '../config.js';

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
  for (const entity of result.entities) {
    try {
      await insertEntity({
        entityId: entity.entityId,
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

  // Store relationships
  for (const rel of result.relationships) {
    try {
      await insertEntityRelationship({
        relationshipId: `rel_${nanoid(12)}`,
        userId: params.userId,
        sourceEntityId: rel.sourceEntityId,
        targetEntityId: rel.targetEntityId,
        relationshipType: rel.relationshipType,
        strength: rel.strength,
        evidenceCount: rel.evidenceCount,
        sourceMemories: rel.sourceMemories,
      });
    } catch (err) {
      console.warn(`[AutoIngest] Failed to insert relationship:`, err);
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

        await autoIngest({
          sessionId: conv.session_id,
          userId: conv.user_id!,
          messages,
          useLLM: config.autoIngest.useLLM,
        });

        await markConversationIngested(conv.session_id);
        console.log(`[AutoIngest] Recovered session ${conv.session_id}`);
      } catch (err) {
        console.warn(`[AutoIngest] Failed to recover session ${conv.session_id}:`, err);
      }
    }
  } catch (err) {
    console.warn('[AutoIngest] Recovery check failed:', err);
  }
}
