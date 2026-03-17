/**
 * Preference Extraction Tool
 * Extract and manage user preferences from conversations
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  extractPreferences,
  extractPreferencesSync,
  preferencesToMemoryContent,
  type ExtractedPreference,
  type ConversationMessage,
  type Episode,
} from '@memron/analysis-engine';
import { insertAtomicMemory, searchAtomicMemories } from '../db/queries-analysis.js';
import { McpError, ErrorCode } from '../lib/errors.js';
import { nanoid } from 'nanoid';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().max(100000),
  timestamp: z.string().max(50).optional(),
});

const PreferenceExtractSchema = z.object({
  userId: z.number(),
  messages: z.array(MessageSchema).min(1).max(500),
  useLLM: z.boolean().optional(),
  store: z.boolean().optional(),
});

const PreferenceGetSchema = z.object({
  userId: z.number(),
  category: z.enum(['code_style', 'communication', 'tooling', 'quality', 'process']).optional(),
  limit: z.number().min(1).max(100).optional(),
});

/**
 * Create an Episode from messages for preference extraction
 */
function createEpisodeFromMessages(messages: ConversationMessage[]): Episode {
  return {
    episodeId: `ep_pref_${nanoid(8)}`,
    sessionId: `session_pref_${nanoid(8)}`,
    episodeType: 'user_clarification',
    startIndex: 0,
    endIndex: messages.length,
    messages,
    outcome: 'neutral',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Register preference tools
 */
export function registerPreferenceTools(server: McpServer): void {
  // preference_extract - Extract preferences from conversation
  server.tool(
    'preference_extract',
    'Extract user preferences from a conversation',
    PreferenceExtractSchema.shape,
    async (params) => {
      const input = PreferenceExtractSchema.parse(params);

      const messages: ConversationMessage[] = input.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
      }));

      // Create an Episode from messages for the extractors
      const episode = createEpisodeFromMessages(messages);

      try {
        const preferences = input.useLLM
          ? await extractPreferences(episode)
          : extractPreferencesSync(episode);

        // Store if requested
        if (input.store && preferences.length > 0) {
          for (const pref of preferences) {
            const content = preferencesToMemoryContent([pref]);
            await insertAtomicMemory({
              memoryId: `mem_${nanoid(12)}`,
              userId: input.userId,
              memoryType: 'preference',
              content,
              compressedContent: `${pref.category}: ${pref.preference}`,
              confidence: pref.confidence,
              successScore: 0.7,
              failureScore: 0.1,
              transferability: 0.8,
              sharePolicy: 'private',
            });
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: preferences.length,
                stored: input.store && preferences.length > 0,
                preferences: preferences.map(p => ({
                  category: p.category,
                  preference: p.preference,
                  confidence: p.confidence,
                  source: p.source,
                  evidence: p.evidence,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Preference extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // preference_get - Get stored preferences
  server.tool(
    'preference_get',
    'Get stored user preferences',
    PreferenceGetSchema.shape,
    async (params) => {
      const input = PreferenceGetSchema.parse(params);

      try {
        const memories = await searchAtomicMemories({
          userId: input.userId,
          memoryTypes: ['preference'],
          limit: input.limit || 50,
        });

        // Filter by category if specified
        let filtered = memories;
        if (input.category) {
          filtered = memories.filter(m =>
            m.compressed_content?.toLowerCase().includes(input.category!)
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: filtered.length,
                category: input.category || 'all',
                preferences: filtered.map(m => ({
                  memoryId: m.memory_id,
                  content: m.content,
                  compressed: m.compressed_content,
                  confidence: m.confidence,
                  createdAt: m.created_at,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Preference retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
