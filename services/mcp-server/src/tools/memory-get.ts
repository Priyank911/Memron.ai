import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { decrypt } from '../lib/encryption.js';
import { NotFoundError, formatToolError } from '../lib/errors.js';
import * as db from '../db/queries.js';
import { query } from '../db/client.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

export function registerMemoryGetTools(server: McpServer): void {
  server.tool(
    'memory_get',
    'Retrieve a specific memory by its pointer ID. Returns the full decrypted content, metadata, and tags.',
    {
      pointerId: z.string().describe('The pointer ID of the memory to retrieve'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        
        const memory = await db.getMemoryByPointer(args.pointerId, userId);
        if (!memory) {
          throw new NotFoundError('Memory', args.pointerId);
        }
        
        const decryptedContent = decrypt({
          encrypted: memory.content_encrypted,
          iv: memory.content_iv,
          tag: memory.content_tag
        });
        
        // Update access count and last accessed time
        await query(
          'UPDATE memories SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1',
          [memory.id]
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pointerId: memory.pointer_id,
              content: decryptedContent,
              bucket: memory.bucket,
              title: memory.title,
              tags: memory.tags,
              metadata: memory.metadata,
              createdAt: memory.created_at,
              updatedAt: memory.updated_at
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
