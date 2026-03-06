import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

/**
 * Gateway — API gateway and WebSocket hub for the Memron platform.
 * Routes external requests to internal services and manages
 * real-time WebSocket connections for P2P drop notifications.
 */
const app = new Hono()
  .use('*', cors())
  .get('/health', (c) => c.json({ status: 'ok', service: 'gateway' }))
  .all('/api/*', async (c) => {
    // Proxy to memory-tunnel-api
    const url = new URL(c.req.url);
    url.port = '4200';
    url.pathname = url.pathname.replace('/api', '');
    // TODO: Forward request
    return c.json({ proxied: true });
  });

const port = parseInt(process.env.PLATFORM_API_PORT ?? '4000', 10);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`  Gateway       >> http://localhost:${port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Gateway: port ${port} already in use. Kill the old process or change PLATFORM_API_PORT.`);
    process.exit(1);
  }
  throw err;
});

// Graceful shutdown so turbo can restart cleanly
const shutdown = () => { server.close(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
