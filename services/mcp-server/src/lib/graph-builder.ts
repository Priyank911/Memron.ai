/**
 * Knowledge Graph Builder
 * Builds and queries the entity relationship graph
 */

import { nanoid } from 'nanoid';
import {
  insertEntity,
  insertEntityRelationship,
  getEntityByCanonicalName,
  searchEntities,
  getEntityRelationships,
  type EntityRow,
  type EntityRelationshipRow,
} from '../db/queries-analysis.js';
import { query } from '../db/client.js';

export interface GraphNode {
  entityId: string;
  name: string;
  canonicalName: string;
  type: string;
  description: string | null;
  mentionCount: number;
  connections: number;
}

export interface GraphEdge {
  relationshipId: string;
  sourceId: string;
  targetId: string;
  type: string;
  strength: number;
  evidenceCount: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centralEntity?: GraphNode;
}

export interface EntityInput {
  name: string;
  type?: string;
  description?: string;
  sourceMemoryId?: string;
}

export interface RelationshipInput {
  sourceEntityName: string;
  targetEntityName: string;
  type: string;
  strength?: number;
  sourceMemoryId?: string;
}

/**
 * Add or update an entity in the graph
 */
export async function addEntity(
  userId: number,
  input: EntityInput
): Promise<EntityRow> {
  const canonicalName = normalizeEntityName(input.name);

  // Check if entity exists
  const existing = await getEntityByCanonicalName(canonicalName, userId);

  if (existing) {
    // Update mention count
    await query(
      `UPDATE entities SET mention_count = mention_count + 1, updated_at = NOW()
       WHERE entity_id = $1`,
      [existing.entity_id]
    );
    return { ...existing, mention_count: existing.mention_count + 1 };
  }

  // Create new entity
  return insertEntity({
    entityId: `ent_${nanoid(12)}`,
    userId,
    name: input.name,
    canonicalName,
    entityType: input.type,
    description: input.description,
    firstSeenIn: input.sourceMemoryId,
    mentionCount: 1,
  });
}

/**
 * Add multiple entities in batch
 */
export async function addEntitiesBatch(
  userId: number,
  inputs: EntityInput[]
): Promise<EntityRow[]> {
  const results: EntityRow[] = [];

  for (const input of inputs) {
    const entity = await addEntity(userId, input);
    results.push(entity);
  }

  return results;
}

/**
 * Add a relationship between entities
 */
export async function addRelationship(
  userId: number,
  input: RelationshipInput
): Promise<EntityRelationshipRow | null> {
  // Find source entity
  const sourceCanonical = normalizeEntityName(input.sourceEntityName);
  const sourceEntity = await getEntityByCanonicalName(sourceCanonical, userId);

  if (!sourceEntity) {
    // Create source entity first
    await addEntity(userId, { name: input.sourceEntityName });
  }

  // Find target entity
  const targetCanonical = normalizeEntityName(input.targetEntityName);
  const targetEntity = await getEntityByCanonicalName(targetCanonical, userId);

  if (!targetEntity) {
    // Create target entity first
    await addEntity(userId, { name: input.targetEntityName });
  }

  const source = await getEntityByCanonicalName(sourceCanonical, userId);
  const target = await getEntityByCanonicalName(targetCanonical, userId);

  if (!source || !target) return null;

  // Check for existing relationship
  const existing = await query<EntityRelationshipRow>(
    `SELECT * FROM entity_relationships
     WHERE user_id = $1 AND source_entity_id = $2 AND target_entity_id = $3
       AND relationship_type = $4`,
    [userId, source.entity_id, target.entity_id, input.type]
  );

  if (existing.rows.length > 0) {
    // Update evidence count and strength
    await query(
      `UPDATE entity_relationships
       SET evidence_count = evidence_count + 1,
           strength = LEAST(1.0, strength + 0.1),
           source_memories = array_append(source_memories, $4)
       WHERE id = $1`,
      [existing.rows[0].id, input.sourceMemoryId]
    );
    return existing.rows[0];
  }

  // Create new relationship
  return insertEntityRelationship({
    relationshipId: `rel_${nanoid(12)}`,
    userId,
    sourceEntityId: source.entity_id,
    targetEntityId: target.entity_id,
    relationshipType: input.type,
    strength: input.strength || 0.5,
    evidenceCount: 1,
    sourceMemories: input.sourceMemoryId ? [input.sourceMemoryId] : undefined,
  });
}

/**
 * Query the graph starting from an entity
 */
