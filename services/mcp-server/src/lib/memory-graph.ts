/**
 * Index a directly stored MCP memory in the semantic graph.
 *
 * Conversation auto-ingest is intentionally session-oriented, but a direct
 * memory_store call is already durable and should not wait for session close
 * before its entities become searchable in the dashboard graph.
 */
import { nanoid } from 'nanoid';
import { extractEntitiesSync, type Episode } from '@memron/analysis-engine';
import { buildEmbeddingInput, generateEmbedding, toPgVector } from './embeddings.js';
import {
  getEntityByCanonicalName,
  insertEntity,
  upsertEntityRelationship,
} from '../db/queries-analysis.js';
import { query } from '../db/client.js';

export async function indexStoredMemoryInGraph(params: {
  userId: number;
  pointerId: string;
  title: string;
  content: string;
  createMemoryNode?: boolean;
  memoryEmbedding?: number[] | null;
}): Promise<{ entities: number; relationships: number }> {
  const episode: Episode = {
    episodeId: `memory:${params.pointerId}`,
    sessionId: `memory:${params.pointerId}`,
    episodeType: 'context_setup',
    startIndex: 0,
    endIndex: 0,
    messages: [{ role: 'user', content: `${params.title}\n${params.content}` }],
    createdAt: new Date().toISOString(),
  };
  const result = extractEntitiesSync(episode, String(params.userId), { minMentions: 1 });
  const stableIds = new Map<string, string>();
  const memoryEmbedding = params.createMemoryNode
    ? (params.memoryEmbedding ?? await generateEmbedding(buildEmbeddingInput(params.title, [], params.content)))
    : null;

  // A stored memory gets a real document/topic node, not a synthetic global
  // root. Its title is the human-readable entry point and its edges explain
  // which extracted entities support that memory.
  if (params.createMemoryNode && params.title.trim()) {
    const titleCanonical = `memory:${params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)}`;
    const existingTitle = await getEntityByCanonicalName(titleCanonical, params.userId);
    const titleId = existingTitle?.entity_id || `ent_${nanoid(12)}`;
    stableIds.set('__memory_title__', titleId);
    await insertEntity({
      entityId: titleId,
      userId: params.userId,
      name: params.title.trim().slice(0, 120),
      canonicalName: titleCanonical,
      entityType: 'memory',
      description: 'Stored memory title node',
      firstSeenIn: params.pointerId,
      mentionCount: 1,
      embedding: memoryEmbedding || undefined,
    });
  }

  for (const entity of result.entities) {
    const existing = await getEntityByCanonicalName(entity.canonicalName, params.userId);
    const entityId = existing?.entity_id || entity.entityId;
    stableIds.set(entity.entityId, entityId);
    await insertEntity({
      entityId,
      userId: params.userId,
      name: entity.name,
      canonicalName: entity.canonicalName,
      entityType: entity.entityType,
      description: entity.description,
      firstSeenIn: params.pointerId,
      mentionCount: entity.mentionCount,
    });
  }

  // Heuristic extraction has no predicate confidence. Store bounded weak ties
  // so a single memory is connected without recreating a root hub.
  const candidates = result.entities
    .slice()
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 12);
  let relationships = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const sourceEntityId = stableIds.get(candidates[i].entityId) || candidates[i].entityId;
      const targetEntityId = stableIds.get(candidates[j].entityId) || candidates[j].entityId;
      await upsertEntityRelationship({
        relationshipId: `rel_${nanoid(12)}`,
        userId: params.userId,
        sourceEntityId,
        targetEntityId,
        relationshipType: 'mentioned_with',
        strength: 0.2,
        confidence: 0.2,
        edgeSource: 'co_occurrence',
        sourceMemories: [params.pointerId],
      });
      relationships++;
    }
  }

  const titleId = stableIds.get('__memory_title__');
  if (titleId) {
    for (const entity of candidates) {
      const entityId = stableIds.get(entity.entityId) || entity.entityId;
      await upsertEntityRelationship({
        relationshipId: `rel_${nanoid(12)}`,
        userId: params.userId,
        sourceEntityId: titleId,
        targetEntityId: entityId,
        relationshipType: 'contains',
        strength: 0.55,
        confidence: 0.9,
        edgeSource: 'explicit',
        sourceMemories: [params.pointerId],
      });
      relationships++;
    }

    // Semantic memory-to-memory links make related memories discoverable even
    // when wording differs. Embeddings are optional; when unavailable, the
    // shared entity and co-occurrence links above remain authoritative.
    if (memoryEmbedding) {
      const similar = await query<{ entity_id: string; similarity: number }>(
        `SELECT entity_id, 1 - (embedding <=> $1::vector) AS similarity
         FROM entities
         WHERE user_id = $2 AND entity_type = 'memory'
           AND entity_id <> $3 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 5`,
        [toPgVector(memoryEmbedding), params.userId, titleId],
      );
      for (const row of similar.rows) {
        const similarity = Number(row.similarity);
        if (!Number.isFinite(similarity) || similarity < 0.78) continue;
        await upsertEntityRelationship({
          relationshipId: `rel_${nanoid(12)}`,
          userId: params.userId,
          sourceEntityId: titleId,
          targetEntityId: row.entity_id,
          relationshipType: 'similar_to',
          strength: similarity,
          confidence: similarity,
          edgeSource: 'semantic_similarity',
          sourceMemories: [params.pointerId],
        });
        relationships++;
      }
    }
  }

  return { entities: result.entities.length, relationships };
}
