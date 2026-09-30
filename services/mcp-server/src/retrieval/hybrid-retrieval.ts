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
import { fingerprint } from '../lib/privacy.js';
import { query } from '../db/client.js';

export interface HybridRetrievalOptions {
  userId: number;
  query: string;
  embedding?: number[];
  topK?: number;          // default 20
  graphDepth?: number;    // default 2
  activeOnly?: boolean;   // default true (only active temporal edges)
  tokenBudget?: number;   // default 2000
  minVectorSimilarity?: number; // default 0.5 — cosine floor; neighbors below
                                // this never enter RRF (abstention support)
  highConfidenceSimilarity?: number; // default 0.7 — relevance gate (below).
                                // A vector match at/above this stands alone;
                                // below it a candidate needs corroboration.
  traceId?: string;       // pipeline-eye: correlates every log line of one recall
  signals?: {             // override default signal weights
    vector?: number;
    bm25?: number;
    bm25Atomic?: number;
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
  vectorSimilarity?: number; // raw cosine similarity when the vector signal matched (undefined otherwise)
  signals: Record<string, number>;  // per-signal rank contributions
  decayScore?: number;
  createdAt: Date;
}

export interface SignalStat {
  hits: number;
  ms: number;
}

export interface HybridRetrievalResult {
  memories: RetrievedMemory[];
  totalCandidates: number;
  signalsUsed: string[];
  signalStats: Record<string, SignalStat>;
  retrievalTimeMs: number;
  tokenEstimate: number;
}

export async function hybridRetrieve(options: HybridRetrievalOptions): Promise<HybridRetrievalResult> {
  const startTime = performance.now();
  
  const topK = options.topK ?? 20;
  const graphDepth = options.graphDepth ?? 2;
  const activeOnly = options.activeOnly ?? true;
  const minVectorSimilarity = options.minVectorSimilarity ?? 0.5;
  
  const weights = {
    ...DEFAULT_SIGNAL_WEIGHTS,
    ...options.signals,
  };

  const signalResults: RRFSignal[] = [];
  const signalsUsed: string[] = [];
  const allIds = new Set<string>();
  const vectorEnabled = Boolean(options.embedding) && (weights.vector || 0) > 0;
  const bm25Enabled = (weights.bm25 || 0) > 0 || (weights.bm25Atomic || 0) > 0;
  const graphEnabled = (weights.graph || 0) > 0;
  const recencyEnabled = (weights.recency || 0) > 0;

  // 1. Vector Signal — each table queried independently so a failure
  // in one (e.g. vector dimension mismatch on a legacy table) cannot wipe
  // out the other table's results.
  let vectorPromise = Promise.resolve<{ id: string; score: number }[]>([]);
  if (vectorEnabled) {
    signalsUsed.push('vector');
    const atomicVector = searchAtomicMemoriesByVector({
        userId: options.userId,
        embedding: options.embedding!,
        limit: topK * 2,
        minSimilarity: minVectorSimilarity,
      }).then(rows => rows.map(r => ({ id: r.memory_id, score: r.similarity })))
        .catch((e) => {
          console.warn(JSON.stringify({ event: 'vector_signal_failed', table: 'atomic_memories', error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
          return [] as { id: string; score: number }[];
        });
    const storedVector = searchMemoriesByVector({
        userId: options.userId,
        embedding: options.embedding!,
        limit: topK * 2,
        minSimilarity: minVectorSimilarity,
      }).then(rows => rows.map(r => ({ id: r.pointer_id, score: r.similarity })))
        .catch((e) => {
          console.warn(JSON.stringify({ event: 'vector_signal_failed', table: 'memories', error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
          return [] as { id: string; score: number }[];
        });
    vectorPromise = Promise.all([atomicVector, storedVector])
      .then(([atomic, memories]) => [...atomic, ...memories]);
  }

  // 2. BM25 Signal — split by table. Curated `memories` keep full keyword
  // weight; pipeline-distilled `atomic_memories` get a deliberately small
  // weight so ingested chatter echoes (which match queries verbatim because
  // they contain past queries) can never outrank — or even reach — results
  // on keyword overlap alone. They still surface when vector/graph agree.
  if (bm25Enabled) signalsUsed.push('bm25');
  const bm25Promise = (async () => {
    if (!bm25Enabled) return { mem: [] as { id: string; score: number }[], atomic: [] as { id: string; score: number }[] };
    try {
      const [memResults, atomicResults] = await Promise.all([
        searchMemoriesBM25({ userId: options.userId, query: options.query, limit: topK }),
        searchAtomicMemoriesBM25({ userId: options.userId, query: options.query, limit: topK }),
      ]);
      return {
        mem: memResults.map(r => ({ id: r.id, score: r.rank })),
        atomic: atomicResults.map(r => ({ id: r.id, score: r.rank })),
      };
    } catch (e) {
      console.warn(JSON.stringify({ event: 'bm25_signal_failed', error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
      return { mem: [] as { id: string; score: number }[], atomic: [] as { id: string; score: number }[] };
    }
  })();

  // 3. Graph Signal
  if (graphEnabled) signalsUsed.push('graph');
  const graphPromise = (async () => {
    if (!graphEnabled) return [] as { id: string; score: number }[];
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
    } catch (e) {
      console.warn(JSON.stringify({ event: 'graph_signal_failed', error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
      return [];
    }
  })().then((hits) => {
    // Dedupe: the same memory can be reached via many entities/relationships.
    // RRF sums a score per occurrence, so duplicates multiply a doc's weight
    // (300 raw hits buried 2 true vector matches in the live trace). Keep the
    // first (= strongest, evidence ordered by strength DESC) occurrence only,
    // and cap the signal's contribution.
    const seen = new Set<string>();
    const deduped: { id: string; score: number }[] = [];
    for (const h of hits) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      deduped.push(h);
      if (deduped.length >= topK * 2) break;
    }
    return deduped;
  });

  // 4. Recency Decay Signal
  if (recencyEnabled) signalsUsed.push('recency');
  const recencyPromise = (async () => {
    if (!recencyEnabled) return [] as { id: string; score: number }[];
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
    } catch (e) {
      console.warn(JSON.stringify({ event: 'recency_signal_failed', error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
      return [];
    }
  })();

  // Run in parallel — promises start above, so awaiting one by one here
  // costs no parallelism but yields per-signal latency for the pipeline eye.
  const signalStats: Record<string, SignalStat> = {};
  const tVector = performance.now();
  const vectorHits = await vectorPromise;
  signalStats.vector = { hits: vectorHits.length, ms: Math.round(performance.now() - tVector) };
  const tBm25 = performance.now();
  const bm25Split = await bm25Promise;
  const bm25Hits = [...bm25Split.mem, ...bm25Split.atomic];
  signalStats.bm25 = { hits: bm25Hits.length, ms: Math.round(performance.now() - tBm25) };
  const tGraph = performance.now();
  const graphHits = await graphPromise;
  signalStats.graph = { hits: graphHits.length, ms: Math.round(performance.now() - tGraph) };
  const tRecency = performance.now();
  const recencyHits = await recencyPromise;
  signalStats.recency = { hits: recencyHits.length, ms: Math.round(performance.now() - tRecency) };

  if (vectorHits.length) signalResults.push({ name: 'vector', weight: weights.vector, results: vectorHits });
  if (bm25Split.mem.length) signalResults.push({ name: 'bm25', weight: weights.bm25, results: bm25Split.mem });
  if (bm25Split.atomic.length) signalResults.push({ name: 'bm25_atomic', weight: weights.bm25Atomic, results: bm25Split.atomic });
  if (graphHits.length) signalResults.push({ name: 'graph', weight: weights.graph, results: graphHits });
  if (recencyHits.length) signalResults.push({ name: 'recency', weight: weights.recency, results: recencyHits });

  const totalCandidatesSet = new Set<string>();
  vectorHits.forEach(h => totalCandidatesSet.add(h.id));
  bm25Split.mem.forEach(h => totalCandidatesSet.add(h.id));
  bm25Split.atomic.forEach(h => totalCandidatesSet.add(h.id));
  graphHits.forEach(h => totalCandidatesSet.add(h.id));
  recencyHits.forEach(h => totalCandidatesSet.add(h.id));

  // Fuse
  const fusedResults = fuseWithRRF(signalResults, { topK });

  // Raw cosine similarities (vector signal score IS cosine similarity).
  // Kept for score transparency in API responses — lets operators see the
  // actual semantic margin instead of tuning the floor blind.
  const vectorSimilarityById = new Map<string, number>();
  for (const h of vectorHits) {
    if (typeof h.score === 'number') vectorSimilarityById.set(h.id, h.score);
  }

  // Relevance gate (precision-first retrieval). Absolute similarity floors
  // cannot work alone: in a 1024-dim space, unrelated pairs routinely score
  // 0.5+ (live trace: 11 junk hits for a nonsense query, all above the
  // floor). So survival requires one of:
  //   1. standalone high-confidence semantics (sim >= HIGH), or
  //   2. curated keyword support (memories-table BM25 — exact terms, titles,
  //      tags; the legitimate keyword fallback), or
  //   3. corroborated weak semantics (vector + graph agree).
  // BM25-atomic echoes, recency-only freshness, and lone weak neighbors never
  // qualify. Weight-aware: isolated modes (vector/graph with other weights
  // zeroed) don't leak foreign signals back in through clause 2/3.
  const HIGH = options.highConfidenceSimilarity ?? 0.7;
  const bm25Allowed = (weights.bm25 || 0) > 0;
  const graphAllowed = (weights.graph || 0) > 0;
  const gatedResults = fusedResults.filter((r) => {
    const sim = vectorSimilarityById.get(r.id);
    if (sim != null && sim >= HIGH) return true;
    if (bm25Allowed && r.signals['bm25'] !== undefined) return true;
    if (graphAllowed && sim != null && r.signals['graph'] !== undefined) return true;
    return false;
  });

  // Hydrate & Decrypt — batched, not N+1.
  // The old code issued up to 3 sequential queries PER fused result (atomic,
  // graph node, memory). On a high-latency link (1.6s/query) topK=20 meant up
  // to 60 sequential round-trips per recall. Now: 3 queries total, assembled
  // in fused order below with identical budget/decrypt semantics.
  const fusedIds = gatedResults.map(r => r.id);
  const [atomicRows, graphRows, memoryRows] = await Promise.all([
    fusedIds.length
      ? query<any>(`SELECT * FROM atomic_memories WHERE memory_id = ANY($1::text[])`, [fusedIds]).then(r => r.rows).catch(() => [])
      : Promise.resolve([]),
    fusedIds.length
      ? query<any>(`SELECT * FROM graph_nodes WHERE node_id = ANY($1::text[])`, [fusedIds]).then(r => r.rows).catch(() => [])
      : Promise.resolve([]),
    fusedIds.length
      ? query<any>(`SELECT * FROM memories WHERE pointer_id = ANY($1::text[])`, [fusedIds]).then(r => r.rows).catch(() => [])
      : Promise.resolve([]),
  ]);
  const atomicById = new Map<string, any>(atomicRows.map((r: any) => [r.memory_id, r]));
  const graphById = new Map<string, any>(graphRows.map((r: any) => [r.node_id, r]));
  const memoryById = new Map<string, any>(memoryRows.map((r: any) => [r.pointer_id || String(r.id), r]));

  const retrievedMemories: RetrievedMemory[] = [];
  let tokenEstimate = 0;

  for (const result of gatedResults) {
    if (retrievedMemories.length >= topK) break;

    // Check atomic memory
    const amRow = atomicById.get(result.id);
    if (amRow) {
      const content = amRow.content;
      const estimate = Math.ceil(content.length / 4);
      if (tokenEstimate + estimate > (options.tokenBudget ?? 2000) && retrievedMemories.length > 0) continue;
      retrievedMemories.push({
        id: amRow.memory_id,
        source: 'atomic_memory',
        content,
        memoryType: amRow.memory_type,
        confidence: amRow.confidence,
        fusedScore: result.fusedScore,
        vectorSimilarity: vectorSimilarityById.get(result.id),
        signals: result.signals,
        createdAt: amRow.created_at,
      });
      tokenEstimate += estimate;
      continue;
    }

    // Check graph node
    const gnRow = graphById.get(result.id);
    if (gnRow) {
      const payload: EncryptedPayload = {
        encrypted: gnRow.encrypted_payload,
        iv: gnRow.payload_iv,
        tag: gnRow.payload_tag
      };
      let content = '';
      try {
        content = decrypt(payload);
      } catch {
        content = 'Error decrypting node content.';
      }

      retrievedMemories.push({
        id: gnRow.node_id,
        source: 'graph_node',
        content,
        fusedScore: result.fusedScore,
        vectorSimilarity: vectorSimilarityById.get(result.id),
        signals: result.signals,
        createdAt: gnRow.created_at,
      });
      tokenEstimate += Math.ceil(content.length / 4);
      continue;
    }

    // Check normal memory (same semantics as before: pointer_id lookup, no
    // is_active filter — RRF signals already applied active-only filtering)
    const memRow = memoryById.get(result.id);
    if (memRow) {
      const r = memRow;
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
        vectorSimilarity: vectorSimilarityById.get(result.id),
        signals: result.signals,
        createdAt: r.created_at,
      });
      tokenEstimate += estimate;
      continue;
    }
  }

  const endTime = performance.now();

  // Pipeline-eye: one structured line per recall. Grep `recall_trace` in
  // logs to watch any query travel through every stage live.
  // PRIVACY: the raw query is never logged — only a stable hash (for
  // correlating repeat queries) and its length.
  const queryFp = fingerprint(options.query);
  console.info(JSON.stringify({
    event: 'recall_trace',
    traceId: options.traceId || null,
    queryHash: queryFp.hash,
    queryLen: queryFp.len,
    signals: signalStats,
    candidates: totalCandidatesSet.size,
    returned: retrievedMemories.length,
    totalMs: Math.round(endTime - startTime),
  }));

  return {
    memories: retrievedMemories,
    totalCandidates: totalCandidatesSet.size,
    signalsUsed,
    signalStats,
    retrievalTimeMs: endTime - startTime,
    tokenEstimate,
  };
}

function extractEntities(queryStr: string): string[] {
  const stopWords = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'that', 'this', 'does', 'have', 'about', 'into', 'show', 'find', 'the', 'and', 'for']);
  const matches = queryStr.match(/[A-Za-z][A-Za-z0-9._/-]{2,}/g) || [];
  return Array.from(new Set(matches.filter(word => !stopWords.has(word.toLowerCase()))));
}
