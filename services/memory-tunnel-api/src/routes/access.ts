import { Hono } from 'hono';

export const accessRoutes = new Hono()
  .get('/grants', async (c) => {
    // List all access grants for authenticated DID
    return c.json({ grants: [] });
  })
  .post('/grants', async (c) => {
    // Issue a new access grant (R/W + RFC3339 expiration)
    const body = await c.req.json();
    return c.json({ grant: { id: 'grant_new', ...body } }, 201);
  })
  .delete('/grants/:id', async (c) => {
    // Revoke a grant
    const id = c.req.param('id');
    return c.json({ revoked: true, grantId: id });
  });
