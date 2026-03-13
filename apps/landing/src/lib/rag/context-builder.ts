/**
 * RAG Context Builder — Hybrid vector + keyword retrieval with RRF fusion.
 *
 * Architecture:
 *   User query → embed query → parallel [vector search, keyword search]
 *                → Reciprocal Rank Fusion → top-K context
 *
 * Search strategy:
 *   1. Vector search — embed user query, cosine similarity on pgvector embeddings
 *   2. Keyword search — ILIKE on title/tags with stop-word extraction
 *   3. RRF fusion — merge both result sets using Reciprocal Rank Fusion (k=60)
 *   4. Fallback — if both empty, fetch recent memories for conversational context
 *
 * Security:
 *   - All queries scoped by user_id + org_id (buildUserWhereClause)
 *   - SQL parameters fully parameterized — no string concatenation
 *   - Retrieved content truncated to context window budget
 */

import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { embedQuery, toPgVector } from '@/lib/embeddings';
import { getSimilarQAForContext, type SimilarQA } from '@/lib/playground-history';

// ─── Types ───────────────────────────────────────────────────

export interface RetrievedMemory {
  id: string;
  bucket: string;
  title: string;
  tags: string[];
  tokenCount: number;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RAGContext {
  memories: RetrievedMemory[];
  query: string;
  bucket: string | null;
  totalFound: number;
  contextText: string;         // Flattened for LLM prompt — already truncated
  hasRelevantData: boolean;
  pastQA: SimilarQA[];         // Similar past Q&A for few-shot context
}

// ─── Constants ───────────────────────────────────────────────

/** Maximum chars sent to LLM as context (≈3k tokens at ~4 chars/token) */
const MAX_CONTEXT_CHARS = 12_000;
/** Maximum memories to retrieve per search method */
const MAX_RETRIEVE = 20;
/** Maximum memories to include in LLM context after scoring */
const TOP_K = 8;
/** RRF constant — standard value from literature */
const RRF_K = 60;

// ─── Stop words ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'of', 'at', 'by', 'for', 'with', 'about',
  'against', 'between', 'through', 'during', 'before', 'after', 'above',
  'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
  'if', 'while', 'as', 'until', 'into', 'also', 'any',
  // Common playground question starters
  'show', 'tell', 'give', 'list', 'find', 'get', 'know', 'please',
  'hey', 'hi', 'hello', 'thanks', 'thank', 'okay', 'ok',
]);

function extractKeywords(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const keywords = words.filter(w => !STOP_WORDS.has(w));
  return keywords.length > 0 ? keywords : words;
}

// ─── SQL helpers ─────────────────────────────────────────────

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

const SAFE_COLUMNS = `id, pointer_id, bucket, title, tags, token_count, metadata, created_at`;

function buildKeywordConditions(
  keywords: string[],
  startIdx: number,
): { clause: string; params: string[]; nextIdx: number } {
  if (keywords.length === 0) {
    return { clause: 'TRUE', params: [], nextIdx: startIdx };
  }

  const conditions: string[] = [];
  const params: string[] = [];
  let idx = startIdx;

  for (const kw of keywords) {
    const pattern = `%${escapeLike(kw)}%`;
    conditions.push(
      `(title ILIKE $${idx} OR array_to_string(tags, ' ') ILIKE $${idx})`,
    );
    params.push(pattern);
    idx++;
  }

  return { clause: conditions.join(' OR '), params, nextIdx: idx };
}

// ─── Reciprocal Rank Fusion ─────────────────────────────────

interface RankedRow {
  row: any;
  rrfScore: number;
}

/**
 * Fuse two ranked result lists using Reciprocal Rank Fusion.
 * score(d) = sum( 1 / (k + rank_i) ) for each retrieval method i
 */
