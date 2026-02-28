/**
 * Profile Tools — User profile read/update via MCP.
 *
 * profile.get    → Return current user's identity, org, and usage
 * profile.update → Update display name
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { formatToolError } from '../lib/errors.js';
import * as db from '../db/queries.js';

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

/**
 * Register profile tools on the MCP server.
 */
export function registerProfileTools(server: McpServer): void {

  // ─── profile.get ───────────────────────────────────────────
  server.tool(
    'profile_get',
    'Get the current authenticated user\'s profile, organization, and memory usage statistics.',
    {},
    async (_args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        const user = await db.getUserById(userId);
        if (!user) {
          throw new Error('User not found');
        }

        const org = await db.getOrgForUser(userId);
        const stats = await db.getMemoryStats(userId);
        const compressionRate = stats.totalOriginalTokens > 0
          ? 1 - (stats.totalPointerTokens / stats.totalOriginalTokens)
          : 0;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              user: {
                id: user.id,
                email: user.email,
                name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                imageUrl: user.image_url,
                provider: user.provider,
                createdAt: user.created_at,
              },
              organization: org ? {
                id: org.org_id,
                name: org.name,
                slug: org.slug,
              } : null,
              usage: {
                totalMemories: stats.totalMemories,
                totalOriginalTokens: stats.totalOriginalTokens,
                totalPointerTokens: stats.totalPointerTokens,
                compressionRate: Math.round(compressionRate * 10000) / 10000,
                tokensSaved: stats.totalOriginalTokens - stats.totalPointerTokens,
                bucketBreakdown: stats.bucketCounts,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    },
  );

  // ─── profile.update ────────────────────────────────────────
  server.tool(
    'profile_update',
    'Update the current user\'s display name.',
    {
      firstName: z.string().min(1).max(100).optional().describe('First name'),
      lastName: z.string().min(1).max(100).optional().describe('Last name'),
      displayName: z.string().min(1).max(200).optional().describe('Full display name'),
    },
    async (args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        if (!args.firstName && !args.lastName && !args.displayName) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ updated: false, reason: 'No fields to update' }) }],
          };
        }

        const updated = await db.updateUserProfile(userId, {
          firstName: args.firstName,
          lastName: args.lastName,
          fullName: args.displayName,
        });

        if (!updated) {
          throw new Error('Profile update failed');
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated: true,
              profile: {
                firstName: updated.first_name,
                lastName: updated.last_name,
                fullName: updated.full_name,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: formatToolError(error) }],
          isError: true,
        };
      }
    },
  );
}
