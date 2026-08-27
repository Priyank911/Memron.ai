import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { formatToolError } from '../lib/errors.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { insertPinnedFact, deletePinnedFact, getPinnedFacts } from '../db/queries-graph.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

function getOrgId(authInfo?: AuthInfo): number | undefined {
  const oid = authInfo?.extra?.orgId;
  return typeof oid === 'number' ? oid : undefined;
}

export function registerMemoryPinTools(server: McpServer): void {
  server.tool(
    'memory_pin',
    'Pin a critical fact to always-inject context. Pinned facts bypass retrieval and are automatically included in every context packet. Use sparingly for essential information like coding standards, user constraints, or critical preferences.',
    {
      content: z.string().min(1).max(500),
      label: z.string().min(1).max(255),
      priority: z.number().min(0).max(10).optional(),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        const orgId = getOrgId(extra.authInfo);
        
        const pinId = nanoid();
        const encrypted = encrypt(args.content);
        
        const fact = await insertPinnedFact({
          pinId,
          userId,
          orgId,
          label: args.label,
          encryptedContent: encrypted.encrypted,
          contentIv: encrypted.iv,
          contentTag: encrypted.tag,
          priority: args.priority ?? 0,
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pinId: fact.pin_id,
              label: fact.label,
              priority: fact.priority,
              success: true
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

  server.tool(
    'memory_unpin',
    'Remove a pinned fact so it is no longer automatically injected into context.',
    {
      pinId: z.string(),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        
        const success = await deletePinnedFact(args.pinId, userId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pinId: args.pinId,
              success,
              deleted: success
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

  server.tool(
    'memory_list_pins',
    'List all active pinned facts for the current user.',
    {},
    async (_args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);
        
        const facts = await getPinnedFacts(userId);
        
        const results = facts.map(f => ({
          pinId: f.pin_id,
          label: f.label,
          priority: f.priority,
          content: decrypt({
            encrypted: f.encrypted_content,
            iv: f.content_iv,
            tag: f.content_tag
          }),
          createdAt: f.created_at
        }));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: results.length,
              pins: results
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
