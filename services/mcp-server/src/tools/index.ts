/**
 * Tool Registration — Registers all MCP tools on a server instance.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemoryTools } from './memory.js';
import { registerProfileTools } from './profile.js';
import { registerContextTools } from './context.js';
import { registerSystemTools } from './system.js';
import { registerIngestTools } from './ingest.js';
import { registerRecipeTools } from './recipe.js';
import { registerPacketTools } from './packet.js';
import { registerGraphTools } from './graph.js';
import { registerVersioningTools } from './versioning.js';
import { registerPreferenceTools } from './preference.js';

/**
 * Register all Memron MCP tools on the given server.
 *
 * Core Tools:
 * - memory_store, memory_search, memory_update, memory_delete
 * - profile_get, profile_update
 * - context_build
 * - system_health, system_stats
 *
 * Analysis Tools:
 * - memory_ingest, memory_analyze
 *
 * Recipe Tools:
 * - recipe_search, recipe_create, recipe_feedback, recipe_get
 *
 * Preference Tools:
 * - preference_extract, preference_get
 *
 * Context Packet Tools:
 * - context_packet, context_packet_format, context_packet_get
 *
 * Knowledge Graph Tools:
 * - graph_query, graph_paths, graph_hubs, graph_by_type, graph_stats
 * - graph_add_entity, graph_add_relationship
 *
 * Versioning Tools:
 * - prompt_template_create, prompt_version_create, prompt_version_activate
 * - prompt_version_history, prompt_version_compare, prompt_version_get
 * - run_record, run_feedback, run_session_analytics
 * - run_prompt_stats, run_hallucinations, run_get
 */
export function registerAllTools(server: McpServer): void {
  // Core tools
  registerMemoryTools(server);
  registerProfileTools(server);
  registerContextTools(server);
  registerSystemTools(server);

  // Analysis engine tools
  registerIngestTools(server);
  registerRecipeTools(server);
  registerPacketTools(server);
  registerGraphTools(server);
  registerVersioningTools(server);
  registerPreferenceTools(server);
}
