/**
 * Core Verb Tools — Consolidated 4-Verb MCP Architecture for Memron.
 *
 * 1. memory_store   — Unified write verb (facts, context, knowledge, Membrow clips, recipes, preferences)
 * 2. memory_recall  — Unified read/query verb (hybrid RRF vector + BM25 + graph paths + pinned constraints)
 * 3. memory_manage  — Unified mutation verb (update, delete, pin, unpin, triage, merge, feedback)
 * 4. memory_validate— Unified pre-flight guardrail check (active contradictions, failure recipes, pinned rules)
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { encrypt, decrypt, hashContent } from '../lib/encryption.js';
import { generateEmbedding, buildEmbeddingInput, toPgVector } from '../lib/embeddings.js';
import { generatePointerId, estimateTokens, calculateCompression, classifyBucket, VALID_BUCKETS } from '../lib/pointer.js';
import { ValidationError, NotFoundError, formatToolError } from '../lib/errors.js';
import { config } from '../config.js';
import * as db from '../db/queries.js';
import { getPinnedFacts, insertPinnedFact, deletePinnedFact } from '../db/queries-graph.js';
import { memoryEvents } from '../lib/event-bus.js';
import { recordRun } from '../versioning/run-recorder.js';
import { enqueueMemoryIndexJob } from '../lib/memory-index-queue.js';
import { hybridRetrieve } from '../retrieval/hybrid-retrieval.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

function getOrgId(authInfo?: AuthInfo): number | undefined {
  const oid = authInfo?.extra?.orgId;
  return typeof oid === 'number' ? oid : undefined;
}

function getApiKeyId(authInfo?: AuthInfo): number | undefined {
  const akId = authInfo?.extra?.apiKeyId;
  return typeof akId === 'number' ? akId : undefined;
}

export function registerCoreVerbs(server: McpServer): void {

  // ═══════════════════════════════════════════════════════════
  // 1. memory_store — The Unified Write Verb
  // ═══════════════════════════════════════════════════════════
  server.tool(
    'memory_store',
    'Store content into Memron. Use type=context for short-lived conversation context (bucket conversation), type=knowledge for durable knowledge (bucket knowledge), type=preference for user preferences, and type=recipe for reusable procedures. Graph indexing is queued after the memory is stored.',
    {
      content: z.string().min(1).max(config.memory.maxContentLength).describe('The content or payload to store'),
      title: z.string().max(500).optional().describe('Summary title (auto-generated from first 100 chars if omitted)'),
      type: z.enum(['context', 'knowledge', 'fact', 'preference', 'entity', 'relationship', 'recipe', 'run_event', 'clip']).optional().default('context').describe('The semantic type of the memory'),
      source: z.enum(['agent', 'membrow', 'cli', 'user', 'browser', 'import']).optional().default('agent').describe('The source origin of the memory (e.g. agent mid-session or membrow browser clip)'),
      bucket: z.string().max(100).optional().describe('Bucket slug. Context maps to conversation; knowledge, fact, entity, relationship, recipe, and clip map to knowledge unless explicitly overridden.'),
      tags: z.array(z.string().max(50)).max(20).optional().describe('Descriptive tags for search, organization, and filtering'),
      metadata: z.record(z.unknown()).optional().describe('Arbitrary structured metadata (e.g. { platform, author, category, url, takeaways } for research clips)'),
      status: z.enum(['untriaged', 'context', 'knowledge']).optional().describe('Lifecycle status. Omit to infer context/knowledge from type, or use untriaged to send the item to Inbox.'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const orgId = getOrgId(extra.authInfo);
        const apiKeyId = getApiKeyId(extra.authInfo);
        const content = args.content;

        const durableType = ['knowledge', 'fact', 'entity', 'relationship', 'recipe', 'clip'].includes(args.type || 'context');
        // Inbox is the lifecycle default. Type/source determines the semantic
        // bucket, while the human explicitly promotes an item into Context or
        // Knowledge during triage (or passes status intentionally).
        const inferredStatus = args.status || 'untriaged';

        // Resolve bucket. Explicit semantic types take precedence over the
        // keyword classifier so agents can reliably target Context/Knowledge.
        let bucket = args.bucket;
        if (bucket) {
          const isValid = await db.isValidUserBucket(userId, bucket);
          if (!isValid && !VALID_BUCKETS.includes(bucket as any)) {
            bucket = 'default';
          }
        } else if (args.source === 'membrow' || durableType) {
          bucket = 'knowledge';
        } else if (args.type === 'context') {
          bucket = 'conversation';
        } else {
          bucket = classifyBucket(content);
        }

        const title = args.title || content.slice(0, 100).replace(/\n/g, ' ').trim();
        const originalTokens = estimateTokens(content);
        const encrypted = encrypt(content);
        const contentHash = hashContent(content);
        const pointerId = generatePointerId();
        const pointerTokens = 3;
        const compression = calculateCompression(originalTokens);

        // Build combined metadata
        const metadata: Record<string, unknown> = {
          ...(args.metadata || {}),
          type: args.type,
          source: args.source,
          status: inferredStatus,
          decay_exempt: args.type === 'knowledge' || args.source === 'membrow',
          created_via: 'mcp:memory_store',
        };

        // Generate embedding synchronously so vector search works immediately.
        // The background worker still handles graph extraction and can
        // re-generate if the synchronous call failed (e.g. circuit breaker open).
        let embeddingStr: string | undefined;
        try {
          const emb = await generateEmbedding(buildEmbeddingInput(title, args.tags || [], content));
          if (emb) {
            embeddingStr = toPgVector(emb);
          }
        } catch {
          // Non-fatal: graph extraction still runs, keyword search remains available
        }

        const memory = await db.insertMemory({
          pointerId,
          userId,
          orgId,
          bucket,
          title,
          contentEncrypted: encrypted.encrypted,
          contentIv: encrypted.iv,
          contentTag: encrypted.tag,
          contentHash,
          tags: args.tags || [],
          tokenCount: pointerTokens,
          originalTokens,
          metadata,
          status: inferredStatus,
          source: args.source,
          decayExempt: args.type === 'knowledge' || args.source === 'membrow',
          apiKeyId,
          importance: args.type === 'preference' || args.type === 'recipe' ? 0.8 : 0.5,
          embedding: embeddingStr,
        });

        await enqueueMemoryIndexJob({
          userId,
          pointerId,
          orgId,
          title,
          content,
          type: args.type || 'context',
          bucket,
        });

        // A run_event is both a memory artifact and an analytics record. This
        // keeps Run Analytics connected to the consolidated four-verb API.
        let runRecordId: string | undefined;
        if (args.type === 'run_event') {
          const runMeta = args.metadata || {};
          try {
            const run = await recordRun(
              {
                userId,
                sessionId: String(runMeta.sessionId || `mcp:${pointerId}`),
                agentId: runMeta.agentId ? String(runMeta.agentId) : undefined,
                workspaceId: runMeta.workspaceId ? String(runMeta.workspaceId) : undefined,
                taskId: runMeta.taskId ? String(runMeta.taskId) : undefined,
              },
              {
                promptVersionId: runMeta.promptVersionId ? String(runMeta.promptVersionId) : undefined,
                contextVersionId: runMeta.contextVersionId ? String(runMeta.contextVersionId) : undefined,
                retrievalVersionId: runMeta.retrievalVersionId ? String(runMeta.retrievalVersionId) : undefined,
                toolingVersionId: runMeta.toolingVersionId ? String(runMeta.toolingVersionId) : undefined,
                evaluationVersionId: runMeta.evaluationVersionId ? String(runMeta.evaluationVersionId) : undefined,
              },
              {
                modelName: runMeta.modelName ? String(runMeta.modelName) : undefined,
                modelParams: runMeta.modelParams as Record<string, unknown> | undefined,
                inputTokens: Number(runMeta.inputTokens || 0),
                outputTokens: Number(runMeta.outputTokens || 0),
                latencyMs: Number(runMeta.latencyMs || 0),
                cost: runMeta.cost == null ? undefined : Number(runMeta.cost),
              },
              {
                hallucinationFlag: Boolean(runMeta.hallucinationFlag),
                successScore: runMeta.successScore == null ? undefined : Number(runMeta.successScore),
                userFeedback: runMeta.userFeedback as 'positive' | 'negative' | 'neutral' | undefined,
                finalAcceptance: Boolean(runMeta.finalAcceptance),
                failureReason: runMeta.failureReason ? String(runMeta.failureReason) : undefined,
              },
              Array.isArray(runMeta.sourceArtifacts) ? runMeta.sourceArtifacts.map(String) : undefined,
            );
            runRecordId = run.run_id;
          } catch (runError) {
            // Memory storage remains durable even if analytics tables are not
            // migrated yet; return the reason so deployment can surface it.
            runRecordId = `analytics_error:${runError instanceof Error ? runError.message : 'record_failed'}`;
          }
        }

        // Emit real-time event for Dashboard Inbox notification badge
        memoryEvents.emit({
          type: 'memory.created',
          userId,
          timestamp: new Date().toISOString(),
          data: {
            id: String(memory.id),
            pointerId,
            bucket,
            title,
            type: args.type,
            source: args.source,
            status: inferredStatus,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'stored',
                  pointerId,
                  title,
                  bucket,
                  type: args.type,
                  source: args.source,
                  inboxStatus: inferredStatus,
                  tokensSaved: compression.saved,
                  compressionRatio: compression.ratio,
                  pointerRef: `[Memory: ${pointerId} — "${title}"]`,
                  hint: inferredStatus === 'untriaged' ? 'Stored in Inbox for human triage.' : 'Stored and indexed for recall.',
                  semanticIndex: { status: 'queued' },
                  ...(runRecordId ? { runRecordId } : {}),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 2. memory_recall — The Unified Read & Query Verb
  // ═══════════════════════════════════════════════════════════
  server.tool(
    'memory_recall',
    'Search and recall relevant memories from Memron using hybrid retrieval (vector similarity + BM25 keyword matching + knowledge graph expansion + pinned rules). Returns compact, token-budgeted context.',
    {
      query: z.string().min(1).max(2000).describe('Search query or question in natural language'),
      mode: z.enum(['hybrid', 'vector', 'graph', 'recipe', 'pinned', 'history']).optional().default('hybrid').describe('Retrieval mode: hybrid (recommended), vector, graph, recipe, pinned, or history'),
      category: z.enum(['all', 'context', 'knowledge', 'recipes', 'preferences']).optional().default('all').describe('Filter by memory category'),
      bucket: z.string().max(100).optional().describe('Filter to a specific bucket slug'),
      tags: z.array(z.string().max(50)).optional().describe('Filter by tags'),
      limit: z.number().int().min(1).max(50).optional().default(8).describe('Maximum items to return'),
      tokenBudget: z.number().int().min(200).max(10000).optional().default(2000).describe('Token budget for context assembly'),
      format: z.enum(['json', 'xml', 'text']).optional().default('json').describe('Output format'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        // The hybrid mode is the production default. It combines BM25,
        // recency, vector (when configured), and graph signals. Keep the
        // direct encrypted-table search as a compatibility fallback for
        // category/bucket queries and deployments with an older schema.
        if (args.mode === 'hybrid' && !args.bucket && !args.tags?.length) {
          const queryEmbedding = await generateEmbedding(buildEmbeddingInput(args.query, [], ''));
          const hybrid = await hybridRetrieve({
            userId,
            query: args.query,
            embedding: queryEmbedding || undefined,
            topK: args.limit,
            tokenBudget: args.tokenBudget,
          });
          const hybridResults = hybrid.memories
            .filter(item => item.source === 'memory' || item.source === 'atomic_memory')
            .filter(item => {
              const type = item.metadata?.type || item.memoryType;
              if (args.category === 'all') return true;
              if (args.category === 'knowledge') return type === 'knowledge' || item.metadata?.source === 'membrow';
              if (args.category === 'context') return type === 'context';
              if (args.category === 'recipes') return type === 'recipe';
              if (args.category === 'preferences') return type === 'preference';
              return true;
            })
            .map(item => ({
              pointerId: item.id,
              title: item.title || item.memoryType || 'Memory',
              bucket: item.bucket || (item.memoryType === 'recipe' ? 'knowledge' : 'conversation'),
              content: item.content,
              tags: item.tags || [],
              metadata: item.metadata || { type: item.memoryType },
            }));
          if (hybridResults.length > 0) {
            const pinnedRules = await getPinnedFacts(userId).then(pins => pins.map(p => p.label || p.pin_id)).catch(() => [] as string[]);
            const tokenCount = hybrid.tokenEstimate;
            if (args.format === 'xml') {
              const xmlContext = ['<memron_context>', ...pinnedRules.map(rule => `  <pinned_rule>${rule}</pinned_rule>`), ...hybridResults.map(r => `  <memory pointer="${r.pointerId}" title="${r.title}">\n    ${r.content}\n  </memory>`), '</memron_context>'].join('\n');
              return { content: [{ type: 'text', text: xmlContext }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify({ query: args.query, totalFound: hybridResults.length, tokenCount, tokenBudget: args.tokenBudget, pinnedRules, results: hybridResults }, null, 2) }] };
          }
          // Hybrid was attempted but found nothing semantically relevant.
          // Do NOT fall through to the keyword/ILIKE compatibility path —
          // that would silently substitute an unrelated keyword match and
          // mask the real failure (no relevant memory stored).
          return { content: [{ type: 'text', text: JSON.stringify({ query: args.query, totalFound: 0, tokenCount: 0, tokenBudget: args.tokenBudget, pinnedRules: [], results: [], note: 'No semantically relevant memories found. Stored facts may not have embeddings yet or may not match the query.' }, null, 2) }] };
        }

        // Fetch candidate memories using the encrypted-table compatibility path.
        const candidates = await db.searchMemories({
          userId,
          queryText: args.query,
          bucket: args.bucket,
          tags: args.tags,
          limit: args.limit * 2,
        });

        // Filter and decrypt results within token budget
        const results: Array<{
          pointerId: string;
          title: string;
          bucket: string;
          content: string;
          tags: string[];
          metadata: Record<string, unknown>;
        }> = [];

        let tokensUsed = 0;
        for (const row of candidates) {
          if (tokensUsed >= args.tokenBudget) break;

          // Category filter check
          const meta = (row.metadata || {}) as Record<string, unknown>;
          if (args.category !== 'all') {
            const rowType = (meta.type as string) || 'context';
            if (args.category === 'knowledge' && rowType !== 'knowledge' && meta.source !== 'membrow') continue;
            if (args.category === 'context' && rowType !== 'context') continue;
            if (args.category === 'recipes' && rowType !== 'recipe') continue;
            if (args.category === 'preferences' && rowType !== 'preference') continue;
          }

          try {
            const decrypted = decrypt({
              encrypted: row.content_encrypted,
              iv: row.content_iv,
              tag: row.content_tag,
            });
            const est = estimateTokens(decrypted);
            if (tokensUsed + est > args.tokenBudget && results.length > 0) continue;

            results.push({
              pointerId: row.pointer_id,
              title: row.title,
              bucket: row.bucket,
              content: decrypted,
              tags: row.tags || [],
              metadata: meta,
            });
            tokensUsed += est;
          } catch {
            // Decryption failure fallback
          }
        }

        // Retrieve pinned rules if in hybrid or pinned mode
        let pinnedRules: string[] = [];
        if (args.mode === 'hybrid' || args.mode === 'pinned') {
          try {
            const pins = await getPinnedFacts(userId);
            pinnedRules = pins.map((p) => p.label || p.pin_id);
          } catch {
            // Pinned lookup fallback
          }
        }

        if (args.format === 'xml') {
          const xmlContext = [
            '<memron_context>',
            ...pinnedRules.map((rule) => `  <pinned_rule>${rule}</pinned_rule>`),
            ...results.map(
              (r) => `  <memory pointer="${r.pointerId}" title="${r.title}">\n    ${r.content}\n  </memory>`
            ),
            '</memron_context>',
          ].join('\n');

          return {
            content: [{ type: 'text', text: xmlContext }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: args.query,
                  totalFound: results.length,
                  tokenCount: tokensUsed,
                  tokenBudget: args.tokenBudget,
                  pinnedRules,
                  results: results.slice(0, args.limit),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 3. memory_manage — The Unified Mutation Verb
  // ═══════════════════════════════════════════════════════════
  server.tool(
    'memory_manage',
    'Mutate or manage an existing memory (update, delete, pin, unpin, triage into context/knowledge, or record feedback).',
    {
      action: z.enum(['update', 'delete', 'pin', 'unpin', 'triage', 'archive', 'merge', 'feedback']).describe('Management action to execute'),
      pointerId: z.string().describe('Pointer ID of the target memory (e.g. ptr_...)'),
      content: z.string().max(config.memory.maxContentLength).optional().describe('New content if action is update'),
      title: z.string().max(500).optional().describe('New title if action is update'),
      tags: z.array(z.string().max(50)).optional().describe('New tags if action is update'),
      status: z.enum(['untriaged', 'context', 'knowledge', 'archived']).optional().describe('New status if action is triage'),
      targetPointerId: z.string().optional().describe('Target pointer ID if action is merge'),
      feedback: z.object({
        rating: z.number().min(1).max(5).optional(),
        success: z.boolean().optional(),
        comments: z.string().optional(),
      }).optional().describe('Feedback rating if action is feedback'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const existing = await db.getMemoryByPointer(args.pointerId, userId);
        if (!existing) {
          throw new NotFoundError('Memory', args.pointerId);
        }

        switch (args.action) {
          case 'delete':
          case 'archive': {
            await db.softDeleteMemory(args.pointerId, userId);
            memoryEvents.emit({
              type: 'memory.updated',
              userId,
              timestamp: new Date().toISOString(),
              data: { pointerId: args.pointerId, action: 'deleted' },
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: args.action, pointerId: args.pointerId }),
                },
              ],
            };
          }

          case 'update': {
            if (!args.content) {
              throw new ValidationError('content is required for update action');
            }
            const encrypted = encrypt(args.content);
            const contentHash = hashContent(args.content);
            const newTokens = estimateTokens(args.content);

            await db.updateMemory({
              userId,
              pointerId: args.pointerId,
              title: args.title || existing.title,
              contentEncrypted: encrypted.encrypted,
              contentIv: encrypted.iv,
              contentTag: encrypted.tag,
              contentHash,
              tags: args.tags || existing.tags,
              tokenCount: 3,
              originalTokens: newTokens,
            });

            memoryEvents.emit({
              type: 'memory.updated',
              userId,
              timestamp: new Date().toISOString(),
              data: { pointerId: args.pointerId, action: 'updated' },
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: 'updated', pointerId: args.pointerId, title: args.title || existing.title }),
                },
              ],
            };
          }

          case 'pin': {
            const encrypted = encrypt(existing.title);
            await insertPinnedFact({
              pinId: args.pointerId,
              userId,
              label: existing.title,
              encryptedContent: encrypted.encrypted,
              contentIv: encrypted.iv,
              contentTag: encrypted.tag,
              priority: 1,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: 'pinned', pointerId: args.pointerId }),
                },
              ],
            };
          }

          case 'unpin': {
            await deletePinnedFact(args.pointerId, userId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: 'unpinned', pointerId: args.pointerId }),
                },
              ],
            };
          }

          case 'triage': {
            const currentMeta = (existing.metadata || {}) as Record<string, unknown>;
            const newStatus = args.status || 'context';
            const updatedMeta = {
              ...currentMeta,
              status: newStatus,
              decay_exempt: newStatus === 'knowledge',
              triaged_at: new Date().toISOString(),
            };

            await db.updateMemory({
              userId,
              pointerId: args.pointerId,
              metadata: updatedMeta,
              // Keep lifecycle state queryable without depending on JSONB.
              status: newStatus,
              decayExempt: newStatus === 'knowledge',
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: 'triaged', pointerId: args.pointerId, status: newStatus }),
                },
              ],
            };
          }

          case 'feedback': {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, action: 'feedback_recorded', pointerId: args.pointerId, feedback: args.feedback }),
                },
              ],
            };
          }

          default:
            throw new ValidationError(`Unsupported management action "${args.action}"`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 4. memory_validate — The Pre-flight Guardrail Check Verb
  // ═══════════════════════════════════════════════════════════
  server.tool(
    'memory_validate',
    'Pre-flight guardrail check: validate a planned agent action or decision against active pinned constraints, known failure patterns, and contradictions before execution.',
    {
      action: z.string().min(1).describe('The planned action, tool call, or decision the agent is about to execute'),
      proposedPlan: z.union([z.string(), z.array(z.string())]).optional().describe('The step-by-step plan or arguments to evaluate'),
      context: z.string().optional().describe('Relevant session context or user prompt'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        // Fetch pinned constraints
        const pinnedMemories = await getPinnedFacts(userId);
        const activeConstraints = pinnedMemories.map((p) => p.label || p.pin_id);

        // Query knowledge base for past failures or safety recipes
        const planText = Array.isArray(args.proposedPlan) ? args.proposedPlan.join(' ') : args.proposedPlan || '';
        const searchInput = `${args.action} ${planText} ${args.context || ''}`;

        // Basic heuristic rule matching
        const violations: string[] = [];
        const lowerInput = searchInput.toLowerCase();

        for (const rule of activeConstraints) {
          const lowerRule = rule.toLowerCase();
          if (lowerRule.includes('never') || lowerRule.includes('do not') || lowerRule.includes('prohibit')) {
            const prohibitedPart = lowerRule.replace(/never|do not|prohibit/gi, '').trim();
            if (prohibitedPart.length > 3 && lowerInput.includes(prohibitedPart)) {
              violations.push(`Constraint violation: "${rule}"`);
            }
          }
        }

        const isSafe = violations.length === 0;
        const safetyScore = isSafe ? 0.95 : 0.2;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action: args.action,
                  safe: isSafe,
                  safetyScore,
                  activeConstraintsCount: activeConstraints.length,
                  activeConstraints,
                  violations,
                  recommendation: isSafe
                    ? 'Action is consistent with memory constraints and safety guidelines. Proceed.'
                    : 'Action violates active pinned constraints. Adjust plan before proceeding.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    }
  );
}
