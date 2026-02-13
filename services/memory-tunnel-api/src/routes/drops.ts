import { Hono } from 'hono';

export const dropRoutes = new Hono()
  .get('/', async (c) => {
    // List drop notifications (incoming P2P shares)
    return c.json({ drops: [] });
  })
  .post('/', async (c) => {
    // Send a P2P drop to another agent
    const body = await c.req.json();
    return c.json({ drop: { id: 'drop_new', ...body } }, 201);
  })
  .post('/:id/accept', async (c) => {
    const id = c.req.param('id');
    return c.json({ accepted: true, dropId: id });
  })
  .post('/:id/reject', async (c) => {
    const id = c.req.param('id');
    return c.json({ rejected: true, dropId: id });
  });
