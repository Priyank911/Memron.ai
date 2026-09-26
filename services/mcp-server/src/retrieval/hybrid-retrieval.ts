/**
 * Hybrid Retrieval Engine
 * Orchestrates 4 retrieval signals and fuses them with Reciprocal Rank Fusion.
 *
 * Signals:
 * 1. Vector Similarity — pgvector HNSW cosine search
 * 2. BM25 Full-Text — PostgreSQL tsvector keyword matching
 * 3. Graph Traversal — N-hop subgraph expansion from entity anchors
 * 4. Recency Decay — Ebbinghaus-inspired time-based scoring
 */

import { searchAtomicMemoriesByVector } from '../db/queries-analysis.js';
import { searchMemoriesByVector } from '../db/queries.js';
import { searchMemoriesBM25, searchAtomicMemoriesBM25 } from './bm25-search.js';
import { traverseSubgraph, getGraphNodeByBlindHash } from '../db/queries-graph.js';
import { calculateDecayScore } from '../lib/memory-decay.js';
import { fuseWithRRF, type RRFSignal, DEFAULT_SIGNAL_WEIGHTS } from '../lib/rrf.js';
import { computeBlindHash } from '../lib/blind-index.js';
import { decrypt, type EncryptedPayload } from '../lib/encryption.js';
import { query } from '../db/client.js';

export interface HybridRetrievalOptions {
  userId: number;
  query: string;
  embedding?: number[];
  topK?: number;          // default 20
  graphDepth?: number;    // default 2
  activeOnly?: boolean;   // default true (only active temporal edges)
  tokenBudget?: number;   // default 2000
  signals?: {             // override default signal weights
    vector?: number;
    bm25?: number;
    graph?: number;
    recency?: number;
  };
}

export interface RetrievedMemory {
  id: string;               // pointer_id or memory_id
  source: 'memory' | 'atomic_memory' | 'graph_node';
  content: string;          // decrypted content
  title?: string;
  tags?: string[];
  bucket?: string;
  metadata?: Record<string, unknown>;
  memoryType?: string;
  confidence?: number;
  fusedScore: number;       // final RRF score
  signals: Record<string, number>;  // per-signal rank contributions
  decayScore?: number;
  createdAt: Date;
}

export interface HybridRetrievalResult {
  memories: RetrievedMemory[];
  totalCandidates: number;
  signalsUsed: string[];
  retrievalTimeMs: number;
  tokenEstimate: number;
}

