import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../worker.js';
import { createHash } from 'node:crypto';

describe('Worker OAuth and MCP Endpoints', () => {
  const mockEnv = {
    MEMRON_RUNTIME: 'worker',
    ENCRYPTION_SECRET: 'test-secret-key-32-chars-long-encryption-secret!',
    JWT_SECRET: 'test-jwt-secret-key-for-signing-tokens-12345678',
    ALLOWED_ORIGINS: '*',
  };

  it('serves server metadata on GET /', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/');
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Memron MCP Server');
    expect(body.runtime).toBe('cloudflare-worker');
    expect(body.endpoints.mcp).toBe('https://memron-mcp.prynk.workers.dev/mcp');
  });

  it('serves RFC 8414 OAuth authorization server metadata', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/.well-known/oauth-authorization-server');
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe('https://memron-mcp.prynk.workers.dev');
    expect(body.token_endpoint).toBe('https://memron-mcp.prynk.workers.dev/token');
    expect(body.authorization_endpoint).toBe('https://memron-mcp.prynk.workers.dev/authorize');
    expect(body.response_types_supported).toContain('code');
    expect(body.code_challenge_methods_supported).toContain('S256');
  });

  it('serves RFC 9728 Protected Resource metadata', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/.well-known/oauth-protected-resource/mcp');
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe('https://memron-mcp.prynk.workers.dev/mcp');
  });

  it('serves embedded logo assets with 200 OK', async () => {
    const reqB = new Request('https://memron-mcp.prynk.workers.dev/logo_b.png');
    const resB = await worker.fetch(reqB, mockEnv as any);
    expect(resB.status).toBe(200);
    expect(resB.headers.get('content-type')).toBe('image/png');

    const reqW = new Request('https://memron-mcp.prynk.workers.dev/logo_w.png');
    const resW = await worker.fetch(reqW, mockEnv as any);
    expect(resW.status).toBe(200);
    expect(resW.headers.get('content-type')).toBe('image/png');
  });

  it('serves login HTML with embedded base64 logo', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/auth/login?request_id=test_req_123');
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Authorize access');
    expect(html).toContain('data:image/png;base64,');
  });

  it('serves auth success page with Memron branding', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/auth/success');
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Authorization Successful');
    expect(html).toContain('MCP Client Connected');
  });

  it('rejects unauthenticated MCP requests with 401', async () => {
    const req = new Request('https://memron-mcp.prynk.workers.dev/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      }),
    });
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(401);
  });
});
