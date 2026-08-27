import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { formatToolError, ValidationError } from '../lib/errors.js';
import { query } from '../db/client.js';
import { decrypt } from '../lib/encryption.js';
import { getGraphNodeByBlindHash } from '../db/queries-graph.js';
import { computeBlindHash } from '../lib/blind-index.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

export function registerMemoryHistoryTools(server: McpServer): void {
  server.tool(
    'memory_history',
    'Show the temporal evolution of a fact, entity, or memory. Returns a timeline of how knowledge changed over time including old values, new values, and timestamps.',
    {
      pointerId: z.string().optional().describe('Get history of a specific memory via forensic snapshots'),
      entityName: z.string().optional().describe('Get history of a graph entity (via blind hash lookup)'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        
        if (!args.pointerId && !args.entityName) {
          throw new ValidationError('At least one of pointerId or entityName must be provided');
        }
        
        const timeline: any[] = [];
        
        if (args.pointerId) {
          const result = await query(
            'SELECT * FROM forensic_snapshots WHERE pointer_id = $1 ORDER BY created_at DESC',
            [args.pointerId]
          );
          
          for (const row of result.rows) {
            const content = decrypt({
              encrypted: row.snapshot_encrypted,
              iv: row.snapshot_iv,
              tag: row.snapshot_tag
            });
            timeline.push({
              timestamp: row.created_at,
              action: row.reason === 'pre-mutation' ? 'updated' : 'snapshot',
              reason: row.reason,
              content
            });
          }
        } else if (args.entityName) {
          const hash = computeBlindHash(args.entityName);
          const node = await getGraphNodeByBlindHash(userId, hash);
          if (node) {
            const result = await query(
              'SELECT * FROM graph_edges WHERE (source_node_id = $1 OR target_node_id = $1) AND user_id = $2 ORDER BY valid_from DESC',
              [node.node_id, userId]
            );
            for (const row of result.rows) {
              timeline.push({
                timestamp: row.valid_from,
                action: row.valid_to ? 'invalidated' : 'created',
                relationshipType: row.relationship_type,
                invalidatedAt: row.valid_to
              });
            }
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId: args.pointerId,
              entityName: args.entityName,
              timeline
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    }
  );
}
