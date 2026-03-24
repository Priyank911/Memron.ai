/**
 * Context Packet Tools
 * Build and manage anti-hallucination memory packets
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildMemoryPacket,
  buildCompactPacket,
  formatPacketForPrompt,
  storePacket,
  getPacket,
} from '../retrieval/packet-builder.js';
import { McpError, ErrorCode } from '../lib/errors.js';

const PacketBuildSchema = z.object({
  userId: z.number(),
  query: z.string().max(2000),
  embedding: z.array(z.number()).max(4096).optional(),
  tokenBudget: z.number().min(100).max(10000).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  includePreferences: z.boolean().optional(),
  includeRecipes: z.boolean().optional(),
  includeEntities: z.boolean().optional(),
  includeFailures: z.boolean().optional(),
  compact: z.boolean().optional(),
  store: z.boolean().optional(),
});

const PacketGetSchema = z.object({
  userId: z.number(),
  packetId: z.string().max(100),
});

const PacketFormatSchema = z.object({
  userId: z.number(),
  query: z.string().max(2000),
  embedding: z.array(z.number()).max(4096).optional(),
  tokenBudget: z.number().min(100).max(10000).optional(),
});

/**
 * Register packet tools
 */
export function registerPacketTools(server: McpServer): void {
  // context_packet - Build a memory packet for context injection
  server.tool(
    'context_packet',
    'Build an anti-hallucination memory packet for agent context',
    PacketBuildSchema.shape,
    async (params) => {
      const input = PacketBuildSchema.parse(params);

      try {
        const packet = input.compact
          ? await buildCompactPacket({
              userId: input.userId,
              query: input.query,
              embedding: input.embedding,
              tokenBudget: input.tokenBudget,
              minConfidence: input.minConfidence,
            })
          : await buildMemoryPacket({
              userId: input.userId,
              query: input.query,
              embedding: input.embedding,
              tokenBudget: input.tokenBudget,
              minConfidence: input.minConfidence,
              includePreferences: input.includePreferences,
              includeRecipes: input.includeRecipes,
              includeEntities: input.includeEntities,
              includeFailures: input.includeFailures,
            });

        // Optionally store the packet
        if (input.store) {
          await storePacket(packet, input.userId);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                packetId: packet.packetId,
                generatedAt: packet.generatedAt,
                stored: input.store || false,

                // Summary
                summary: {
                  preferencesCount: packet.userPreferences.length,
                  hasRecipe: packet.priorSuccessfulRecipe !== null,
                  failuresToAvoid: packet.knownFailuresToAvoid.length,
                  factsCount: packet.latestFactualUpdates.length,
                  entitiesCount: packet.relevantEntities.length,
                  sourceCount: packet.linkedSources.length,
                },

                // Risk assessment
                hallucinationRisk: packet.hallucinationRisk,
                warnings: packet.warnings,
                verificationSteps: packet.verificationSteps,

                // Token accounting
                tokenUsage: packet.tokenUsage,

                // Context for injection
                continuationSummary: packet.continuationSummary,

                // Full packet content
                preferences: packet.userPreferences,
                recipe: packet.priorSuccessfulRecipe,
                failuresToAvoid: packet.knownFailuresToAvoid,
                facts: packet.latestFactualUpdates,
                entities: packet.relevantEntities,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Packet build failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // context_packet_format - Get packet formatted for prompt injection
  server.tool(
    'context_packet_format',
    'Build and format a memory packet for direct prompt injection',
    PacketFormatSchema.shape,
    async (params) => {
      const input = PacketFormatSchema.parse(params);

      try {
        const packet = await buildMemoryPacket({
          userId: input.userId,
          query: input.query,
          embedding: input.embedding,
          tokenBudget: input.tokenBudget,
        });

        const formatted = formatPacketForPrompt(packet);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                packetId: packet.packetId,
                tokenUsage: packet.tokenUsage,
                hallucinationRisk: packet.hallucinationRisk.level,
                warnings: packet.warnings,
                formattedContext: formatted,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Packet format failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // context_packet_get - Retrieve a stored packet
  server.tool(
    'context_packet_get',
    'Retrieve a previously stored memory packet',
    PacketGetSchema.shape,
    async (params) => {
      const input = PacketGetSchema.parse(params);

      try {
        const packet = await getPacket(input.packetId, input.userId);

        if (!packet) {
          throw new McpError('Packet not found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(packet, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Packet retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