function fuseRRF(vectorRows: any[], keywordRows: any[]): any[] {
  const scoreMap = new Map<string | number, { row: any; score: number }>();

  const addScores = (rows: any[]) => {
    rows.forEach((row, rank) => {
      const key = row.pointer_id || row.id;
      const existing = scoreMap.get(key);
      const rrfContrib = 1 / (RRF_K + rank + 1); // rank is 0-indexed, RRF uses 1-indexed
      if (existing) {
        existing.score += rrfContrib;
      } else {
        scoreMap.set(key, { row, score: rrfContrib });
      }
    });
  };

  addScores(vectorRows);
  addScores(keywordRows);

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(v => ({ ...v.row, _rrfScore: v.score }));
}

// ─── Context builder ─────────────────────────────────────────

export async function buildRAGContext(
  clerkId: string,
  query: string,
  bucket: string | null,
  limit: number = TOP_K,
): Promise<RAGContext> {
  const empty: RAGContext = {
    memories: [],
    query,
    bucket,
    totalFound: 0,
    contextText: '',
    hasRelevantData: false,
    pastQA: [],
  };

  // 1. Resolve user
  const supaUser = await resolveSupabaseUser(clerkId);
  if (!supaUser) return empty;

  const { id: uid, orgId } = supaUser;
  const { where: whereUser, params: userParams, nextIdx } = buildUserWhereClause(uid, orgId);

  // 2. Run vector search, keyword search, and past Q&A lookup in parallel
  const keywords = extractKeywords(query);

  const [vectorRows, keywordRows, pastQA] = await Promise.all([
    vectorSearch(whereUser, userParams, nextIdx, query, bucket),
    keywordSearch(whereUser, userParams, nextIdx, keywords, bucket),
    getSimilarQAForContext(uid, query, bucket, 3),
  ]);

  // 3. Fuse results with RRF (or fallback to broad search)
  let fusedRows: any[];

  if (vectorRows.length > 0 || keywordRows.length > 0) {
    fusedRows = fuseRRF(vectorRows, keywordRows);
  } else {
    // Fallback: fetch recent memories
    fusedRows = await broadSearch(whereUser, userParams, nextIdx, bucket);
  }

  if (fusedRows.length === 0) return empty;

  // 4. Map to RetrievedMemory
  const memories: RetrievedMemory[] = fusedRows.slice(0, limit).map((r: any) => {
    const tags = Array.isArray(r.tags) ? r.tags : [];
    return {
      id: r.pointer_id || String(r.id),
      bucket: r.bucket || 'unknown',
      title: r.title || '(untitled)',
      tags,
      tokenCount: parseInt(r.token_count || '0', 10),
      score: r._rrfScore ?? 0.3,
      content: r.title || '',  // Content is encrypted; use title as display text
      metadata: r.metadata || {},
      createdAt: r.created_at,
    };
  });

  // 5. Build context text
  let contextText = '';

  // Inject relevant past Q&A as few-shot examples first
  if (pastQA.length > 0) {
    contextText += '\n--- Previous Related Conversations ---\n';
    for (const qa of pastQA) {
      const entry = `\nQ: ${qa.query}\nA: ${qa.answer.slice(0, 400)}\n`;
      if (contextText.length + entry.length > MAX_CONTEXT_CHARS * 0.3) break; // Cap past Q&A at 30% of budget
      contextText += entry;
    }
    contextText += '\n--- Retrieved Memories ---\n';
  }

  for (const m of memories) {
    const entry = buildMemoryEntry(m);
    if (contextText.length + entry.length > MAX_CONTEXT_CHARS) break;
    contextText += entry;
  }

  return {
    memories,
    query,
    bucket,
    totalFound: fusedRows.length,
    contextText,
    hasRelevantData: memories.length > 0,
    pastQA,
  };
}

// ─── Search functions ────────────────────────────────────────

/**
 * Vector similarity search using pgvector cosine distance.
 * Returns rows ordered by semantic similarity to the query.
 */
