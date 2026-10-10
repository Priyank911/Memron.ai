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
} from '../lib/embeddings.js';
import { estimateTokens, generatePointerId, classifyBucket } from '../lib/pointer.js';
import { fingerprint } from '../lib/privacy.js';
import { config } from '../config.js';
import * as db from '../db/queries.js';
import { enqueueMemoryIndexJob, type MemoryIndexQueue } from '../lib/memory-index-queue.js';
import { hybridRetrieve } from '../retrieval/hybrid-retrieval.js';
import { decrypt } from '../lib/encryption.js';
import { buildShellRows, expandRelatedShells, lookupShells, type ShellHit } from '../retrieval/shell-index.js';
import { query as dbQuery } from '../db/client.js';

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

export interface RecallAnswer {
  query: string;
  answer_ready: boolean;
  budget_used: number;
  results: RecallResult[];
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
  matched_by?: string[];
  matched_terms?: string[];
  lexical_coverage?: number;
  /** Workspace the memory was stored in, so callers can group results. */
  space?: string;
}

export interface RecallResponse {
  ok: true;
  answer_ready: boolean;
  budget_used: number;
  results: RecallResult[];
  /** Present when one request contains multiple explicit questions. */
  answers?: RecallAnswer[];
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

const QUESTION_WORDS = new Set([
  'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'tell', 'show', 'find', 'give',
  'describe', 'explain', 'recall', 'remember', 'list', 'can', 'could', 'do', 'does', 'did', 'is',
  'are', 'was', 'were', 'will', 'would', 'please', 'the', 'and', 'also',
]);

/** Named-looking tokens, ignoring sentence-initial question or function words. */
function countProperNouns(text: string): number {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9_.-]{2,}\b/g)) {
    const token = m[0];
    const named = /^[A-Z]/.test(token) || /[a-z][A-Z]/.test(token);
    if (named && !QUESTION_WORDS.has(token.toLowerCase())) found.add(token.toLowerCase());
  }
  return found.size;
}

