/**
 * Tool Registration — Registers the 4 consolidated MCP verbs on the server,
 * plus profile inspection and read-only pipeline diagnostics.
 *
 * 1. memory_store    — Unified write (context, knowledge, facts, recipes, preferences, Membrow clips)
 * 2. memory_recall   — Unified query/read (hybrid RRF vector + BM25 + graph paths + pinned rules)
 * 3. memory_manage   — Unified mutation (update, delete, pin, unpin, triage, merge, feedback)
 * 4. memory_validate — Unified pre-flight guardrails (active constraints, failure patterns)
 * 5. system_diagnostics / memory_debug — read-only pipeline eye (change nothing)
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCoreVerbs } from './core-verbs.js';
import { registerProfileTools } from './profile.js';
import { registerDiagnosticTools } from './diagnostics.js';
import type { MemoryIndexQueue } from '../lib/memory-index-queue.js';

export function registerAllTools(server: McpServer, options?: { queue?: MemoryIndexQueue }): void {
  // Register the 4 consolidated core verbs (stays well below agent confusion threshold)
  registerCoreVerbs(server, options);
  // Profile inspection is intentionally read-only and lets authenticated
  // clients verify which Memron account their bearer key belongs to.
  registerProfileTools(server);
  // Pipeline eye: read-only diagnostics. No mutations, no new write paths,
  // safe to expose alongside the core verbs.
  registerDiagnosticTools(server);
}