async function vectorSearch(
  whereUser: string,
  userParams: (string | number)[],
  nextIdx: number,
  queryText: string,
  bucket: string | null,
): Promise<any[]> {
  try {
    const queryEmbedding = await embedQuery(queryText);
    if (!queryEmbedding) return []; // Embedding not configured or failed

    const embStr = toPgVector(queryEmbedding);
    const queryParams: (string | number)[] = [...userParams];
    let idx = nextIdx;

    // Embedding parameter
    const embIdx = idx;
    queryParams.push(embStr);
    idx++;

    let sql = `SELECT ${SAFE_COLUMNS}, (embedding <=> $${embIdx}::vector) AS vector_distance
      FROM memories
      WHERE (${whereUser}) AND is_active = true AND embedding IS NOT NULL`;

    if (bucket) {
      sql += ` AND bucket = $${idx}`;
      queryParams.push(bucket);
      idx++;
    }

    sql += ` ORDER BY embedding <=> $${embIdx}::vector LIMIT $${idx}`;
    queryParams.push(MAX_RETRIEVE);

    const result = await supaQuery(sql, queryParams);
    return result.rows;
  } catch (e) {
    console.error('[RAG] Vector search failed, falling back:', e);
    return [];
  }
}

/**
 * Keyword ILIKE search on title and tags.
 */
async function keywordSearch(
  whereUser: string,
  userParams: (string | number)[],
  nextIdx: number,
  keywords: string[],
  bucket: string | null,
): Promise<any[]> {
  if (keywords.length === 0) return [];

  const queryParams: (string | number)[] = [...userParams];
  let idx = nextIdx;

  let sql = `SELECT ${SAFE_COLUMNS} FROM memories WHERE (${whereUser}) AND is_active = true`;

  if (bucket) {
    sql += ` AND bucket = $${idx}`;
    queryParams.push(bucket);
    idx++;
  }

  const kw = buildKeywordConditions(keywords, idx);
  if (kw.clause !== 'TRUE') {
    sql += ` AND (${kw.clause})`;
    queryParams.push(...kw.params);
    idx = kw.nextIdx;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  queryParams.push(MAX_RETRIEVE);

  try {
    const result = await supaQuery(sql, queryParams);
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Broad recent search — fallback when both vector and keyword return nothing.
 */
async function broadSearch(
  whereUser: string,
  userParams: (string | number)[],
  nextIdx: number,
  bucket: string | null,
): Promise<any[]> {
  const queryParams: (string | number)[] = [...userParams];
  let idx = nextIdx;

  let sql = `SELECT ${SAFE_COLUMNS} FROM memories WHERE (${whereUser}) AND is_active = true`;

  if (bucket) {
    sql += ` AND bucket = $${idx}`;
    queryParams.push(bucket);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  queryParams.push(MAX_RETRIEVE);

  try {
    const result = await supaQuery(sql, queryParams);
    return result.rows;
  } catch {
    return [];
  }
}

// ─── Context text builder ────────────────────────────────────

function buildMemoryEntry(m: RetrievedMemory): string {
  let entry = `\n---\nMemory: "${m.title}"\nBucket: ${m.bucket}\n`;
  if (m.tags.length > 0) {
    entry += `Tags: ${m.tags.join(', ')}\n`;
  }
  if (m.content && m.content !== m.title) {
    entry += `Content: ${m.content}\n`;
  }
  if (m.metadata && Object.keys(m.metadata).length > 0) {
    const meta = m.metadata as Record<string, unknown>;
    const useful = Object.entries(meta)
      .filter(([k, v]) => v && typeof v !== 'object' && k !== 'id' && k !== 'user_id')
      .map(([k, v]) => `  ${k}: ${String(v)}`)
      .join('\n');
    if (useful) entry += `Metadata:\n${useful}\n`;
  }
  entry += `Tokens: ${m.tokenCount} | Created: ${m.createdAt}\n`;
  return entry;
}
