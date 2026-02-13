import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { tunnelRoutes } from './routes/tunnels';
import { memoryRoutes } from './routes/memory';
import { dropRoutes } from './routes/drops';
import { accessRoutes } from './routes/access';
import { trustRoutes } from './routes/trust';
import { mcpRoutes } from './routes/mcp';
import { healthRoutes } from './routes/health';

export const app = new Hono()
  .use('*', honoLogger())
  .use('*', cors())
  .route('/health', healthRoutes)
  .route('/v1/tunnels', tunnelRoutes)
  .route('/v1/memory', memoryRoutes)
  .route('/v1/drops', dropRoutes)
  .route('/v1/access', accessRoutes)
  .route('/v1/trust', trustRoutes)
  .route('/mcp', mcpRoutes);

export type AppType = typeof app;
