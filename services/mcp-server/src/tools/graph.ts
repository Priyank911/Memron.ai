/**
 * Knowledge Graph Tools
 * Query and manage the entity relationship graph
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  addEntity,
  addRelationship,
  queryGraph,
  findPaths,
  getHubEntities,
  getEntitiesByType,
  getGraphStats,
} from '../lib/graph-builder.js';
import { McpError, ErrorCode } from '../lib/errors.js';

const GraphQuerySchema = z.object({
  userId: z.number(),
  entityName: z.string().max(200),
  depth: z.number().min(1).max(5).optional(),
});

const GraphPathSchema = z.object({
  userId: z.number(),
  fromEntity: z.string().max(200),
  toEntity: z.string().max(200),
  maxDepth: z.number().min(1).max(6).optional(),
});

const GraphHubsSchema = z.object({
  userId: z.number(),
  limit: z.number().min(1).max(50).optional(),
});

const GraphTypeSchema = z.object({
  userId: z.number(),
  entityType: z.string().max(100),
  limit: z.number().min(1).max(100).optional(),
});

const GraphStatsSchema = z.object({
  userId: z.number(),
});

const EntityAddSchema = z.object({
  userId: z.number(),
  name: z.string().max(200),
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  sourceMemoryId: z.string().max(100).optional(),
});

const RelationshipAddSchema = z.object({
  userId: z.number(),
  sourceEntityName: z.string().max(200),
  targetEntityName: z.string().max(200),
  relationshipType: z.string().max(100),
  strength: z.number().min(0).max(1).optional(),
  sourceMemoryId: z.string().max(100).optional(),
});

/**
 * Register graph tools
 */
export function registerGraphTools(server: McpServer): void {
  // graph_query - Query the knowledge graph starting from an entity
  server.tool(
    'graph_query',
    'Query the knowledge graph starting from an entity',
    GraphQuerySchema.shape,
    async (params) => {
      const input = GraphQuerySchema.parse(params);

      try {
        const result = await queryGraph(
          input.userId,
          input.entityName,
          input.depth || 2
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query: input.entityName,
                depth: input.depth || 2,
                centralEntity: result.centralEntity,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                nodes: result.nodes,
                edges: result.edges,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Graph query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_paths - Find paths between two entities
  server.tool(
    'graph_paths',
    'Find paths between two entities in the knowledge graph',
    GraphPathSchema.shape,
    async (params) => {
      const input = GraphPathSchema.parse(params);

      try {
        const paths = await findPaths(
          input.userId,
          input.fromEntity,
          input.toEntity,
          input.maxDepth || 4
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                from: input.fromEntity,
                to: input.toEntity,
                pathCount: paths.length,
                paths: paths.map((path, i) => ({
                  pathIndex: i,
                  length: path.length,
                  steps: path.map(step => ({
                    entity: step.entity.name,
                    entityType: step.entity.type,
                    relationship: step.relationship?.type,
                  })),
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Path finding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_hubs - Get most connected entities
  server.tool(
    'graph_hubs',
    'Get the most connected entities (hubs) in the knowledge graph',
    GraphHubsSchema.shape,
    async (params) => {
      const input = GraphHubsSchema.parse(params);

      try {
        const hubs = await getHubEntities(input.userId, input.limit || 10);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: hubs.length,
                hubs: hubs.map((hub, rank) => ({
                  rank: rank + 1,
                  ...hub,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Hub retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_by_type - Get entities by type
  server.tool(
    'graph_by_type',
    'Get all entities of a specific type',
    GraphTypeSchema.shape,
    async (params) => {
      const input = GraphTypeSchema.parse(params);

      try {
        const entities = await getEntitiesByType(
          input.userId,
          input.entityType,
          input.limit || 20
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                type: input.entityType,
                count: entities.length,
                entities,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Type query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_stats - Get graph statistics
  server.tool(
    'graph_stats',
    'Get statistics about the knowledge graph',
    GraphStatsSchema.shape,
    async (params) => {
      const input = GraphStatsSchema.parse(params);

      try {
        const stats = await getGraphStats(input.userId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Stats retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_add_entity - Add an entity to the graph
  server.tool(
    'graph_add_entity',
    'Add a new entity to the knowledge graph',
    EntityAddSchema.shape,
    async (params) => {
      const input = EntityAddSchema.parse(params);

      try {
        const entity = await addEntity(input.userId, {
          name: input.name,
          type: input.type,
          description: input.description,
          sourceMemoryId: input.sourceMemoryId,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                entityId: entity.entity_id,
                name: entity.name,
                canonicalName: entity.canonical_name,
                type: entity.entity_type,
                mentionCount: entity.mention_count,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Entity addition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // graph_add_relationship - Add a relationship between entities
  server.tool(
    'graph_add_relationship',
    'Add a relationship between two entities',
    RelationshipAddSchema.shape,
    async (params) => {
      const input = RelationshipAddSchema.parse(params);

      try {
        const relationship = await addRelationship(input.userId, {
          sourceEntityName: input.sourceEntityName,
          targetEntityName: input.targetEntityName,
          type: input.relationshipType,
          strength: input.strength,
          sourceMemoryId: input.sourceMemoryId,
        });

        if (!relationship) {
          throw new McpError(
            'Failed to create relationship',
            ErrorCode.InternalError,
            500
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                relationshipId: relationship.relationship_id,
                source: input.sourceEntityName,
                target: input.targetEntityName,
                type: relationship.relationship_type,
                strength: relationship.strength,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Relationship addition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