export async function hybridRetrieve(options: HybridRetrievalOptions): Promise<HybridRetrievalResult> {
  const startTime = performance.now();
  
  const topK = options.topK ?? 20;
  const graphDepth = options.graphDepth ?? 2;
  const activeOnly = options.activeOnly ?? true;
  
  const weights = {
    ...DEFAULT_SIGNAL_WEIGHTS,
    ...options.signals,
  };

  const signalResults: RRFSignal[] = [];
  const signalsUsed: string[] = [];
  const allIds = new Set<string>();

  // 1. Vector Signal
  let vectorPromise = Promise.resolve<{ id: string; score: number }[]>([]);
  if (options.embedding) {
    signalsUsed.push('vector');
    vectorPromise = Promise.all([
      searchAtomicMemoriesByVector({
        userId: options.userId,
        embedding: options.embedding,
        limit: topK * 2,
      }).then(rows => rows.map(r => ({ id: r.memory_id, score: r.similarity }))),
      searchMemoriesByVector({
        userId: options.userId,
        embedding: options.embedding,
        limit: topK * 2,
      }).then(rows => rows.map(r => ({ id: r.pointer_id, score: r.similarity })))
        .catch(() => []), // Handle case where embedding column doesn't exist yet
    ]).then(([atomic, memories]) => [...atomic, ...memories])
      .catch(() => []);
  }

  // 2. BM25 Signal
  signalsUsed.push('bm25');
  const bm25Promise = Promise.all([
    searchMemoriesBM25({ userId: options.userId, query: options.query, limit: topK }),
    searchAtomicMemoriesBM25({ userId: options.userId, query: options.query, limit: topK })
  ]).then(([memResults, atomicResults]) => {
    return [...memResults, ...atomicResults].map(r => ({ id: r.id, score: r.rank }));
  }).catch(() => []);

  // 3. Graph Signal
  signalsUsed.push('graph');
  const graphPromise = (async () => {
    try {
      const entities = extractEntities(options.query);
      const graphHits: { id: string; score: number }[] = [];

      // Canonical semantic graph used by the dashboard. Relationship
      // provenance points back to encrypted memory/atomic-memory IDs, so the
      // graph signal can participate in the same RRF ranking as BM25/vector.
      if (entities.length > 0) {
        const semantic = await query<{ entity_id: string }>(
          `SELECT entity_id FROM entities
           WHERE user_id = $1 AND canonical_name = ANY($2::text[])
           LIMIT 20`,
          [options.userId, entities.map(entity => entity.toLowerCase())],
        );
        for (const entity of semantic.rows) {
          const evidence = await query<{ source_memories: string[] | null; strength: number }>(
            `SELECT source_memories, strength
             FROM entity_relationships
             WHERE user_id = $1
               AND (source_entity_id = $2 OR target_entity_id = $2)
             ORDER BY strength DESC, evidence_count DESC
             LIMIT $3`,
            [options.userId, entity.entity_id, topK * 2],
          );
          for (const row of evidence.rows) {
            for (const memoryId of row.source_memories || []) {
              if (!memoryId.startsWith('episode:')) {
                graphHits.push({ id: memoryId, score: 10 + (row.strength || 0) });
              }
            }
          }
        }
      }

      // Legacy sovereign graph fallback remains read-only for old data.
      if (graphHits.length > 0) return graphHits;
      
      for (const entity of entities) {
        const hash = computeBlindHash(entity, options.userId);
        const node = await getGraphNodeByBlindHash(options.userId, hash);
        
        if (node) {
          graphHits.push({ id: node.node_id, score: node.importance_score + 10 });
          const subgraph = await traverseSubgraph({
            userId: options.userId,
            startNodeId: node.node_id,
            maxDepth: graphDepth,
            activeOnly,
          });
          
          for (const sn of subgraph.nodes) {
            if (sn.node_id !== node.node_id) {
              graphHits.push({ id: sn.node_id, score: sn.importance_score });
            }
          }
        }
      }
      return graphHits;
    } catch {
      return [];
    }
  })();

  // 4. Recency Decay Signal
  signalsUsed.push('recency');
  const recencyPromise = (async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [recentAtomic, recentStored] = await Promise.all([
        query<{ id: string; created_at: Date; updated_at: Date; importance: number }>(
        `SELECT memory_id AS id, created_at, updated_at, confidence AS importance FROM atomic_memories
         WHERE user_id = $1 AND created_at > $2
         ORDER BY created_at DESC LIMIT $3`,
          [options.userId, thirtyDaysAgo, topK * 2],
        ),
        query<{ id: string; created_at: Date; updated_at: Date; importance: number }>(
          `SELECT pointer_id AS id, created_at, updated_at, importance
           FROM memories
           WHERE user_id = $1 AND is_active = true AND created_at > $2
           ORDER BY created_at DESC LIMIT $3`,
          [options.userId, thirtyDaysAgo, topK * 2],
        ),
      ]);

      return [...recentAtomic.rows, ...recentStored.rows].map(r => {
        const decayScore = calculateDecayScore({
          importance: r.importance || 0.5,
          accessCount: 0,
          lastAccessedAt: r.updated_at,
          createdAt: r.created_at,
        });
        return { id: r.id, score: decayScore };
      });
    } catch {
      return [];
    }
  })();

  // Run in parallel
  const [vectorHits, bm25Hits, graphHits, recencyHits] = await Promise.all([
    vectorPromise, bm25Promise, graphPromise, recencyPromise
  ]);

  if (vectorHits.length) signalResults.push({ name: 'vector', weight: weights.vector, results: vectorHits });
  if (bm25Hits.length) signalResults.push({ name: 'bm25', weight: weights.bm25, results: bm25Hits });
  if (graphHits.length) signalResults.push({ name: 'graph', weight: weights.graph, results: graphHits });
  if (recencyHits.length) signalResults.push({ name: 'recency', weight: weights.recency, results: recencyHits });

  const totalCandidatesSet = new Set<string>();
  vectorHits.forEach(h => totalCandidatesSet.add(h.id));
  bm25Hits.forEach(h => totalCandidatesSet.add(h.id));
  graphHits.forEach(h => totalCandidatesSet.add(h.id));
  recencyHits.forEach(h => totalCandidatesSet.add(h.id));

  // Fuse
  const fusedResults = fuseWithRRF(signalResults, { topK });

  // Hydrate & Decrypt
  const retrievedMemories: RetrievedMemory[] = [];
  let tokenEstimate = 0;

  for (const result of fusedResults) {
    if (retrievedMemories.length >= topK) break;
    
    // Check atomic memory
    const amRes = await query<any>(`SELECT * FROM atomic_memories WHERE memory_id = $1`, [result.id]);
    if (amRes.rows.length > 0) {
      const r = amRes.rows[0];
      const content = r.content;
      const estimate = Math.ceil(content.length / 4);
      if (tokenEstimate + estimate > (options.tokenBudget ?? 2000) && retrievedMemories.length > 0) continue;
      retrievedMemories.push({
        id: r.memory_id,
        source: 'atomic_memory',
        content,
        memoryType: r.memory_type,
        confidence: r.confidence,
        fusedScore: result.fusedScore,
        signals: result.signals,
        createdAt: r.created_at,
      });
      tokenEstimate += estimate;
      continue;
    }

    // Check graph node
    const gnRes = await query<any>(`SELECT * FROM graph_nodes WHERE node_id = $1`, [result.id]);
    if (gnRes.rows.length > 0) {
      const r = gnRes.rows[0];
      const payload: EncryptedPayload = {
        encrypted: r.encrypted_payload,
        iv: r.payload_iv,
        tag: r.payload_tag
      };
      let content = '';
      try {
        content = decrypt(payload);
      } catch {
        content = 'Error decrypting node content.';
      }
      
      retrievedMemories.push({
        id: r.node_id,
        source: 'graph_node',
        content,
        fusedScore: result.fusedScore,
        signals: result.signals,
        createdAt: r.created_at,
      });
      tokenEstimate += Math.ceil(content.length / 4);
      continue;
    }

    // Check normal memory
    try {
      const memRes = await query<any>(`SELECT * FROM memories WHERE pointer_id = $1 OR id = $1`, [result.id]);
      if (memRes.rows.length > 0) {
        const r = memRes.rows[0];
        let content = r.content || '';
        if (!content && r.content_encrypted && r.content_iv && r.content_tag) {
          try {
            content = decrypt({ encrypted: r.content_encrypted, iv: r.content_iv, tag: r.content_tag });
          } catch {
            content = '';
          }
        }
        
        const estimate = Math.ceil(content.length / 4);
        if (tokenEstimate + estimate > (options.tokenBudget ?? 2000) && retrievedMemories.length > 0) continue;
        retrievedMemories.push({
          id: r.pointer_id || r.id,
          source: 'memory',
          content,
          title: r.title,
          tags: r.tags,
          bucket: r.bucket,
          metadata: r.metadata || {},
          fusedScore: result.fusedScore,
          signals: result.signals,
          createdAt: r.created_at,
        });
        tokenEstimate += estimate;
        continue;
      }
    } catch {
      // Ignore if memories table does not exist
    }
  }

  const endTime = performance.now();
  
  return {
    memories: retrievedMemories,
    totalCandidates: totalCandidatesSet.size,
    signalsUsed,
    retrievalTimeMs: endTime - startTime,
    tokenEstimate,
  };
}

function extractEntities(queryStr: string): string[] {
  const stopWords = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'that', 'this', 'does', 'have', 'about', 'into', 'show', 'find', 'the', 'and', 'for']);
  const matches = queryStr.match(/[A-Za-z][A-Za-z0-9._/-]{2,}/g) || [];
  return Array.from(new Set(matches.filter(word => !stopWords.has(word.toLowerCase()))));
}
