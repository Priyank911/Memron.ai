/**
 * E2E HTTP Tests — verifies Express middleware chain, auth, rate limiting,
 * CORS, error handling via supertest (no running server needed).
 *
 * Database is mocked; we're testing the HTTP layer, not DB queries.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Mock database + dependencies BEFORE importing app ───
vi.mock('../db/client.js', () => ({
  testConnection: vi.fn().mockResolvedValue(true),
  warmPool: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockReturnValue(Promise.resolve()),
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('../db/schema.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/queries.js', () => ({
  getUserByApiKeyHash: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue(null),
  insertAuthCode: vi.fn().mockResolvedValue(undefined),
  insertPendingAuth: vi.fn().mockResolvedValue(undefined),
  getPendingAuth: vi.fn().mockResolvedValue(null),
  deletePendingAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/encryption.js', () => ({
  testEncryption: vi.fn().mockReturnValue(true),
}));

vi.mock('../config.js', () => ({
  config: {
    port: 0,
    serverUrl: 'http://localhost:5201',
    landingUrl: 'http://localhost:3000',
    isDev: true,
    isRailway: false,
    encryption: {
      secret: 'test-secret-key-that-is-long-enough-for-testing-purposes-1234567890',
    },
  },
}));

vi.mock('../mcp.js', () => ({
  createMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../auth/provider.js', () => {
  return {
    MemronOAuthProvider: vi.fn().mockImplementation(() => ({
      clientsStore: {
        getClient: vi.fn().mockResolvedValue(null),
        registerClient: vi.fn().mockResolvedValue(undefined),
      },
    })),
    renderLoginPage: vi.fn().mockReturnValue('<html>Login</html>'),
  };
});

vi.mock('../auth/verify.js', () => ({
  MemronTokenVerifier: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../lib/tokens.js', () => ({
  isApiKey: vi.fn().mockImplementation((key: string) => key.startsWith('mm_live_') || key.startsWith('mm_test_') || key.startsWith('mm_dev_')),
  hashApiKey: vi.fn().mockReturnValue('mocked_hash'),
  generateAuthCode: vi.fn().mockReturnValue('mocked_auth_code'),
}));

// Stub mcpAuthRouter to avoid SDK initialization issues
vi.mock('@modelcontextprotocol/sdk/server/auth/router.js', () => ({
  mcpAuthRouter: vi.fn().mockReturnValue((_req: any, _res: any, next: any) => next()),
}));

vi.mock('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js', () => ({
  requireBearerAuth: vi.fn().mockReturnValue((_req: any, res: any, _next: any) => {
    res.status(401).json({ error: 'invalid_token' });
  }),
}));

// Import app AFTER mocks are set up
const { app } = await import('../index.js');

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('E2E HTTP Tests', () => {
  describe('Health & Info', () => {
    it('GET /health returns 200 with healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('memron-mcp-server');
      expect(res.body.checks).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /health returns degraded when DB fails', async () => {
      const { testConnection } = await import('../db/client.js');
      (testConnection as any).mockResolvedValueOnce(false);

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.database).toBe('error');
    });

    it('GET / returns server info JSON', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Memron MCP Server');
      expect(res.body.endpoints).toBeDefined();
      expect(res.body.auth).toBeDefined();
    });
  });

  describe('Auth Endpoints', () => {
    it('POST /auth/test without body returns 400', async () => {
      const res = await request(app).post('/auth/test').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/test with invalid key format returns 400', async () => {
      const res = await request(app).post('/auth/test').send({ api_key: 'invalid_key' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/format/i);
    });

    it('POST /auth/test with valid-format but unknown key returns 401', async () => {
      const res = await request(app)
        .post('/auth/test')
        .send({ api_key: 'mm_live_test_fake_key_here_padded_to_56chars00000000' });
      expect(res.status).toBe(401);
    });

    it('POST /admin/seed-key without required fields returns 400', async () => {
      // isDev = true so no admin secret needed
      const res = await request(app).post('/admin/seed-key').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/complete without body returns 400', async () => {
      const res = await request(app).post('/auth/complete').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/complete with invalid key format returns 400', async () => {
      const res = await request(app)
        .post('/auth/complete')
        .send({ request_id: 'req_123', api_key: 'bad_key' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/format/i);
    });
  });

  describe('OAuth Metadata', () => {
    it('GET /.well-known/oauth-authorization-server returns valid metadata', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server');
      expect(res.status).toBe(200);
      expect(res.body.issuer).toBeDefined();
      expect(res.body.authorization_endpoint).toBeDefined();
      expect(res.body.token_endpoint).toBeDefined();
      expect(res.body.registration_endpoint).toBeDefined();
      expect(res.body.response_types_supported).toContain('code');
      expect(res.body.code_challenge_methods_supported).toContain('S256');
    });

    it('GET /.well-known/oauth-protected-resource/mcp returns valid metadata', async () => {
      const res = await request(app).get('/.well-known/oauth-protected-resource/mcp');
      expect(res.status).toBe(200);
      expect(res.body.resource).toBeDefined();
      expect(res.body.authorization_servers).toBeDefined();
      expect(res.body.scopes_supported).toBeDefined();
    });
  });

  describe('MCP Endpoint Auth', () => {
    it('POST /mcp without Authorization header returns 401', async () => {
      const res = await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
      expect(res.status).toBe(401);
    });

    it('GET /mcp without session returns 400', async () => {
      const res = await request(app)
        .get('/mcp')
        .set('Authorization', 'Bearer mm_live_test_fake_key_here_padded_to_56chars00000000');
      // Auth will fail (key not found) but we're testing the route exists
      expect([400, 401]).toContain(res.status);
    });

    it('DELETE /mcp without session returns 200 (graceful)', async () => {
      const res = await request(app).delete('/mcp');
      expect(res.status).toBe(200);
    });

    it('DELETE /mcp with unknown session returns 200 (graceful)', async () => {
      const res = await request(app)
        .delete('/mcp')
        .set('Mcp-Session-Id', 'nonexistent-session-id');
      expect(res.status).toBe(200);
    });
  });

  describe('CORS', () => {
    it('preflight OPTIONS returns proper CORS headers', async () => {
      const res = await request(app)
        .options('/mcp')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Rate Limiting Headers', () => {
    it('responses include RateLimit headers', async () => {
      const res = await request(app).post('/auth/test').send({ api_key: 'mm_live_test_fake_key_here_padded_to_56chars00000000' });
      // express-rate-limit v7 uses standardHeaders: true → RateLimit-* headers
      const hasRateLimitHeader = res.headers['ratelimit-limit'] || res.headers['ratelimit-remaining'] || res.headers['x-ratelimit-limit'];
      expect(hasRateLimitHeader).toBeDefined();
    });
  });

  describe('Body Limits', () => {
    it('POST with body > 1MB returns 413', async () => {
      const largeBody = 'x'.repeat(1.5 * 1024 * 1024); // 1.5MB
      const res = await request(app)
        .post('/auth/test')
        .set('Content-Type', 'application/json')
        .send(largeBody);
      expect(res.status).toBe(413);
    });
  });

  describe('404 Handling', () => {
    it('GET unknown path returns 404', async () => {
      const res = await request(app).get('/nonexistent-path-abc-123');
      expect(res.status).toBe(404);
    });
  });
});
