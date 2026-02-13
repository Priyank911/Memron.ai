import { Hono } from 'hono';

export const trustRoutes = new Hono()
  .get('/scores', async (c) => {
    // Trust leaderboard
    return c.json({ scores: [] });
  })
  .get('/profile/:did', async (c) => {
    const did = c.req.param('did');
    return c.json({ did, score: null });
  })
  .post('/attest', async (c) => {
    // Submit a trust attestation
    const body = await c.req.json();
    return c.json({ attestation: body }, 201);
  });
