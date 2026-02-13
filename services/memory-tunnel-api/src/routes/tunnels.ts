import { Hono } from 'hono';

export const tunnelRoutes = new Hono()
  .get('/', async (c) => {
    // List active tunnels for authenticated DID
    return c.json({ tunnels: [] });
  })
  .post('/', async (c) => {
    // Create a new memory tunnel
    const body = await c.req.json();
    return c.json({ tunnel: { id: 'tun_new', ...body } }, 201);
  })
  .get('/:id', async (c) => {
    // Get tunnel details
    const id = c.req.param('id');
    return c.json({ tunnel: { id } });
  })
  .post('/:id/sync', async (c) => {
    // Trigger a sync through the tunnel
    const id = c.req.param('id');
    return c.json({ synced: true, tunnelId: id });
  })
  .delete('/:id', async (c) => {
    // Close a tunnel
    const id = c.req.param('id');
    return c.json({ closed: true, tunnelId: id });
  });
