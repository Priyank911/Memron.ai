/**
 * BM25 Full-Text Search Signal
 * Uses PostgreSQL's built-in tsvector/tsquery for keyword-based retrieval.
 * Acts as one of the 4 signals in the RRF hybrid retrieval pipeline.
 */

import { query } from '../db/client.js';

export interface BM25Result {
  id: string;
  rank: number;
  headline?: string;
}

// PostgreSQL's plainto_tsquery is an implicit AND query. That is useful for
// exact document search, but it is too strict for memory recall: a user often
// asks with different inflections or punctuation than the stored title. Keep
// the lexical query deterministic and bounded, then use an OR prefix query so
// any meaningful anchor can bring a candidate into RRF.
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can',
  'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our',
  'please', 'show', 'tell', 'that', 'the', 'their', 'there', 'this', 'to',
  'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would',
  'you', 'your',
]);

export function extractKeywordTerms(input: string): string[] {
  const tokens = input.toLowerCase().match(/[a-z0-9]+/g) || [];
  return Array.from(new Set(tokens.filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))).slice(0, 16);
}

export function buildKeywordTsQuery(input: string): string {
  return extractKeywordTerms(input).map((term) => `${term}:*`).join(' | ');
}

// Keep this expression byte-for-byte aligned with the schema's GIN index.
// Including tags and bucket makes old memories discoverable even when their
// title is only a short summary.
const SEARCH_TEXT = `regexp_replace(
  coalesce(title, '') || ' ' ||
  array_to_string(coalesce(tags, ARRAY[]::text[]), ' ') || ' ' ||
  coalesce(bucket, ''),
  '[^[:alnum:]]+', ' ', 'g'
)`;

async function fallbackMemoryKeywordSearch(userId: number, terms: string[], limit: number): Promise<BM25Result[]> {
  if (!terms.length) return [];
  const normalized = `lower(coalesce(title, '') || ' ' || array_to_string(coalesce(tags, ARRAY[]::text[]), ' ') || ' ' || coalesce(bucket, ''))`;
  const matches = terms.map((_, index) => `${normalized} LIKE $${index + 2}`).join(' OR ');
  const score = terms.map((_, index) => `CASE WHEN ${normalized} LIKE $${index + 2} THEN 1 ELSE 0 END`).join(' + ');
  const result = await query<{ id: string; rank: number }>(
    `SELECT pointer_id as id, (${score})::float8 as rank
     FROM memories
     WHERE user_id = $1 AND is_active = true AND (${matches})
     ORDER BY rank DESC, created_at DESC
     LIMIT $${terms.length + 2}`,
    [userId, ...terms.map((term) => `%${term}%`), limit],
  );
  return result.rows;
}

export async function searchMemoriesBM25(params: {
  userId: number;
  query: string;
  limit?: number;
}): Promise<BM25Result[]> {
  const limit = params.limit ?? 20;
  const terms = extractKeywordTerms(params.query);
  const tsQuery = buildKeywordTsQuery(params.query);
  if (!tsQuery) return [];

  const sql = `
    SELECT
      pointer_id as id,
      ts_rank_cd(
        to_tsvector('english', ${SEARCH_TEXT}),
        to_tsquery('english', $2)
      ) as rank
    FROM memories
    WHERE user_id = $1
      AND is_active = true
      AND to_tsvector('english', ${SEARCH_TEXT}) @@ to_tsquery('english', $2)
    ORDER BY rank DESC, created_at DESC
    LIMIT $3
  `;

  const result = await query<{ id: string; rank: number }>(sql, [params.userId, tsQuery, limit]);
  // Filter out very low BM25 scores — a rank below 0.005 means the match is
  // on a single generic prefix with almost no term-frequency signal. Keeping
  // these injects noise into RRF and drowns real matches.
  const filtered = result.rows.filter(r => r.rank >= 0.005);
  // The indexed path handles normal cases. The bounded fallback covers older
  // PostgreSQL indexes, unusual punctuation, and inflections that stemming
  // cannot reconcile. It searches only non-sensitive metadata, never the
  // encrypted memory body.
  return filtered.length ? filtered : fallbackMemoryKeywordSearch(params.userId, terms, limit);
}

export async function searchAtomicMemoriesBM25(params: {
  userId: number;
  query: string;
  limit?: number;
}): Promise<BM25Result[]> {
  const limit = params.limit ?? 20;
  const tsQuery = buildKeywordTsQuery(params.query);
  if (!tsQuery) return [];

  try {
    const sqlWithTsv = `
      SELECT 
        memory_id as id,
        ts_rank_cd(content_tsv, to_tsquery('english', $2)) as rank
      FROM atomic_memories
      WHERE user_id = $1
        AND valid_to IS NULL
        AND content_tsv @@ to_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
    `;
    const result = await query<{ id: string; rank: number }>(sqlWithTsv, [params.userId, tsQuery, limit]);
    return result.rows.filter(r => r.rank >= 0.005);
  } catch (e) {
    // Fallback to to_tsvector if content_tsv doesn't exist
    const sqlFallback = `
      SELECT 
        memory_id as id,
        ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $2)) as rank
      FROM atomic_memories
      WHERE user_id = $1
        AND valid_to IS NULL
        AND to_tsvector('english', content) @@ to_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
    `;
    const result = await query<{ id: string; rank: number }>(sqlFallback, [params.userId, tsQuery, limit]);
    return result.rows.filter(r => r.rank >= 0.005);
  }
}

export async function searchGraphNodesBM25(params: {
  userId: number;
  query: string;
  limit?: number;
}): Promise<BM25Result[]> {
  // Graph nodes have encrypted payloads, so BM25 can't search them directly. 
  // Graph nodes require blind hash lookup, not full-text search.
  return [];
}