export async function queryGraph(
  userId: number,
  entityName: string,
  depth: number = 2
): Promise<GraphQueryResult> {
  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];

  const canonicalName = normalizeEntityName(entityName);
  const startEntity = await getEntityByCanonicalName(canonicalName, userId);

  if (!startEntity) {
    return { nodes: [], edges: [] };
  }

  // BFS traversal
  const visited = new Set<string>();
  const queue: Array<{ entityId: string; currentDepth: number }> = [
    { entityId: startEntity.entity_id, currentDepth: 0 },
  ];

  while (queue.length > 0) {
    const { entityId, currentDepth } = queue.shift()!;

    if (visited.has(entityId) || currentDepth > depth) continue;
    visited.add(entityId);

    // Get entity details
    const entityResult = await query<EntityRow>(
      `SELECT * FROM entities WHERE entity_id = $1 AND user_id = $2`,
      [entityId, userId]
    );

    if (entityResult.rows.length === 0) continue;

    const entity = entityResult.rows[0];

    // Get relationships
    const relationships = await getEntityRelationships(entityId, userId);

    // Add node
    nodes.set(entityId, {
      entityId: entity.entity_id,
      name: entity.name,
      canonicalName: entity.canonical_name || entity.name.toLowerCase(),
      type: entity.entity_type || 'unknown',
      description: entity.description,
      mentionCount: entity.mention_count,
      connections: relationships.length,
    });

    // Add edges and queue connected entities
    for (const rel of relationships) {
      edges.push({
        relationshipId: rel.relationship_id,
        sourceId: rel.source_entity_id,
        targetId: rel.target_entity_id,
        type: rel.relationship_type || 'related',
        strength: rel.strength,
        evidenceCount: rel.evidence_count,
      });

      const connectedId = rel.source_entity_id === entityId
        ? rel.target_entity_id
        : rel.source_entity_id;

      if (!visited.has(connectedId) && currentDepth < depth) {
        queue.push({ entityId: connectedId, currentDepth: currentDepth + 1 });
      }
    }
  }

  const centralNode = nodes.get(startEntity.entity_id);

  return {
    nodes: Array.from(nodes.values()),
    edges: deduplicateEdges(edges),
    centralEntity: centralNode,
  };
}

/**
 * Find paths between two entities
 */
export async function findPaths(
  userId: number,
  fromName: string,
  toName: string,
  maxDepth: number = 4
): Promise<Array<Array<{ entity: GraphNode; relationship?: GraphEdge }>>> {
  const fromCanonical = normalizeEntityName(fromName);
  const toCanonical = normalizeEntityName(toName);

  const fromEntity = await getEntityByCanonicalName(fromCanonical, userId);
  const toEntity = await getEntityByCanonicalName(toCanonical, userId);

  if (!fromEntity || !toEntity) return [];

  const paths: Array<Array<{ entity: GraphNode; relationship?: GraphEdge }>> = [];
  const currentPath: Array<{ entityId: string; relationship?: EntityRelationshipRow }> = [];

  async function dfs(
    currentId: string,
    visited: Set<string>,
    depth: number
  ): Promise<void> {
    if (depth > maxDepth) return;
    if (visited.has(currentId)) return;

    visited.add(currentId);

    if (currentId === toEntity!.entity_id) {
      // Found a path - reconstruct it
      const path: Array<{ entity: GraphNode; relationship?: GraphEdge }> = [];

      for (const step of currentPath) {
        const entityResult = await query<EntityRow>(
          `SELECT * FROM entities WHERE entity_id = $1`,
          [step.entityId]
        );

        if (entityResult.rows.length > 0) {
          const e = entityResult.rows[0];
          const rels = await getEntityRelationships(e.entity_id, userId);

          path.push({
            entity: {
              entityId: e.entity_id,
              name: e.name,
              canonicalName: e.canonical_name || e.name.toLowerCase(),
              type: e.entity_type || 'unknown',
              description: e.description,
              mentionCount: e.mention_count,
              connections: rels.length,
            },
            relationship: step.relationship ? {
              relationshipId: step.relationship.relationship_id,
              sourceId: step.relationship.source_entity_id,
              targetId: step.relationship.target_entity_id,
              type: step.relationship.relationship_type || 'related',
              strength: step.relationship.strength,
              evidenceCount: step.relationship.evidence_count,
            } : undefined,
          });
        }
      }

      // Add final entity
      const finalEntity = await query<EntityRow>(
        `SELECT * FROM entities WHERE entity_id = $1`,
        [toEntity!.entity_id]
      );
      if (finalEntity.rows.length > 0) {
        const e = finalEntity.rows[0];
        const rels = await getEntityRelationships(e.entity_id, userId);
        path.push({
          entity: {
            entityId: e.entity_id,
            name: e.name,
            canonicalName: e.canonical_name || e.name.toLowerCase(),
            type: e.entity_type || 'unknown',
            description: e.description,
            mentionCount: e.mention_count,
            connections: rels.length,
          },
        });
      }

      paths.push(path);
      return;
    }

    // Get connected entities
    const relationships = await getEntityRelationships(currentId, userId);

    for (const rel of relationships) {
      const nextId = rel.source_entity_id === currentId
        ? rel.target_entity_id
        : rel.source_entity_id;

      currentPath.push({ entityId: currentId, relationship: rel });
      await dfs(nextId, new Set(visited), depth + 1);
      currentPath.pop();
    }
  }

  await dfs(fromEntity.entity_id, new Set(), 0);

  return paths;
}

