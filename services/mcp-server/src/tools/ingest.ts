/**
 * Memory Ingest Tool
 * Ingests conversations with full analysis pipeline
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  runPipeline,
  quickAnalyze,
  type ConversationMessage,
} from '@memron/analysis-engine';
import { McpError, ErrorCode } from '../lib/errors.js';
import { autoIngest } from '../lib/auto-ingest.js';

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

      try {
        const result = await autoIngest({
          sessionId,
          userId: input.userId,
          messages,
          useLLM: input.options?.useLLM ?? true,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                sessionId,
                summary: result.stats,
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