/** Small deterministic classifier: no extra model call on the hot path. */
export function classifyRecallQuery(query: string): QueryProfile {
  const normalized = query.trim();
  const relationship = /\b(related|relate|connected|connection|between|relationship|depends on|linked|who else|how does .* relate|what changed between)\b/i.test(normalized)
    || countProperNouns(normalized) >= 2;
  const broad = /\b(everything|overview|entire|whole|complete|across|history of|tell me about the project)\b/i.test(normalized)
    || normalized.length > 220;
  const temporal = /\b(recent|recently|latest|newest|current|still|when|changed|before|after|since)\b/i.test(normalized);
  const exact = /["'`]/.test(normalized) || countProperNouns(normalized) >= 1;

  if (broad) {
    return {
      kind: 'broad',
      budget: 10_000,
      weights: { vector: 3.0, bm25: exact ? 1.4 : 1.0, bm25Atomic: 0.15, graph: relationship ? 1.6 : 1.0, recency: temporal ? 0.9 : 0.4 },
    };
  }
  if (relationship) {
    return {
      kind: 'relationship',
      budget: 4_000,
      weights: { vector: 3.0, bm25: exact ? 1.4 : 1.0, bm25Atomic: 0.15, graph: 1.6, recency: temporal ? 0.9 : 0.4 },
    };
  }
  return {
    kind: 'fact',
    budget: 800,
    weights: { vector: 3.0, bm25: exact ? 1.4 : 1.0, bm25Atomic: 0.15, graph: 1.0, recency: temporal ? 0.9 : 0.4 },
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

function resultConfidence(fusedScore: number, vectorSimilarity?: number, signalCount?: number): number {
  // Base from fused score — normalized to [0,1] range.
  // fusedScore typically ranges 0.01–0.12, so *10 maps to 0.1–1.2 before clamping.
  const fused = Math.max(0, Math.min(1, fusedScore * 10));

  // Semantic contribution — only meaningful when similarity is genuinely high.
  // Below 0.65, vector matches in high-dim spaces are essentially noise.
  const semantic = vectorSimilarity == null ? 0
    : vectorSimilarity >= 0.75 ? vectorSimilarity  // strong match
    : vectorSimilarity >= 0.65 ? vectorSimilarity * 0.6  // moderate — discount
    : 0;  // weak — no contribution

  // Multi-signal corroboration bonus: a result confirmed by 3+ independent
  // signals is more trustworthy than one found by a single noisy channel.
  const corroboration = (signalCount ?? 1) >= 3 ? 0.08
    : (signalCount ?? 1) >= 2 ? 0.04
    : 0;

  // Weighted combination: fused rank dominates, semantic adds precision,
  // corroboration rewards multi-signal agreement.
  const raw = 0.20 + fused * 0.40 + semantic * 0.30 + corroboration;
  return Math.round(Math.max(0.01, Math.min(0.99, raw)) * 100) / 100;
}

/** Split only explicit question boundaries; never split ordinary "and" text. */
export function splitRecallQuestions(input: string): string[] {
  const normalized = input.replace(/\r/g, '').trim();
  if (!normalized) return [];
  const clean = (part: string) => part.trim().replace(/[?]+$/g, '').trim();
  const byQuestionMark = normalized.split(/\?+/).map(clean).filter(Boolean);
  const isQuestion = (part: string) => /^(?:(?:and|also)\s+)?(?:what|which|who|where|when|why|how|can|do|does|is|are|will|would)\b/i.test(part);
  if (byQuestionMark.length > 1 && byQuestionMark.slice(1).every(isQuestion)) return byQuestionMark;
  const byLine = normalized.split(/\n+/).map(clean).filter(Boolean);
  if (byLine.length > 1 && byLine.every(isQuestion)) return byLine;
  return [normalized];
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
      status: 'untriaged',
    },
    // New agent writes must enter the dashboard Inbox. Promotion to Context
    // or Knowledge is an explicit user action, so CLI and VS Code writes do
    // not silently bypass triage.
    status: 'untriaged',
    source: 'agent',
    decayExempt: type === 'preference',
    apiKeyId: options?.apiKeyId,
    subPath: space,
    importance: request.importance ?? (type === 'preference' ? 0.8 : 0.5),
    // Embeddings and graph enrichment are generated by the queue after this
    // row is durable. A provider outage must never turn a successful store
    // into a lost memory or a request timeout.
    embedding: undefined,
    indexStatus: 'pending',
    // Tier 0: shell rows commit atomically with the memory. A stored memory
    // can never exist without its addresses.
    shells: buildShellRows(userId, content, request.tags || []),
  });

  try {
    await enqueueMemoryIndexJob({
      userId,
      pointerId,
      orgId: options?.orgId,
      title,
      type,
      bucket,
    }, options?.queue);
  } catch (error) {
    // The memory is already durable. Keep the write successful and expose the
    // enrichment failure in logs; the outbox/queue repair path can retry it.
    const fp = fingerprint(content);
    console.error(JSON.stringify({
      event: 'memory_index_enqueue_failed',
      pointerId,
      contentHash: fp.hash,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return { ok: true, ref: pointerId, filed_as: type, space };
}

interface ShellRanked {
  hit: ShellHit;
  result: RecallResult;
  cost: number;
}

/** Dereference Tier 0 pointers into decrypted results (budget applied later). */
async function hydrateShellHits(
  userId: number,
  hits: ShellHit[],
  space?: string,
): Promise<ShellRanked[]> {
  if (!hits.length) return [];
  const rows = await dbQuery<any>(
    `SELECT pointer_id, content_encrypted, content_iv, content_tag, metadata, created_at
     FROM memories
     WHERE user_id = $1 AND is_active = true AND pointer_id = ANY($2::text[])`,
    [userId, hits.map((h) => h.pointerId)],
  );
  const byId = new Map<string, any>(rows.rows.map((r: any) => [r.pointer_id, r]));
  const out: ShellRanked[] = [];
  for (const hit of hits) {
    const row = byId.get(hit.pointerId);
    if (!row) continue;
    if (space && row.metadata?.space !== space) continue;
    let text = '';
    try {
      text = decrypt({ encrypted: row.content_encrypted, iv: row.content_iv, tag: row.content_tag });
    } catch {
      continue;
    }
    const related = hit.via === 'related';
    out.push({
      hit,
      cost: estimateTokens(text),
      result: {
        ref: hit.pointerId,
        text,
        type: String(row.metadata?.type || 'fact'),
        confidence: related
          ? 0.5
          : Math.round(Math.min(0.95, 0.55 + 0.4 * hit.weightedCoverage + (hit.nameMatch ? 0.05 : 0)) * 100) / 100,
        age: relativeAge(row.created_at),
        matched_by: [related ? 'shell_related' : 'shell'],
        lexical_coverage: Math.round(hit.coverage * 100) / 100,
        space: typeof row.metadata?.space === 'string' ? row.metadata.space : undefined,
      },
    });
  }
  return out;
}

/**
 * Pick results within budget. When several workspaces hold memories for the
 * same name, the best memory of each workspace goes first, so a tight budget
 * never shows three memories from one conversation and hides the other two.
 */
function selectWithinBudget(ranked: ShellRanked[], budget: number): ShellRanked[] {
  const seenSpace = new Set<string>();
  const first: ShellRanked[] = [];
  const rest: ShellRanked[] = [];
  for (const item of ranked) {
    const key = item.result.space ?? '';
    if (item.hit.via === 'direct' && !seenSpace.has(key)) {
      seenSpace.add(key);
      first.push(item);
    } else {
      rest.push(item);
    }
  }
  const out: ShellRanked[] = [];
  let used = 0;
  for (const item of [...first, ...rest]) {
    if (out.length > 0 && used + item.cost > budget) continue;
    used += item.cost;
    out.push(item);
  }
  // Present in rank order, direct hits before related ones.
  const order = new Map(ranked.map((item, i) => [item.result.ref, i]));
  return out.sort((a, b) => (order.get(a.result.ref)! - order.get(b.result.ref)!));
}

async function recallSingleMemory(userId: number, request: RecallRequest): Promise<RecallAnswer> {
  const query = request.query?.trim();
  if (!query) throw new EngineError('query_required');
  if (query.length > 2_000) throw new EngineError('query_too_long', { limit: 2_000 });

  const profile = classifyRecallQuery(query);
  let budget = clampBudget(request.budget, profile);
  const space = request.space?.trim() || undefined;

  // Tier 0: deterministic address lookup, no embedding.
  let shellRanked: ShellRanked[] = [];
  let shellDecisive = false;
  try {
    const lookup = await lookupShells(userId, query);
    // A decisive answer keeps full matches plus a few anchor holders (the
    // memory that has the rarest keyword but misses a common one), so an
    // accurate one-keyword memory is never silently dropped.
    let usable = lookup.hits;
    if (lookup.decisive) {
      const full = lookup.hits.filter((h) => h.weightedCoverage >= 0.99);
      const anchored = lookup.hits.filter((h) => h.weightedCoverage < 0.99 && h.coversAnchor).slice(0, 3);
      usable = [...full, ...anchored];
    }
    // Several memories behind one name: widen the default budget so they
    // are returned together instead of cut to one.
    if (request.budget === undefined && usable.filter((h) => h.weightedCoverage >= 0.99).length > 1) {
      budget = Math.max(budget, 3_000);
    }
    let hydrated = await hydrateShellHits(userId, usable, space);

    // "jev related": add memories linked through rare shared names.
    if (lookup.analysis.broad && hydrated.length > 0) {
      const direct = hydrated.slice(0, 5).map((h) => h.result.ref);
      const related = await expandRelatedShells(userId, direct, hydrated.map((h) => h.result.ref), 5);
      hydrated = hydrated.concat(await hydrateShellHits(userId, related, space));
    }

    shellRanked = selectWithinBudget(hydrated, budget);
    shellDecisive = lookup.decisive && shellRanked.some((h) => h.hit.via === 'direct');
    console.info(JSON.stringify({
      event: 'shell_recall',
      decisive: shellDecisive,
      hits: lookup.hits.length,
      returned: shellRanked.length,
      terms: lookup.analysis.terms.length,
      broad: lookup.analysis.broad,
      anchor: lookup.anchorTerm ? 'set' : 'none',
      ms: lookup.ms,
    }));
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'shell_lookup_failed',
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    }));
  }

  if (shellDecisive) {
    const results = shellRanked.map(({ result }) => result);
    return {
      query,
      answer_ready: true,
      budget_used: Math.min(budget, results.reduce((sum, r) => sum + estimateTokens(r.text), 0)),
      results,
    };
  }

  // Tier 1: probabilistic fusion. Shell hits that were not decisive still
  // lead the list so a partial address match is never discarded.
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
    space,
    shellHits: shellRanked
      .filter((h) => h.hit.via === 'direct')
      .map((h) => ({ id: h.result.ref, score: h.hit.score })),
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
        confidence: resultConfidence(item.fusedScore, item.vectorSimilarity, Object.keys(item.signals).length),
        age: relativeAge(item.createdAt),
        matched_by: Object.keys(item.signals),
        matched_terms: item.lexicalEvidence?.matchedTerms,
        lexical_coverage: item.lexicalEvidence?.coverage,
      } as RecallResult,
    }));

  // Miss telemetry: Tier 1 found an answer that Tier 0 had no address for.
  // These are the cases to study when widening extraction or aliases.
  if (rankedResults[0] && !shellRanked.some((s) => s.result.ref === rankedResults[0].result.ref)) {
    console.info(JSON.stringify({ event: 'shell_miss_tier1_hit', ref: rankedResults[0].result.ref, hadShellHits: shellRanked.length }));
  }

  const shellById = new Map(shellRanked.map((s) => [s.result.ref, s]));
  const merged: RecallResult[] = shellRanked.map(({ result }) => result);
  for (const { result } of rankedResults) {
    const existing = shellById.get(result.ref);
    if (existing) {
      existing.result.matched_by = ['shell', ...(result.matched_by || [])];
      existing.result.confidence = Math.max(existing.result.confidence, result.confidence);
      continue;
    }
    merged.push(result);
  }

  const budgetUsed = Math.min(budget, merged.reduce((sum, r) => sum + estimateTokens(r.text), 0));
  const top = rankedResults[0];
  // A BM25 match is deterministic keyword evidence. It must remain usable
  // when embeddings are unavailable or legacy memories are still pending
  // backfill; otherwise the engine finds an exact fact and then hides it.
  const hasKeywordEvidence = Boolean(top?.item.signals?.bm25 !== undefined);
  const tier1Ready = Boolean(top && (top.result.confidence >= 0.55 || hasKeywordEvidence));
  const shellReady = shellRanked.some(({ hit }) => hit.via === 'direct' && hit.weightedCoverage >= 0.5);
  const answerReady = tier1Ready || shellReady;

  return {
    query,
    answer_ready: answerReady,
    budget_used: budgetUsed,
    results: answerReady ? merged : [],
  };
}

