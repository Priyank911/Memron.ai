import { serve } from '@hono/node-server';
import { app } from './app';
import { logger } from './lib/logger';

const port = parseInt(process.env.MEMORY_TUNNEL_PORT ?? '4200', 10);

serve({ fetch: app.fetch, port }, () => {
  logger.info(`🧠 Memory Tunnel API running on http://localhost:${port}`);
  logger.info(`📡 MCP Bridge endpoint: http://localhost:${port}/mcp`);
});
