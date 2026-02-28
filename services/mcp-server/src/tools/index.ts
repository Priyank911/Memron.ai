/**
 * Tool Registration — Registers all 9 MCP tools on a server instance.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemoryTools } from './memory.js';
import { registerProfileTools } from './profile.js';
import { registerContextTools } from './context.js';
import { registerSystemTools } from './system.js';

/**
 * Register all Memron MCP tools on the given server.
 *
 * Tools:
 * - memory_store, memory_search, memory_update, memory_delete
 * - profile_get, profile_update
 * - context_build
 * - system_health, system_stats
 */
export function registerAllTools(server: McpServer): void {
  registerMemoryTools(server);
  registerProfileTools(server);
  registerContextTools(server);
  registerSystemTools(server);
}