export async function recallMemory(userId: number, request: RecallRequest): Promise<RecallResponse> {
  const query = request.query?.trim();
  if (!query) throw new EngineError('query_required');
  if (query.length > 2_000) throw new EngineError('query_too_long', { limit: 2_000 });

  const questions = splitRecallQuestions(query);
  if (questions.length <= 1) {
    const answer = await recallSingleMemory(userId, { ...request, query });
    return { ok: true, ...answer };
  }

  const requestedBudget = request.budget;
  const perQuestionBudget = requestedBudget === undefined
    ? undefined
    : Math.max(1, Math.floor(requestedBudget / questions.length));
  const answers = await Promise.all(questions.map((question) => recallSingleMemory(userId, {
    ...request,
    query: question,
    budget: perQuestionBudget,
  })));
  const merged: RecallResult[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    for (const result of answer.results) {
      if (seen.has(result.ref)) continue;
      seen.add(result.ref);
      merged.push(result);
    }
  }
  return {
    ok: true,
    // `answers` is the authoritative per-question result. `results` remains
    // flattened for older MCP clients that only understand the original wire
    // shape.
    answer_ready: answers.some((answer) => answer.answer_ready),
    budget_used: answers.reduce((sum, answer) => sum + answer.budget_used, 0),
    results: merged,
    answers,
  };
}
