/**
 * Context Tool — Build optimized context injections from memories.
 *
 * context.build → Given a query + token budget, find relevant memories,
 *                 decrypt them, rank by relevance, and assemble a context
 *                 window that fits within the budget.
 *
 * This is the "anti-needle-in-haystack" feature — surgical precision
 * context injection instead of full history replay.
 *
 * Now uses hybrid retrieval (vector + BM25 + graph + recency) for
 * semantic search instead of simple recency-based fetching.
 *
 * Enhanced with adaptive token budgeting and memory compression
 * for maximum efficiency.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { decrypt } from '../lib/encryption.js';
import { estimateTokens, VALID_BUCKETS } from '../lib/pointer.js';
import { formatToolError } from '../lib/errors.js';
import { config } from '../config.js';
import { generateEmbedding, buildEmbeddingInput } from '../lib/embeddings.js';
import { hybridRetrieve, type HybridRetrievalOptions } from '../retrieval/hybrid-retrieval.js';
import {
  calculateQueryComplexity,
  calculateAdaptiveBudget,
  prioritizeMemories,
  type MemoryWithTokens,
} from '../lib/token-optimizer.js';
import * as db from '../db/queries.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

/**
 * Register context tools on the MCP server.
 */
export function registerContextTools(server: McpServer): void {

  // ─── context.build ─────────────────────────────────────────
  server.tool(
    'context_build',
    'Build an optimized context injection from your stored memories. Uses hybrid retrieval (vector + BM25 + graph + recency) to find semantically relevant memories, decrypts them, and assembles a context window within your token budget. This is the surgical precision alternative to replaying full conversation history.',
    {
      query: z.string().min(1).max(1000).describe('What context do you need? Describe what you\'re looking for.'),
      tokenBudget: z.number().min(100).max(32000).optional().describe('Maximum tokens for the context window (default: 4000)'),
      buckets: z.array(z.enum(VALID_BUCKETS as unknown as [string, ...string[]])).optional().describe('Filter to specific memory buckets'),
      maxMemories: z.number().min(1).max(50).optional().describe('Maximum number of memories to include (default: 20)'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const baseTokenBudget = args.tokenBudget ?? config.memory.defaultTokenBudget;
        const maxMemories = args.maxMemories ?? 20;

        // Step 1: Calculate query complexity for adaptive budgeting
        const queryComplexity = calculateQueryComplexity(args.query);
        const adaptiveBudget = calculateAdaptiveBudget(baseTokenBudget, queryComplexity, maxMemories);

        // Step 2: Generate embedding for the query
        const embeddingInput = buildEmbeddingInput(args.query, [], args.query);
        const embedding = await generateEmbedding(embeddingInput);

        // Step 3: Use hybrid retrieval to find relevant memories
        const retrievalOptions: HybridRetrievalOptions = {
          userId,
          query: args.query,
          embedding: embedding || undefined,
          topK: Math.min(maxMemories * 3, 100), // Fetch extra for filtering
          tokenBudget: adaptiveBudget.total,
          signals: {
            vector: 1.0,    // Semantic similarity
            bm25: 0.8,      // Keyword matching
            graph: 0.6,     // Knowledge graph connections
            recency: 0.4,   // Temporal relevance
          },
        };

        const retrievalResult = await hybridRetrieve(retrievalOptions);

        if (retrievalResult.memories.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                context: '',
                memoriesUsed: 0,
                tokensUsed: 0,
                tokenBudget: baseTokenBudget,
                adaptiveBudget: adaptiveBudget.total,
                queryComplexity: queryComplexity.toFixed(2),
                note: 'No memories found matching your query.',
                signalsUsed: retrievalResult.signalsUsed,
                retrievalTimeMs: retrievalResult.retrievalTimeMs,
              }, null, 2),
            }],
          };
        }

        // Step 4: Convert to MemoryWithTokens format for optimization
        const memoriesWithTokens: MemoryWithTokens[] = retrievalResult.memories.map(mem => ({
          content: mem.content,
          tokens: estimateTokens(mem.content),
          priority: mem.fusedScore,
          metadata: {
            memoryType: mem.memoryType,
            confidence: mem.confidence,
          },
        }));

        // Step 5: Filter by buckets if specified
        let filteredMemories = memoriesWithTokens;
        if (args.buckets && args.buckets.length > 0) {
          const filteredRetrieval = retrievalResult.memories.filter(m =>
            m.bucket && args.buckets!.includes(m.bucket as any)
          );
          filteredMemories = filteredRetrieval.map(mem => ({
            content: mem.content,
            tokens: estimateTokens(mem.content),
            priority: mem.fusedScore,
            metadata: {
              memoryType: mem.memoryType,
              confidence: mem.confidence,
            },
          }));
        }

        // Step 6: Prioritize and select memories within adaptive budget
        const selectedMemories = prioritizeMemories(filteredMemories, adaptiveBudget.total);

        // Step 7: Assemble the context with optimized selection
        const contextSlices: Array<{
          id: string;
          source: string;
          bucket?: string;
          title?: string;
          content: string;
          tokens: number;
          relevance: number;
          signals: Record<string, number>;
        }> = [];

        let tokensUsed = 0;

        // Map back to original retrieval results for metadata
        const selectedIds = new Set(selectedMemories.map(m => m.content));
        for (const memory of retrievalResult.memories) {
          if (!selectedIds.has(memory.content)) continue;
          if (contextSlices.length >= maxMemories) break;

          const selectedMem = selectedMemories.find(m => m.content === memory.content);
          if (!selectedMem) continue;

          contextSlices.push({
            id: memory.id,
            source: memory.source,
            bucket: memory.bucket,
            title: memory.title,
            content: selectedMem.content, // Use potentially truncated version
            tokens: selectedMem.tokens,
            relevance: Math.round(memory.fusedScore * 100) / 100,
            signals: memory.signals,
          });
          tokensUsed += selectedMem.tokens;
        }

        // Step 8: Assemble the context
        const assembledContext = contextSlices
          .map((slice) => {
            const header = slice.title
              ? `--- [${slice.bucket || 'memory'}] ${slice.title} (${slice.id}) ---`
              : `--- [${slice.source}] ${slice.id} ---`;
            return `${header}\n${slice.content}`;
          })
          .join('\n\n');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              context: assembledContext,
              memoriesUsed: contextSlices.length,
              tokensUsed,
              tokenBudget: baseTokenBudget,
              adaptiveBudget: adaptiveBudget.total,
              queryComplexity: queryComplexity.toFixed(2),
              totalCandidates: retrievalResult.totalCandidates,
              signalsUsed: retrievalResult.signalsUsed,
              retrievalTimeMs: retrievalResult.retrievalTimeMs,
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
