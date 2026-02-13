import { Hono } from 'hono';

export const mcpRoutes = new Hono()
  .get('/', async (c) => {
    // MCP server info endpoint
    return c.json({
      name: 'memron-memory-tunnel',
      version: '0.1.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
    });
  })
  .post('/tools/call', async (c) => {
    // Handle MCP tool calls (store, recall, search, drop, snapshot)
    const { name, arguments: args } = await c.req.json();
    // TODO: Route to MemronMCPServer.handleToolCall()
    return c.json({ content: [{ type: 'text', text: `Called ${name}` }] });
  })
  .get('/tools/list', async (c) => {
    // List available MCP tools
    return c.json({ tools: [] });
  })
  .get('/resources/list', async (c) => {
    // List MCP resources (memory buckets)
    return c.json({ resources: [] });
  })
  .get('/prompts/list', async (c) => {
    // List MCP prompts
    return c.json({ prompts: [] });
  });
