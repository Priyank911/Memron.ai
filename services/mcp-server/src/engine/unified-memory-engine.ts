/**
 * Memron v2 application boundary.
 *
 * MCP and HTTPS deliberately call the same two operations from this module.
 * Transport concerns, legacy retrieval modes, and connector-specific envelopes
 * stay outside the memory engine.
 */
import { encrypt, hashContent } from '../lib/encryption.js';
import {
  buildEmbeddingInput,
  generateEmbedding,
  isEmbeddingConfigured,
  toPgVector,
} from '../lib/embeddings.js';
import { estimateTokens, generatePointerId, classifyBucket } from '../lib/pointer.js';
import { fingerprint } from '../lib/privacy.js';
import { config } from '../config.js';
import * as db from '../db/queries.js';
import { enqueueMemoryIndexJob, type MemoryIndexQueue } from '../lib/memory-index-queue.js';
import { hybridRetrieve } from '../retrieval/hybrid-retrieval.js';

export interface StoreRequest {
  content: string;
  tags?: string[];
  importance?: number;
  space?: string;
}

export interface RecallRequest {
  query: string;
  budget?: number;
  space?: string;
}

export interface StoreResponse {
  ok: true;
  ref: string;
  filed_as: string;
  space: string;
}

export interface RecallResult {
  ref: string;
  text: string;
  type: string;
  confidence: number;
  age: string;
}

export interface RecallResponse {
  ok: true;
  answer_ready: boolean;
  budget_used: number;
  results: RecallResult[];
}

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'EngineError';
  }
}

export interface QueryProfile {
  kind: 'fact' | 'relationship' | 'broad';
  budget: number;
  weights: {
    vector: number;
    bm25: number;
    bm25Atomic: number;
    graph: number;
    recency: number;
  };
}

const MAX_RECALL_BUDGET = 10_000;

/** Small deterministic classifier: no extra model call on the hot path. */
export function classifyRecallQuery(query: string): QueryProfile {
  const normalized = query.trim();
  const relationship = /\b(related|relate|connected|connection|between|relationship|depends on|linked|who else|how does .* relate|what changed between)\b/i.test(normalized)
    || (normalized.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b/g) || []).length >= 2;
  const broad = /\b(everything|all|overview|全|entire|whole|complete|across|history of|tell me about the project)\b/i.test(normalized)
    || normalized.length > 220;
  const temporal = /\b(recent|recently|latest|newest|current|still|when|changed|before|after|since)\b/i.test(normalized);
  const exact = /["'`]/.test(normalized) || /\b[A-Z][A-Za-z0-9_-]{2,}\b/.test(normalized);

  if (broad) {
    return {
      kind: 'broad',
      budget: 10_000,
      weights: { vector: 3.0, bm25: exact ? 1.2 : 0.8, bm25Atomic: 0.3, graph: relationship ? 1.6 : 1.0, recency: temporal ? 0.9 : 0.4 },
    };
  }
  if (relationship) {
    return {
      kind: 'relationship',
      budget: 4_000,
      weights: { vector: 3.0, bm25: exact ? 1.2 : 0.8, bm25Atomic: 0.3, graph: 1.6, recency: temporal ? 0.9 : 0.4 },
    };
  }
  return {
    kind: 'fact',
    budget: 800,
    weights: { vector: 3.0, bm25: exact ? 1.2 : 0.8, bm25Atomic: 0.3, graph: 1.0, recency: temporal ? 0.9 : 0.4 },
  };
}

function inferType(content: string): string {
  if (/\b(i|we)\s+(prefer|like|love|hate|always|never|usually)\b/i.test(content)) return 'preference';
  if (/\b(because|therefore|depends on|uses|switched|migrat(?:e|ed)|connected to|related to)\b/i.test(content)) return 'relationship';
  if (/\b(step|first|then|finally|run this|workflow|procedure)\b/i.test(content)) return 'recipe';
  if (/\b(error|failed|failure|exception|bug)\b/i.test(content)) return 'episode';
  return 'fact';
}

function inferSpace(request: StoreRequest, type: string): string {
  const space = request.space?.trim();
  if (space) return space.slice(0, 255);
  if (type === 'preference') return 'personal';
  return 'default';
}

function bucketFor(type: string, space: string, content: string): string {
  if (space !== 'default') return type === 'preference' ? 'preferences' : 'knowledge';
  if (type === 'preference') return 'preferences';
  if (type === 'recipe' || type === 'relationship' || type === 'fact' || type === 'episode') return 'knowledge';
  return classifyBucket(content);
}

function clampBudget(value: number | undefined, profile: QueryProfile): number {
  if (value === undefined) return profile.budget;
  if (!Number.isInteger(value) || value < 1 || value > MAX_RECALL_BUDGET) {
    throw new EngineError('invalid_budget', { min: 1, max: MAX_RECALL_BUDGET });
  }
  return value;
}

