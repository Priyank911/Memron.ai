import { Hono } from 'hono';

export const healthRoutes = new Hono().get('/', async (c) => {
  return c.json({
    status: 'ok',
    service: 'memory-tunnel-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    checks: {
      storage: 'unknown',
      encryption: 'unknown',
      redis: 'unknown',
      postgres: 'unknown',
    },
  });
});
