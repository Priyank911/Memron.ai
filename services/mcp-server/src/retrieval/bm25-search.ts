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

export interface LexicalEvidence {
  matchedTerms: string[];
  matchedAliases: string[];
  coverage: number;
  sufficient: boolean;
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

// These terms can help discover a candidate, but a match on one of them is
// not enough to answer a memory query. This prevents records about unrelated
// projects from passing merely because they contain "project", "stored", or
// "name" while semantic retrieval is temporarily unavailable.
const LOW_SIGNAL_TERMS = new Set([
  'change', 'changes', 'context', 'data', 'detail', 'details', 'find',
  'identity', 'information', 'made', 'memory', 'memories', 'name', 'person',
  'project', 'retrieve', 'stored', 'thing', 'things', 'use', 'used', 'using',
]);

// Transparent abbreviation expansion. A whole phrase must match before it can
// satisfy the precision gate, so aliases improve recall without becoming a
// source of broad single-keyword noise.
const ALIAS_GROUPS: Record<string, string[][]> = {
  auth: [['authentication']],
  db: [['database']],
  llm: [['language', 'model']],
  pm: [['prime', 'minister'], ['project', 'manager']],
};

function normalizedWords(input: string): string[] {
  return input.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
  return word;
}

function hasTerm(candidateWords: string[], term: string): boolean {
  const target = stem(term);
  return candidateWords.some((word) => {
    const candidate = stem(word);
    return candidate === target
      || (target.length >= 4 && candidate.startsWith(target))
      || (candidate.length >= 4 && target.startsWith(candidate));
  });
}

function sourceKeywordTerms(input: string): string[] {
  return Array.from(new Set(
    normalizedWords(input).filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  )).slice(0, 16);
}

function aliasesFor(terms: string[]): Array<{ label: string; terms: string[] }> {
  return terms.flatMap((term) => (ALIAS_GROUPS[term] || []).map((group) => ({
    label: `${term}:${group.join(' ')}`,
    terms: group,
  })));
}

export function extractKeywordTerms(input: string): string[] {
  const sourceTerms = sourceKeywordTerms(input);
  const aliases = aliasesFor(sourceTerms).flatMap((alias) => alias.terms);
  return Array.from(new Set([...sourceTerms, ...aliases])).slice(0, 16);
}

export function buildKeywordTsQuery(input: string): string {
  return extractKeywordTerms(input).map((term) => `${term}:*`).join(' | ');
}

/**
 * Confirm that a candidate covers the user's discriminative intent. It runs
 * after hydration over the decrypted, user-scoped candidate because encrypted
 * bodies are deliberately not part of the database full-text index.
 */
export function assessLexicalEvidence(query: string, candidateText: string): LexicalEvidence {
  const sourceTerms = sourceKeywordTerms(query);
  const anchors = sourceTerms.filter((term) => !LOW_SIGNAL_TERMS.has(term));
  const candidateWords = normalizedWords(candidateText);
  const matchedTerms = anchors.filter((term) => hasTerm(candidateWords, term));
  const matchedAliases = aliasesFor(sourceTerms)
    .filter((alias) => alias.terms.every((term) => hasTerm(candidateWords, term)))
    .map((alias) => alias.label);
  const coverage = anchors.length ? matchedTerms.length / anchors.length : 0;
  const sufficient = matchedAliases.length > 0
    || (anchors.length === 1 && matchedTerms.length === 1)
    || (anchors.length === 2 && matchedTerms.length === 2)
    || (anchors.length >= 3 && matchedTerms.length >= 2 && coverage >= 0.4);
  return { matchedTerms, matchedAliases, coverage, sufficient };
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