function relativeAge(date: Date): string {
  const ageMs = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function resultConfidence(fusedScore: number, vectorSimilarity?: number): number {
  const semantic = vectorSimilarity == null ? 0 : Math.max(0, Math.min(1, vectorSimilarity));
  const fused = Math.max(0, Math.min(1, fusedScore * 20));
  return Math.round(Math.max(0.01, Math.min(0.99, 0.35 + semantic * 0.45 + fused * 0.2)) * 100) / 100;
}

export async function storeMemory(
  userId: number,
  request: StoreRequest,
  options?: { orgId?: number; apiKeyId?: number; queue?: MemoryIndexQueue },
): Promise<StoreResponse> {
  const content = request.content?.trim();
  if (!content) throw new EngineError('content_required');
  if (content.length > Math.min(50_000, config.memory.maxContentLength)) {
    throw new EngineError('content_too_long', { limit: Math.min(50_000, config.memory.maxContentLength) });
  }
  if (request.tags && (request.tags.length > 20 || request.tags.some(tag => tag.length > 50))) {
    throw new EngineError('invalid_tags');
  }
  if (request.importance !== undefined && (!Number.isFinite(request.importance) || request.importance < 0 || request.importance > 1)) {
    throw new EngineError('invalid_importance');
  }

  const type = inferType(content);
  const space = inferSpace(request, type);
  const title = content.slice(0, 100).replace(/\s+/g, ' ').trim();
  const bucket = bucketFor(type, space, content);
  const pointerId = generatePointerId();
  const encrypted = encrypt(content);
  const embedding = await generateEmbedding(buildEmbeddingInput(title, request.tags || [], content));

  if (!embedding && isEmbeddingConfigured()) {
    const fp = fingerprint(content);
    console.warn(JSON.stringify({ event: 'v2_sync_embedding_unavailable', contentHash: fp.hash, contentLen: fp.len }));
  }

  await db.insertMemory({
    pointerId,
    userId,
    orgId: options?.orgId,
    bucket,
    title,
    contentEncrypted: encrypted.encrypted,
    contentIv: encrypted.iv,
    contentTag: encrypted.tag,
    contentHash: hashContent(content),
    tags: request.tags || [],
    tokenCount: 3,
    originalTokens: estimateTokens(content),
    metadata: {
      type,
      source: 'agent',
      space,
      engine_version: 'v2',
      created_via: 'memory_engine_v2',
    },
    status: 'knowledge',
    source: 'agent',
    decayExempt: type === 'preference',
    apiKeyId: options?.apiKeyId,
    subPath: space,
    importance: request.importance ?? (type === 'preference' ? 0.8 : 0.5),
    embedding: embedding ? toPgVector(embedding) : undefined,
    indexStatus: embedding ? 'queued' : 'pending',
  });

  await enqueueMemoryIndexJob({
    userId,
    pointerId,
    orgId: options?.orgId,
    title,
    type,
    bucket,
  }, options?.queue);

  return { ok: true, ref: pointerId, filed_as: type, space };
}

export async function recallMemory(userId: number, request: RecallRequest): Promise<RecallResponse> {
  const query = request.query?.trim();
  if (!query) throw new EngineError('query_required');
  if (query.length > 2_000) throw new EngineError('query_too_long', { limit: 2_000 });

  const profile = classifyRecallQuery(query);
  const budget = clampBudget(request.budget, profile);
  let embedding: number[] | undefined;
  try {
    embedding = (await generateEmbedding(buildEmbeddingInput(query, [], ''))) || undefined;
  } catch {
    embedding = undefined;
  }

  const retrieved = await hybridRetrieve({
    userId,
    query,
    embedding,
    topK: 100,
    tokenBudget: budget,
    traceId: `v2_${crypto.randomUUID()}`,
    signals: profile.weights,
    space: request.space?.trim() || undefined,
  });

  const rankedResults = retrieved.memories
    .filter(item => item.source === 'memory' || item.source === 'atomic_memory')
    .filter(item => !request.space || item.metadata?.space === request.space)
    .map(item => ({
      item,
      result: {
        ref: item.id,
        text: item.content,
        type: String(item.metadata?.type || item.memoryType || 'fact'),
        confidence: resultConfidence(item.fusedScore, item.vectorSimilarity),
        age: relativeAge(item.createdAt),
      },
    }));

  const results: RecallResult[] = rankedResults.map(({ result }) => result);

  const budgetUsed = Math.min(budget, results.reduce((sum, result) => sum + estimateTokens(result.text), 0));
  const top = rankedResults[0];
  // A BM25 match is deterministic keyword evidence. It must remain usable
  // when embeddings are unavailable or legacy memories are still pending
  // backfill; otherwise the engine finds an exact fact and then hides it.
  const hasKeywordEvidence = Boolean(top?.item.signals?.bm25 !== undefined);
  const answerReady = Boolean(
    top && (top.result.confidence >= 0.55 || hasKeywordEvidence),
  );

  return {
    ok: true,
    answer_ready: answerReady,
    budget_used: budgetUsed,
    results: answerReady ? results : [],
  };
}
