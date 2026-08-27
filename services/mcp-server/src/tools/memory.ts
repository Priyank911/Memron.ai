/**
 * Memory Tools — Core memory CRUD operations via MCP.
 *
 * memory.store   → Encrypt + store + generate pointer
 * memory.search  → Search by query, bucket, tags
 * memory.update  → Update content/metadata (with forensic snapshot)
 * memory.delete  → Soft-delete a memory by pointer
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { encrypt, decrypt, hashContent } from '../lib/encryption.js';
import { generateEmbedding, buildEmbeddingInput, toPgVector } from '../lib/embeddings.js';
import { generatePointerId, estimateTokens, calculateCompression, classifyBucket, isValidPointerId, VALID_BUCKETS } from '../lib/pointer.js';
import { ValidationError, NotFoundError, formatToolError } from '../lib/errors.js';
import { config } from '../config.js';
import * as db from '../db/queries.js';
import { autoIngest } from '../lib/auto-ingest.js';

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

/**
 * Register all memory tools on the MCP server.
 */
export function registerMemoryTools(server: McpServer): void {

  // ─── memory.store ──────────────────────────────────────────
  server.tool(
    'memory_store',
    'Store content as an encrypted memory and receive a compressed pointer. Use this to save context, conversation snippets, tool outputs, or any data for later retrieval. You can store into predefined buckets (conversation, tool-results, preferences, knowledge, system, custom) or any user-created sub-bucket slug.',
    {
      content: z.string().min(1).max(config.memory.maxContentLength).describe('The content to store'),
      bucket: z.string().max(100).optional().describe('Bucket slug — predefined (conversation, tool-results, preferences, knowledge, system, custom) or a custom sub-bucket slug you created'),
      tags: z.array(z.string().max(50)).max(20).optional().describe('Tags for search and organization'),
      title: z.string().max(500).optional().describe('Title or summary (auto-generated from first 100 chars if omitted)'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const orgId = getOrgId(extra.authInfo);
        const apiKeyId = getApiKeyId(extra.authInfo);
        const content = args.content;

        // Resolve bucket: use provided slug, validate it, or auto-classify
        let bucket: string;
        if (args.bucket) {
          // Validate the bucket exists (predefined or user-created)
          const isValid = await db.isValidUserBucket(userId, args.bucket);
          if (!isValid) {
            throw new ValidationError(`Bucket "${args.bucket}" does not exist. Create it first with memory_create_bucket, or use a predefined bucket: ${VALID_BUCKETS.join(', ')}`);
          }
          bucket = args.bucket;
        } else {
          bucket = classifyBucket(content);
        }

        // Generate title from content if not provided
        const title = args.title || content.slice(0, 100).replace(/\n/g, ' ').trim();

        // Estimate tokens before encryption
        const originalTokens = estimateTokens(content);

        // Encrypt content (AES-256-GCM)
        const encrypted = encrypt(content);
        const contentHash = hashContent(content);

        // Generate unique pointer ID
        const pointerId = generatePointerId();

        // Calculate token spent on the pointer itself
        const pointerTokens = 3;
        const compression = calculateCompression(originalTokens);

        // Compute embedding from plaintext (before it's only available encrypted)
        const embeddingInput = buildEmbeddingInput(title, args.tags ?? [], content);
        const embedding = await generateEmbedding(embeddingInput);
        const embeddingStr = embedding ? toPgVector(embedding) : undefined;

        // Store in database
        await db.insertMemory({
          pointerId,
          userId,
          orgId,
          bucket,
          title,
          contentEncrypted: encrypted.encrypted,
          contentIv: encrypted.iv,
          contentTag: encrypted.tag,
          contentHash,
          tags: args.tags ?? [],
          tokenCount: pointerTokens,
          originalTokens,
          metadata: { compressionRate: compression.rate },
          apiKeyId,
          embedding: embeddingStr,
        });

        // Trigger background graph distillation & auto-ingestion (entities, relations, contradiction checks)
        autoIngest({
          sessionId: `mem_${pointerId}`,
          userId,
          messages: [
            { role: 'user', content: title || 'Context' },
            { role: 'assistant', content },
          ],
          useLLM: false,
        }).catch((err) => {
          console.warn('[MemoryStore] Background auto-ingestion warning:', err);
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId,
              bucket,
              tags: args.tags ?? [],
              originalTokens,
              pointerTokens,
              compressionRate: compression.rate,
              compressionRatio: compression.ratio,
              tokensSaved: compression.saved,
              title,
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

  // ─── memory.search ─────────────────────────────────────────
  server.tool(
    'memory_search',
    'Search across stored memories by query text, bucket, or tags. Returns matching memories with metadata (not decrypted content).',
    {
      query: z.string().max(500).optional().describe('Search query text (matches against titles and tags)'),
      bucket: z.enum(VALID_BUCKETS as unknown as [string, ...string[]]).optional().describe('Filter by bucket'),
      tags: z.array(z.string()).optional().describe('Filter by tags (matches any)'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        const memories = await db.searchMemories({
          userId,
          queryText: args.query,
          bucket: args.bucket,
          tags: args.tags,
          limit: args.limit ?? 20,
        });

        const results = memories.map((m) => ({
          pointerId: m.pointer_id,
          title: m.title,
          bucket: m.bucket,
          tags: m.tags,
          originalTokens: m.original_tokens,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: results.length,
              results,
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

  // ─── memory.update ─────────────────────────────────────────
  server.tool(
    'memory_update',
    'Update an existing memory by pointer ID. Creates a forensic snapshot of the previous version before modifying. Can update content, tags, or bucket.',
    {
      pointerId: z.string().describe('The pointer ID of the memory to update (e.g. ptr_kN7xQ2mP)'),
      content: z.string().max(config.memory.maxContentLength).optional().describe('New content (triggers re-encryption)'),
      tags: z.array(z.string().max(50)).max(20).optional().describe('New tags (replaces existing)'),
      bucket: z.enum(VALID_BUCKETS as unknown as [string, ...string[]]).optional().describe('New bucket'),
      title: z.string().max(500).optional().describe('New title'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        if (!isValidPointerId(args.pointerId)) {
          throw new ValidationError('Invalid pointer ID format. Expected: ptr_xxxxxxxx');
        }

        // Find existing memory
        const existing = await db.getMemoryByPointer(args.pointerId, userId);
        if (!existing) {
          throw new NotFoundError('Memory', args.pointerId);
        }

        // Create forensic snapshot of the current version
        await db.createSnapshot({
          memoryId: existing.id,
          pointerId: existing.pointer_id,
          contentHash: existing.content_hash,
          snapshotEncrypted: existing.content_encrypted,
          snapshotIv: existing.content_iv,
          snapshotTag: existing.content_tag,
          reason: 'pre-mutation',
          createdBy: userId,
        });

        // Build update params
        const updateParams: Parameters<typeof db.updateMemory>[0] = {
          pointerId: args.pointerId,
          userId,
          tags: args.tags,
          bucket: args.bucket,
          title: args.title,
        };

        // If content changed, re-encrypt
        if (args.content) {
          const encrypted = encrypt(args.content);
          updateParams.contentEncrypted = encrypted.encrypted;
          updateParams.contentIv = encrypted.iv;
          updateParams.contentTag = encrypted.tag;
          updateParams.contentHash = hashContent(args.content);
          updateParams.originalTokens = estimateTokens(args.content);
          updateParams.tokenCount = 3;
          if (!args.title) {
            updateParams.title = args.content.slice(0, 100).replace(/\n/g, ' ').trim();
          }
        }

        const updated = await db.updateMemory(updateParams);
        if (!updated) {
          throw new Error('Update failed — memory may have been deleted');
        }

        // Recompute embedding if content or title changed
        if (updated && (args.content || args.title)) {
          const embInput = buildEmbeddingInput(
            updated.title,
            updated.tags,
            args.content ?? '',
          );
          const emb = await generateEmbedding(embInput);
          if (emb) {
            await db.updateMemoryEmbedding(updated.id, toPgVector(emb));
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId: args.pointerId,
              updated: true,
              snapshotCreated: true,
              updatedFields: Object.keys(args).filter(k => k !== 'pointerId' && args[k as keyof typeof args] !== undefined),
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

  // ─── memory.delete ─────────────────────────────────────────
  server.tool(
    'memory_delete',
    'Soft-delete a memory by pointer ID. The memory is marked inactive but retained for forensic audit. This action is reversible by an admin.',
    {
      pointerId: z.string().describe('The pointer ID of the memory to delete'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        if (!isValidPointerId(args.pointerId)) {
          throw new ValidationError('Invalid pointer ID format. Expected: ptr_xxxxxxxx');
        }

        const deleted = await db.softDeleteMemory(args.pointerId, userId);
        if (!deleted) {
          throw new NotFoundError('Memory', args.pointerId);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId: args.pointerId,
              deleted: true,
              note: 'Memory soft-deleted. Retained for forensic audit.',
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

  // ─── memory.list_buckets ───────────────────────────────────
  server.tool(
    'memory_list_buckets',
    'List all memory buckets for the authenticated user. Returns bucket names, slugs, descriptions, and memory counts. Includes both predefined and user-created sub-buckets.',
    {},
    async (_args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const buckets = await db.listBuckets(userId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ buckets }, null, 2),
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

  // ─── memory.create_bucket ──────────────────────────────────
  server.tool(
    'memory_create_bucket',
    'Create a new sub-bucket inside the main bucket to organize memories. Sub-buckets let you group related data — e.g. "project-notes", "meeting-logs", "research". Use memory_list_buckets to see existing buckets. Max 50 buckets per user.',
    {
      name: z.string().min(1).max(255).describe('Human-readable name for the bucket (e.g. "Project Notes")'),
      slug: z.string().min(1).max(100)
        .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens')
        .describe('URL-safe slug identifier (e.g. "project-notes"). Lowercase, hyphens allowed, no spaces.'),
      description: z.string().max(500).optional().describe('Optional description of what this bucket is for'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const orgId = getOrgId(extra.authInfo);

        // Don't allow overwriting predefined bucket slugs
        const reserved = ['conversation', 'tool-results', 'preferences', 'knowledge', 'system', 'custom', 'main'];
        if (reserved.includes(args.slug)) {
          throw new ValidationError(`"${args.slug}" is a reserved bucket name. Choose a different slug.`);
        }

        // Check if bucket already exists
        const existing = await db.getBucketBySlug(userId, args.slug);
        if (existing) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                bucketId: existing.bucketId,
                slug: existing.slug,
                name: existing.name,
                description: existing.description,
                memoryCount: existing.memoryCount,
                note: 'Bucket already exists — returning existing bucket info.',
              }, null, 2),
            }],
          };
        }

        const bucket = await db.createBucket({
          userId,
          orgId,
          name: args.name,
          slug: args.slug,
          description: args.description,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              bucketId: bucket.bucketId,
              slug: bucket.slug,
              name: bucket.name,
              description: bucket.description,
              note: `Sub-bucket "${bucket.name}" created. Use bucket: "${bucket.slug}" when storing memories.`,
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