/**
 * Get most connected entities (hubs)
 */
export async function getHubEntities(
  userId: number,
  limit: number = 10
): Promise<GraphNode[]> {
  const result = await query<EntityRow & { connection_count: string }>(
    `SELECT e.*, COUNT(r.id) as connection_count
     FROM entities e
     LEFT JOIN entity_relationships r ON (
       r.source_entity_id = e.entity_id OR r.target_entity_id = e.entity_id
     )
     WHERE e.user_id = $1
     GROUP BY e.id
     ORDER BY connection_count DESC, e.mention_count DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(e => ({
    entityId: e.entity_id,
    name: e.name,
    canonicalName: e.canonical_name || e.name.toLowerCase(),
    type: e.entity_type || 'unknown',
    description: e.description,
    mentionCount: e.mention_count,
    connections: parseInt(e.connection_count, 10),
  }));
}

/**
 * Get entities by type
 */
export async function getEntitiesByType(
  userId: number,
  entityType: string,
  limit: number = 20
): Promise<GraphNode[]> {
  const entities = await searchEntities({
    userId,
    entityType,
    limit,
  });

  const nodes: GraphNode[] = [];

  for (const e of entities) {
    const rels = await getEntityRelationships(e.entity_id, userId);
    nodes.push({
      entityId: e.entity_id,
      name: e.name,
      canonicalName: e.canonical_name || e.name.toLowerCase(),
      type: e.entity_type || 'unknown',
      description: e.description,
      mentionCount: e.mention_count,
      connections: rels.length,
    });
  }

  return nodes;
}

/**
 * Get graph statistics
 */
export async function getGraphStats(
  userId: number
): Promise<{
  totalEntities: number;
  totalRelationships: number;
  entityTypeDistribution: Record<string, number>;
  relationshipTypeDistribution: Record<string, number>;
  avgConnectionsPerEntity: number;
}> {
  const entityCountResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM entities WHERE user_id = $1`,
    [userId]
  );
  const totalEntities = parseInt(entityCountResult.rows[0]?.count || '0', 10);

  const relCountResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM entity_relationships WHERE user_id = $1`,
    [userId]
  );
  const totalRelationships = parseInt(relCountResult.rows[0]?.count || '0', 10);

  const entityTypeResult = await query<{ entity_type: string; count: string }>(
    `SELECT entity_type, COUNT(*) as count
     FROM entities
     WHERE user_id = $1
     GROUP BY entity_type`,
    [userId]
  );
  const entityTypeDistribution: Record<string, number> = {};
  for (const row of entityTypeResult.rows) {
    entityTypeDistribution[row.entity_type || 'unknown'] = parseInt(row.count, 10);
  }

  const relTypeResult = await query<{ relationship_type: string; count: string }>(
    `SELECT relationship_type, COUNT(*) as count
     FROM entity_relationships
     WHERE user_id = $1
     GROUP BY relationship_type`,
    [userId]
  );
  const relationshipTypeDistribution: Record<string, number> = {};
  for (const row of relTypeResult.rows) {
    relationshipTypeDistribution[row.relationship_type || 'related'] = parseInt(row.count, 10);
  }

  return {
    totalEntities,
    totalRelationships,
    entityTypeDistribution,
    relationshipTypeDistribution,
    avgConnectionsPerEntity: totalEntities > 0
      ? (totalRelationships * 2) / totalEntities
      : 0,
  };
}

/**
 * Normalize entity name for consistent lookups
 */
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Remove duplicate edges
 */
function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter(edge => {
    const key = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
    const reverseKey = `${edge.targetId}-${edge.sourceId}-${edge.type}`;
    if (seen.has(key) || seen.has(reverseKey)) return false;
    seen.add(key);
    return true;
  });
}
