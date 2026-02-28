/**
 * System Tools — Health checks and usage statistics.
 *
 * system.health → Database, encryption, auth health status
 * system.stats  → User memory count, storage, compression, top buckets
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { testConnection } from '../db/client.js';
import { testEncryption } from '../lib/encryption.js';
import { formatToolError } from '../lib/errors.js';
import * as db from '../db/queries.js';

const SERVER_START_TIME = Date.now();

function getUserId(authInfo?: AuthInfo): number {
  const uid = authInfo?.extra?.userId;
  if (!uid || typeof uid !== 'number') throw new Error('Authentication required');
  return uid;
}

/**
 * Register system tools on the MCP server.
 */
export function registerSystemTools(server: McpServer): void {

  // ─── system.health ─────────────────────────────────────────
  server.tool(
    'system_health',
    'Check the health status of all Memron MCP server subsystems: database, encryption, and authentication.',
    {},
    async (_args, extra) => {
      try {
        // Check database connectivity
        const dbHealthy = await testConnection();

        // Check encryption subsystem
        const encryptionHealthy = testEncryption();

        // Check auth (if we got here, auth is working)
        const authHealthy = !!extra.authInfo;

        const overall = dbHealthy && encryptionHealthy && authHealthy;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: overall ? 'healthy' : 'degraded',
              checks: {
                database: dbHealthy ? 'ok' : 'error',
                encryption: encryptionHealthy ? 'ok' : 'error',
                auth: authHealthy ? 'ok' : 'error',
              },
              server: {
                version: '1.0.0',
                uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
                uptimeHuman: formatUptime(Date.now() - SERVER_START_TIME),
                environment: process.env.NODE_ENV || 'development',
              },
              timestamp: new Date().toISOString(),
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

  // ─── system.stats ──────────────────────────────────────────
  server.tool(
    'system_stats',
    'Get memory usage statistics for the authenticated user: total memories, tokens stored, compression rate, and bucket breakdown.',
    {},
    async (_args, extra) => {
      try {
        const userId = getUserId(extra.authInfo);

        const stats = await db.getMemoryStats(userId);
        const compressionRate = stats.totalOriginalTokens > 0
          ? 1 - (stats.totalPointerTokens / stats.totalOriginalTokens)
          : 0;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              memories: {
                total: stats.totalMemories,
                byBucket: stats.bucketCounts,
              },
              tokens: {
                totalOriginal: stats.totalOriginalTokens,
                totalCompressed: stats.totalPointerTokens,
                totalSaved: stats.totalOriginalTokens - stats.totalPointerTokens,
                compressionRate: Math.round(compressionRate * 10000) / 10000,
                compressionPercentage: `${(compressionRate * 100).toFixed(1)}%`,
              },
              timestamp: new Date().toISOString(),
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

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
