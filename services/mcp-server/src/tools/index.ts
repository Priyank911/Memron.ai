/**
 * Tool Registration — Registers the 4 consolidated MCP verbs on the server.
 *
 * 1. memory_store    — Unified write (context, knowledge, facts, recipes, preferences, Membrow clips)
 * 2. memory_recall   — Unified query/read (hybrid RRF vector + BM25 + graph paths + pinned rules)
 * 3. memory_manage   — Unified mutation (update, delete, pin, unpin, triage, merge, feedback)
 * 4. memory_validate — Unified pre-flight guardrails (active constraints, failure patterns)
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCoreVerbs } from './core-verbs.js';

export function registerAllTools(server: McpServer): void {
  // Register the 4 consolidated core verbs (stays well below agent confusion threshold)
  registerCoreVerbs(server);
}
