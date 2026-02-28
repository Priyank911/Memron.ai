/**
 * MCP Server Factory — Creates a configured McpServer instance with all tools.
 *
 * Each MCP session gets its own McpServer instance (required by the SDK).
 * Tools are stateless — they read user context from authInfo on each call.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';

/**
 * Create a fully configured MCP server with all 9 tools registered.
 *
 * The McpServer SDK requires one instance per transport connection
 * because `server.connect(transport)` sets the transport internally.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'memron',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions: [
        'Memron MCP Server — Sovereign memory backbone for AI agents.',
        '',
        'Available tools:',
        '  memory_store   — Store content and get a compressed pointer',
        '  memory_search  — Search memories by query, bucket, or tags',
        '  memory_update  — Update a memory (creates forensic snapshot)',
        '  memory_delete  — Soft-delete a memory by pointer',
        '  profile_get    — Get your profile and usage stats',
        '  profile_update — Update your display name',
        '  context_build  — Build optimized context from relevant memories',
        '  system_health  — Check server health status',
        '  system_stats   — Get your memory usage statistics',
        '',
        'Authentication: OAuth 2.1 + PKCE or Memron API key as bearer token.',
      ].join('\n'),
    },
  );

  registerAllTools(server);

  return server;
}
