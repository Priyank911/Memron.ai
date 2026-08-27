import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { formatToolError } from '../lib/errors.js';
import { query } from '../db/client.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

export function registerMemoryListTools(server: McpServer): void {
  server.tool(
    'memory_list',
    'List memories with pagination and filtering. Returns memory metadata without decrypted content.',
    {
      bucket: z.string().optional().describe('Filter by bucket'),
      tags: z.array(z.string()).optional().describe('Filter by tags (any match)'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
      offset: z.number().min(0).optional().describe('Pagination offset (default 0)'),
      sortBy: z.enum(['created_at', 'updated_at', 'importance']).optional().describe('Sort column'),
      sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const limit = args.limit ?? 20;
        const offset = args.offset ?? 0;
        const sortBy = args.sortBy ?? 'created_at';
        const sortOrder = args.sortOrder ?? 'desc';
        
        const conditions: string[] = ['user_id = $1', 'is_active = true'];
        const values: any[] = [userId];
        let paramIdx = 2;
        
        if (args.bucket) {
          conditions.push(`bucket = $${paramIdx++}`);
          values.push(args.bucket);
        }
        
        if (args.tags && args.tags.length > 0) {
          conditions.push(`tags && $${paramIdx++}`);
          values.push(args.tags);
        }
        
        const whereClause = conditions.join(' AND ');
        const orderClause = `${sortBy} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
        
        const limitIdx = paramIdx;
        const offsetIdx = paramIdx + 1;
        values.push(limit, offset);
        
        const sql = `
          SELECT pointer_id, title, bucket, tags, original_tokens, created_at, updated_at,
                 COUNT(*) OVER() as total_count
          FROM memories
          WHERE ${whereClause}
          ORDER BY ${orderClause}
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `;
        
        const result = await query(sql, values);
        
        const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
        const memories = result.rows.map((r: any) => ({
          pointerId: r.pointer_id,
          title: r.title,
          bucket: r.bucket,
          tags: r.tags,
          originalTokens: r.original_tokens,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalCount,
              limit,
              offset,
              memories
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
