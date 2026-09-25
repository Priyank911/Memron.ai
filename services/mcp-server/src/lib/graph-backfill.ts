/**
 * Historical graph backfill.
 *
 * This intentionally writes only entities and relationships. It never inserts
 * duplicate episodes or memories, so it is safe to run after the new graph
 * writer has been deployed.
 */
import { nanoid } from 'nanoid';
import { runPipeline, runPipelineSync, type ConversationMessage } from '@memron/analysis-engine';
import {
  getHistoricalEpisodes,
  getEntityByCanonicalName,
  insertEntity,
  upsertEntityRelationship,
} from '../db/queries-analysis.js';

export async function backfillGraph(params: {
  userId: number;
  limit?: number;
  useLLM?: boolean;
}) {
  const episodes = await getHistoricalEpisodes(params.userId, params.limit || 1000);
  let entities = 0;
  let explicitEdges = 0;
  let cooccurrenceEdges = 0;

  for (const episode of episodes) {
    const raw = episode.raw_messages as unknown;
    const messages = Array.isArray(raw)
      ? raw as ConversationMessage[]
      : raw && typeof raw === 'object' && Array.isArray((raw as { messages?: unknown }).messages)
        ? (raw as { messages: ConversationMessage[] }).messages
        : [];
    if (messages.length === 0) continue;

    const input = { sessionId: episode.session_id, userId: String(params.userId), messages };
    const result = params.useLLM
      ? await runPipeline(input, { useLLM: true, parallel: true })
      : runPipelineSync(input);
    const stableIds = new Map<string, string>();

    for (const entity of result.entities) {
      const existing = await getEntityByCanonicalName(entity.canonicalName, params.userId);
      const stableId = existing?.entity_id || entity.entityId;
      stableIds.set(entity.entityId, stableId);
      await insertEntity({
        entityId: stableId,
        userId: params.userId,
        name: entity.name,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
        description: entity.description,
        firstSeenIn: entity.firstSeenIn,
        mentionCount: entity.mentionCount,
      });
      entities++;
    }

    const explicitPairs = new Set<string>();
    for (const relationship of result.relationships) {
      const sourceEntityId = stableIds.get(relationship.sourceEntityId) || relationship.sourceEntityId;
      const targetEntityId = stableIds.get(relationship.targetEntityId) || relationship.targetEntityId;
      explicitPairs.add([sourceEntityId, targetEntityId].sort().join('|'));
      await upsertEntityRelationship({
        relationshipId: `rel_${nanoid(12)}`,
        userId: params.userId,
        sourceEntityId,
        targetEntityId,
        relationshipType: relationship.relationshipType,
        strength: relationship.strength,
        confidence: relationship.strength,
        edgeSource: 'explicit',
        sourceMemories: [`episode:${episode.episode_id}`],
      });
      explicitEdges++;
    }

    const candidates = result.entities.slice().sort((a, b) => b.mentionCount - a.mentionCount).slice(0, 12);
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const sourceEntityId = stableIds.get(candidates[i].entityId) || candidates[i].entityId;
        const targetEntityId = stableIds.get(candidates[j].entityId) || candidates[j].entityId;
        const pair = [sourceEntityId, targetEntityId].sort().join('|');
        if (explicitPairs.has(pair)) continue;
        await upsertEntityRelationship({
          relationshipId: `rel_${nanoid(12)}`,
          userId: params.userId,
          sourceEntityId,
          targetEntityId,
          relationshipType: 'mentioned_with',
          strength: 0.2,
          confidence: 0.2,
          edgeSource: 'co_occurrence',
          sourceMemories: [`episode:${episode.episode_id}`],
        });
        cooccurrenceEdges++;
      }
    }
  }

  return { episodes: episodes.length, entities, explicitEdges, cooccurrenceEdges };
}
