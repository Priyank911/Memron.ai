/**
 * Memron MCP Server — stdio Transport Bridge
 *
 * This entry point runs the MCP server over stdio (stdin/stdout),
 * which is what these agents expect:
 *   - Claude Desktop
 *   - Cline (VS Code extension)
 *   - Roo Code
 *   - Any tool using `command` + `args` in MCP config
 *
 * Usage:
 *   node dist/stdio.js
 *   npx tsx src/stdio.ts          (dev)
 *
 * Environment variables:
 *   MEMRON_API_KEY  — Your Memron API key (mm_live_xxx)
 *   PG_HOST, PG_PORT, etc. — Database connection (same as HTTP server)
 *
 * The stdio bridge connects directly to the database — no HTTP server
 * needed. It's a single-user, single-session MCP server.
 */
import 'dotenv/config';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { testConnection, warmPool, close as closeDb } from './db/client.js';
import { runMigrations } from './db/schema.js';
import { testEncryption } from './lib/encryption.js';
import { createMcpServer } from './mcp.js';

async function main() {
  // Validate environment
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[FATAL] Cannot connect to PostgreSQL. Check PG_* environment variables.');
    process.exit(1);
  }

  await runMigrations();
  await warmPool();

  if (!testEncryption()) {
    console.error('[FATAL] Encryption self-test failed. Check ENCRYPTION_SECRET.');
    process.exit(1);
  }

  // Create MCP server with all tools
  const server = createMcpServer();

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect and start
  await server.connect(transport);

  // All console.error goes to stderr (doesn't interfere with stdio protocol)
  console.error('[Memron] MCP stdio server started');
  console.error('[Memron] Tools: memory_store, memory_search, memory_update, memory_delete,');
  console.error('[Memron]        profile_get, profile_update, context_build,');
  console.error('[Memron]        system_health, system_stats');

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[Memron] Shutting down...');
    await server.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[FATAL] stdio server failed:', error);
  process.exit(1);
});
