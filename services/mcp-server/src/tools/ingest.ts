/**
 * Memory Ingest Tool
 * Ingests conversations with full analysis pipeline
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  runPipeline,
  runPipelineSync,
  quickAnalyze,
  type ConversationMessage,
  type PipelineConfig,
} from '@memron/analysis-engine';
import {
  insertEpisode,
  insertAtomicMemory,
  insertRecipe,
  insertEntity,
  insertEntityRelationship,
} from '../db/queries-analysis.js';
import { McpError, ErrorCode } from '../lib/errors.js';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().max(100000),
  timestamp: z.string().max(50).optional(),
});

const IngestInputSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.number(),
  messages: z.array(MessageSchema).min(1).max(500),
  options: z.object({
    useLLM: z.boolean().optional(),
    extractEpisodes: z.boolean().optional(),
    extractMemories: z.boolean().optional(),
    analyzeTrajectory: z.boolean().optional(),
    distillRecipes: z.boolean().optional(),
    extractEntities: z.boolean().optional(),
  }).optional(),
});

const AnalyzeInputSchema = z.object({
  userId: z.number(),
  messages: z.array(MessageSchema).min(1).max(500),
  quick: z.boolean().optional(),
});

/**
 * Register memory ingestion tools
 */
export function registerIngestTools(server: McpServer): void {
  // memory_ingest - Full ingestion with storage
  server.tool(
    'memory_ingest',
    'Ingest a conversation with full analysis pipeline and storage',
    IngestInputSchema.shape,
    async (params) => {
      const input = IngestInputSchema.parse(params);

      const sessionId = input.sessionId || `session_${nanoid(12)}`;
      const userId = String(input.userId);

      const messages: ConversationMessage[] = input.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
      }));

      const config: PipelineConfig = {
        useLLM: input.options?.useLLM ?? true,
        parallel: true,
      };

      try {
        const result = await runPipeline(
          {
            sessionId,
            userId,
            messages,
            options: input.options,
          },
          config
        );

        // Store episodes
        for (const episode of result.episodes) {
          await insertEpisode({
            episodeId: episode.episodeId,
            sessionId: episode.sessionId,
            userId: input.userId,
            episodeType: episode.episodeType,
            startIndex: episode.startIndex,
            endIndex: episode.endIndex,
            outcome: episode.outcome,
            outcomeConfidence: 0.7,
            summary: episode.summary,
            rawMessages: episode.messages,
          });
        }

        // Store memories
        for (const memory of result.memories) {
          await insertAtomicMemory({
            memoryId: memory.memoryId,
            userId: input.userId,
            // episodeId is not on AtomicMemoryUnit, but we can derive it from context
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
        }

        // Store recipes
        for (const recipe of result.recipes) {
          await insertRecipe({
            recipeId: recipe.recipeId,
            userId: input.userId,
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
        }

        // Store entities
        const entityIdMap = new Map<string, string>();
        for (const entity of result.entities) {
          const stored = await insertEntity({
            entityId: entity.entityId,
            userId: input.userId,
            name: entity.name,
            canonicalName: entity.canonicalName,
            entityType: entity.entityType,
            description: entity.description,
            firstSeenIn: entity.firstSeenIn,
            mentionCount: entity.mentionCount,
          });
          entityIdMap.set(entity.entityId, stored.entity_id);
        }

        // Store relationships
        for (const rel of result.relationships) {
          await insertEntityRelationship({
            relationshipId: `rel_${nanoid(12)}`,
            userId: input.userId,
            sourceEntityId: rel.sourceEntityId,
            targetEntityId: rel.targetEntityId,
            relationshipType: rel.relationshipType,
            strength: rel.strength,
            evidenceCount: rel.evidenceCount,
            sourceMemories: rel.sourceMemories,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                sessionId,
                stats: result.processingStats,
                summary: {
                  episodes: result.episodes.length,
                  memories: result.memories.length,
                  recipes: result.recipes.length,
                  entities: result.entities.length,
                  relationships: result.relationships.length,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // memory_analyze - Analyze without storing
  server.tool(
    'memory_analyze',
    'Analyze a conversation without storing results',
    AnalyzeInputSchema.shape,
    async (params) => {
      const input = AnalyzeInputSchema.parse(params);

      const messages: ConversationMessage[] = input.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
      }));

      try {
        if (input.quick) {
          const result = await quickAnalyze(messages, String(input.userId));
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  quick: true,
                  ...result,
                }, null, 2),
              },
            ],
          };
        }

        const sessionId = `analysis_${nanoid(8)}`;
        const result = await runPipeline({
          sessionId,
          userId: String(input.userId),
          messages,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                episodes: result.episodes.map(ep => ({
                  type: ep.episodeType,
                  outcome: ep.outcome,
                  messageCount: ep.messages.length,
                })),
                analyses: result.analyses.map(a => ({
                  outcome: a.outcome,
                  outcomeConfidence: a.outcomeConfidence,
                  trajectoryPointCount: a.trajectoryPoints.length,
                })),
                memoryCount: result.memories.length,
                recipeCount: result.recipes.length,
                entityCount: result.entities.length,
                processingStats: result.processingStats,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
