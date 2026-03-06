import { serve } from '@hono/node-server';
import { app } from './app';
import { logger } from './lib/logger';

const port = parseInt(process.env.MEMORY_TUNNEL_PORT ?? '4200', 10);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`  Tunnel API    >> http://localhost:${port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`❌ Memory Tunnel: port ${port} already in use. Kill the old process or change MEMORY_TUNNEL_PORT.`);
    process.exit(1);
  }
  throw err;
});

const shutdown = () => { server.close(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
