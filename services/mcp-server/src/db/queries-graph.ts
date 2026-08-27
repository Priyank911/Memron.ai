/**
 * Database Queries for Graph Storage
 * CRUD operations for graph_nodes, graph_edges, and pinned_facts
 */

import { query } from './client.js';

// ============================================================================
// Helpers
// ============================================================================

function validateEmbedding(embedding: number[]): void {
  if (embedding.length > 4096) {
    throw new Error(`Embedding dimension ${embedding.length} exceeds maximum of 4096`);
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new Error(`Embedding contains non-finite value at index ${i}`);
    }
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface GraphNodeRow {
  id: number;
  node_id: string;
  user_id: number;
  org_id: number | null;
  workspace_id: string | null;
  agent_id: string | null;
  blind_name_hash: string;
  entity_type: string;
  encrypted_payload: Buffer;
  payload_iv: Buffer;
  payload_tag: Buffer;
  mention_count: number;
  importance_score: number;
  embedding: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface GraphEdgeRow {
  id: number;
  edge_id: string;
  user_id: number;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  valid_from: Date;
  valid_to: Date | null;
  observed_at: Date;
  recorded_at: Date;
  strength: number;
  evidence_count: number;
  source_pointer_id: string | null;
  encrypted_metadata: Buffer | null;
  metadata_iv: Buffer | null;
  metadata_tag: Buffer | null;
  created_at: Date;
  updated_at: Date;
}

export interface PinnedFactRow {
  id: number;
  pin_id: string;
  user_id: number;
  org_id: number | null;
  workspace_id: string | null;
  label: string;
  encrypted_content: Buffer;
  content_iv: Buffer;
  content_tag: Buffer;
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Graph Node Operations
// ============================================================================

export async function insertGraphNode(params: {
  nodeId: string;
  userId: number;
  orgId?: number;
  workspaceId?: string;
  agentId?: string;
  blindNameHash: string;
  entityType: string;
  encryptedPayload: Buffer;
  payloadIv: Buffer;
  payloadTag: Buffer;
  mentionCount?: number;
  importanceScore?: number;
  embedding?: number[];
}): Promise<GraphNodeRow> {
  const embeddingStr = params.embedding ? (validateEmbedding(params.embedding), `[${params.embedding.join(',')}]`) : null;
  const result = await query<GraphNodeRow>(
    `INSERT INTO graph_nodes (
      node_id, user_id, org_id, workspace_id, agent_id,
      blind_name_hash, entity_type,
      encrypted_payload, payload_iv, payload_tag,
      mention_count, importance_score, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (user_id, blind_name_hash) DO UPDATE SET
      mention_count = graph_nodes.mention_count + 1,
      updated_at = NOW()
    RETURNING *`,
    [
      params.nodeId,
      params.userId,
      params.orgId || null,
      params.workspaceId || null,
      params.agentId || null,
      params.blindNameHash,
      params.entityType,
      params.encryptedPayload,
      params.payloadIv,
      params.payloadTag,
      params.mentionCount || 1,
      params.importanceScore || 0,
      embeddingStr,
    ]
  );
  return result.rows[0];
}

export async function getGraphNodeByBlindHash(userId: number, blindHash: string): Promise<GraphNodeRow | null> {
  const result = await query<GraphNodeRow>(
    `SELECT * FROM graph_nodes WHERE user_id = $1 AND blind_name_hash = $2`,
    [userId, blindHash]
  );
  return result.rows[0] || null;
}

export async function getGraphNodeById(nodeId: string): Promise<GraphNodeRow | null> {
  const result = await query<GraphNodeRow>(
    `SELECT * FROM graph_nodes WHERE node_id = $1`,
    [nodeId]
  );
  return result.rows[0] || null;
}

export async function searchGraphNodes(params: {
  userId: number;
  entityType?: string;
  limit?: number;
}): Promise<GraphNodeRow[]> {
  let sql = `SELECT * FROM graph_nodes WHERE user_id = $1`;
  const values: unknown[] = [params.userId];
  let paramIndex = 2;

  if (params.entityType) {
    sql += ` AND entity_type = $${paramIndex}`;
    values.push(params.entityType);
    paramIndex++;
  }

  sql += ` ORDER BY importance_score DESC, mention_count DESC`;

  if (params.limit) {
    sql += ` LIMIT $${paramIndex}`;
    values.push(params.limit);
  }

  const result = await query<GraphNodeRow>(sql, values);
  return result.rows;
}

export async function updateGraphNodeImportance(nodeId: string, importance: number): Promise<void> {
  await query(
    `UPDATE graph_nodes SET importance_score = $1, updated_at = NOW() WHERE node_id = $2`,
    [importance, nodeId]
  );
}

// ============================================================================
// Graph Edge Operations
// ============================================================================

export async function insertGraphEdge(params: {
  edgeId: string;
  userId: number;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  validFrom?: Date;
  strength?: number;
  evidenceCount?: number;
  sourcePointerId?: string;
  encryptedMetadata?: Buffer;
  metadataIv?: Buffer;
  metadataTag?: Buffer;
}): Promise<GraphEdgeRow> {
  const result = await query<GraphEdgeRow>(
    `INSERT INTO graph_edges (
      edge_id, user_id, source_node_id, target_node_id, relationship_type,
      valid_from, strength, evidence_count, source_pointer_id,
      encrypted_metadata, metadata_iv, metadata_tag
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      params.edgeId,
      params.userId,
      params.sourceNodeId,
      params.targetNodeId,
      params.relationshipType,
      params.validFrom || new Date(),
      params.strength || 0.5,
      params.evidenceCount || 1,
      params.sourcePointerId || null,
      params.encryptedMetadata || null,
      params.metadataIv || null,
      params.metadataTag || null,
    ]
  );
  return result.rows[0];
}

export async function getActiveEdgesForNode(nodeId: string, userId: number): Promise<GraphEdgeRow[]> {
  const result = await query<GraphEdgeRow>(
    `SELECT * FROM graph_edges 
     WHERE (source_node_id = $1 OR target_node_id = $1) 
       AND user_id = $2 
       AND valid_to IS NULL`,
    [nodeId, userId]
  );
  return result.rows;
}

export async function invalidateEdge(edgeId: string, userId: number): Promise<boolean> {
  const result = await query(
    `UPDATE graph_edges SET valid_to = NOW(), updated_at = NOW() WHERE edge_id = $1 AND user_id = $2 RETURNING id`,
    [edgeId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getEdgeHistory(sourceNodeId: string, targetNodeId: string, userId: number): Promise<GraphEdgeRow[]> {
  const result = await query<GraphEdgeRow>(
    `SELECT * FROM graph_edges 
     WHERE source_node_id = $1 AND target_node_id = $2 AND user_id = $3 
     ORDER BY valid_from DESC`,
    [sourceNodeId, targetNodeId, userId]
  );
  return result.rows;
}

// ============================================================================
// Multi-Hop Traversal
// ============================================================================

export async function traverseSubgraph(params: {
  userId: number;
  startNodeId: string;
  maxDepth?: number;
  activeOnly?: boolean;
}): Promise<{ nodes: GraphNodeRow[]; edges: GraphEdgeRow[] }> {
  const maxDepth = params.maxDepth ?? 3;
  const activeOnly = params.activeOnly ?? true;

  const nodesResult = await query<GraphNodeRow>(
    `WITH RECURSIVE subgraph AS (
      SELECT n.*, 0 AS depth, ARRAY[n.node_id] AS path
      FROM graph_nodes n
      WHERE n.node_id = $1 AND n.user_id = $2
      UNION ALL
      SELECT target.*, sg.depth + 1, sg.path || target.node_id
      FROM subgraph sg
      JOIN graph_edges e ON e.source_node_id = sg.node_id
      JOIN graph_nodes target ON target.node_id = e.target_node_id
      WHERE sg.depth < $3
        AND NOT (target.node_id = ANY(sg.path))
        AND e.user_id = $2
        AND ($4 = false OR e.valid_to IS NULL)
    )
    SELECT DISTINCT ON (node_id) * FROM subgraph`,
    [params.startNodeId, params.userId, maxDepth, activeOnly]
  );

  const nodes = nodesResult.rows;
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeIds = nodes.map((n) => n.node_id);
  
  let edgeQuery = `SELECT * FROM graph_edges WHERE source_node_id = ANY($1) AND target_node_id = ANY($1) AND user_id = $2`;
  if (activeOnly) {
    edgeQuery += ` AND valid_to IS NULL`;
  }

  const edgesResult = await query<GraphEdgeRow>(edgeQuery, [nodeIds, params.userId]);
  
  return { nodes, edges: edgesResult.rows };
}

// ============================================================================
// Pinned Facts Operations
// ============================================================================

export async function insertPinnedFact(params: {
  pinId: string;
  userId: number;
  orgId?: number;
  workspaceId?: string;
  label: string;
  encryptedContent: Buffer;
  contentIv: Buffer;
  contentTag: Buffer;
  priority?: number;
}): Promise<PinnedFactRow> {
  const result = await query<PinnedFactRow>(
    `INSERT INTO pinned_facts (
      pin_id, user_id, org_id, workspace_id,
      label, encrypted_content, content_iv, content_tag, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      params.pinId,
      params.userId,
      params.orgId || null,
      params.workspaceId || null,
      params.label,
      params.encryptedContent,
      params.contentIv,
      params.contentTag,
      params.priority || 0,
    ]
  );
  return result.rows[0];
}

export async function getPinnedFacts(userId: number, workspaceId?: string): Promise<PinnedFactRow[]> {
  let sql = `SELECT * FROM pinned_facts WHERE user_id = $1 AND is_active = true`;
  const values: unknown[] = [userId];

  if (workspaceId) {
    sql += ' AND workspace_id = $2';
    values.push(workspaceId);
  }

  sql += ' ORDER BY priority DESC';

  const result = await query<PinnedFactRow>(sql, values);
  return result.rows;
}

export async function deletePinnedFact(pinId: string, userId: number): Promise<boolean> {
  const result = await query(
    `UPDATE pinned_facts SET is_active = false, updated_at = NOW() WHERE pin_id = $1 AND user_id = $2 RETURNING id`,
    [pinId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
