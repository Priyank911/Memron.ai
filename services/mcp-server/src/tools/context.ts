/**
 * Context Tool — Build optimized context injections from memories.
 *
 * context.build → Given a query + token budget, find relevant memories,
 *                 decrypt them, rank by relevance, and assemble a context
 *                 window that fits within the budget.
 *
 * This is the "anti-needle-in-haystack" feature — surgical precision
 * context injection instead of full history replay.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { decrypt } from '../lib/encryption.js';
import { estimateTokens, VALID_BUCKETS } from '../lib/pointer.js';
import { formatToolError } from '../lib/errors.js';
import { config } from '../config.js';
import * as db from '../db/queries.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

/**
 * Simple relevance scoring based on keyword overlap between query and content.
 * Returns a score between 0 and 1.
 */
function scoreRelevance(query: string, title: string, tags: string[]): number {
  const queryWords = new Set(
    query.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
  );
  if (queryWords.size === 0) return 0.5; // No query = neutral relevance

  let matches = 0;
  const titleLower = title.toLowerCase();
  const tagString = tags.join(' ').toLowerCase();

  for (const word of queryWords) {
    if (titleLower.includes(word)) matches += 2;
    if (tagString.includes(word)) matches += 1;
  }

  return Math.min(1, matches / (queryWords.size * 2));
}

/**
 * Register context tools on the MCP server.
 */
export function registerContextTools(server: McpServer): void {

  // ─── context.build ─────────────────────────────────────────
  server.tool(
    'context_build',
    'Build an optimized context injection from your stored memories. Finds relevant memories matching your query, decrypts them, ranks by relevance, and assembles a context window within your token budget. Use this instead of replaying full conversation history.',
    {
      query: z.string().min(1).max(1000).describe('What context do you need? Describe what you\'re looking for.'),
      tokenBudget: z.number().min(100).max(32000).optional().describe('Maximum tokens for the context window (default: 4000)'),
      buckets: z.array(z.enum(VALID_BUCKETS as unknown as [string, ...string[]])).optional().describe('Filter to specific memory buckets'),
      maxMemories: z.number().min(1).max(50).optional().describe('Maximum number of memories to include (default: 20)'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const tokenBudget = args.tokenBudget ?? config.memory.defaultTokenBudget;
        const maxMemories = args.maxMemories ?? 20;

        // Step 1: Find candidate memories
        const candidates = await db.getMemoriesForContext({
          userId,
          buckets: args.buckets,
          limit: Math.min(maxMemories * 3, 100), // Fetch extra for ranking
        });

        if (candidates.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                context: '',
                memoriesUsed: 0,
                tokensUsed: 0,
                tokenBudget,
                note: 'No memories found matching your criteria.',
              }, null, 2),
            }],
          };
        }

        // Step 2: Score relevance and sort
        const scored = candidates.map((mem) => ({
          memory: mem,
          score: scoreRelevance(args.query, mem.title, mem.tags),
        }));

        scored.sort((a, b) => b.score - a.score);

        // Step 3: Decrypt and fill context window up to budget
        const contextSlices: Array<{
          pointerId: string;
          bucket: string;
          title: string;
          content: string;
          tokens: number;
          relevance: number;
        }> = [];

        let tokensUsed = 0;

        for (const { memory, score } of scored) {
          if (contextSlices.length >= maxMemories) break;
          if (tokensUsed >= tokenBudget) break;

          try {
            // Decrypt the memory content
            const content = decrypt({
              encrypted: memory.content_encrypted,
              iv: memory.content_iv,
              tag: memory.content_tag,
            });

            const contentTokens = estimateTokens(content);

            // Check if it fits in the budget
            if (tokensUsed + contentTokens > tokenBudget) {
              // Try to fit a truncated version
              const remainingTokens = tokenBudget - tokensUsed;
              if (remainingTokens < 50) break; // Too small to be useful

              const truncatedContent = content.slice(0, remainingTokens * 4) + '...';
              const truncatedTokens = estimateTokens(truncatedContent);

              contextSlices.push({
                pointerId: memory.pointer_id,
                bucket: memory.bucket,
                title: memory.title,
                content: truncatedContent,
                tokens: truncatedTokens,
                relevance: Math.round(score * 100) / 100,
              });
              tokensUsed += truncatedTokens;
              break;
            }

            contextSlices.push({
              pointerId: memory.pointer_id,
              bucket: memory.bucket,
              title: memory.title,
              content,
              tokens: contentTokens,
              relevance: Math.round(score * 100) / 100,
            });
            tokensUsed += contentTokens;
          } catch {
            // Skip memories that fail to decrypt
            continue;
          }
        }

        // Step 4: Assemble the context
        const assembledContext = contextSlices
          .map((slice) =>
            `--- [${slice.bucket}] ${slice.title} (${slice.pointerId}) ---\n${slice.content}`,
          )
          .join('\n\n');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              context: assembledContext,
              memoriesUsed: contextSlices.length,
              tokensUsed,
              tokenBudget,
              slices: contextSlices.map(({ content, ...meta }) => meta), // Metadata only in summary
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    },
  );
}
