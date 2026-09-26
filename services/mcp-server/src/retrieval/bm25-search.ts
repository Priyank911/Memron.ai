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

export async function searchMemoriesBM25(params: {
  userId: number;
  query: string;
  limit?: number;
}): Promise<BM25Result[]> {
  const limit = params.limit ?? 20;

  // Search title + tags + bucket with phrase matching for better precision
  // Use phraseto_tsquery for exact phrase matching when possible
  const sql = `
    SELECT
      pointer_id as id,
      ts_rank_cd(
        to_tsvector('english', title || ' ' || COALESCE(tags::text, '') || ' ' || COALESCE(bucket, '')),
        phraseto_tsquery('english', $2)
      ) as rank
    FROM memories
    WHERE user_id = $1
      AND is_active = true
      AND to_tsvector('english', title || ' ' || COALESCE(tags::text, '') || ' ' || COALESCE(bucket, '')) @@ phraseto_tsquery('english', $2)
    ORDER BY rank DESC
    LIMIT $3
  `;

  try {
    const result = await query<{ id: string; rank: number }>(sql, [params.userId, params.query, limit]);
    return result.rows;
  } catch (error) {
    // Fallback to plainto_tsquery if phrase matching fails
    const fallbackSql = `
      SELECT
        pointer_id as id,
        ts_rank_cd(
          to_tsvector('english', title || ' ' || COALESCE(tags::text, '') || ' ' || COALESCE(bucket, '')),
          plainto_tsquery('english', $2)
        ) as rank
      FROM memories
      WHERE user_id = $1
        AND is_active = true
        AND to_tsvector('english', title || ' ' || COALESCE(tags::text, '') || ' ' || COALESCE(bucket, '')) @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
    `;
    const result = await query<{ id: string; rank: number }>(fallbackSql, [params.userId, params.query, limit]);
    return result.rows;
  }
}

export async function searchAtomicMemoriesBM25(params: {
  userId: number;
  query: string;
  limit?: number;
}): Promise<BM25Result[]> {
  const limit = params.limit ?? 20;
  
  try {
    const sqlWithTsv = `
      SELECT 
        memory_id as id,
        ts_rank_cd(content_tsv, plainto_tsquery('english', $2)) as rank
      FROM atomic_memories
      WHERE user_id = $1
        AND content_tsv @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
    `;
    const result = await query<{ id: string; rank: number }>(sqlWithTsv, [params.userId, params.query, limit]);
    return result.rows;
  } catch (e) {
    // Fallback to to_tsvector if content_tsv doesn't exist
    const sqlFallback = `
      SELECT 
        memory_id as id,
        ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $2)) as rank
      FROM atomic_memories
      WHERE user_id = $1
        AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
    `;
    const result = await query<{ id: string; rank: number }>(sqlFallback, [params.userId, params.query, limit]);
    return result.rows;
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
