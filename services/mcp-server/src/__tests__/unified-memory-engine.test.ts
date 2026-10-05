import { describe, expect, it } from 'vitest';
import { classifyRecallQuery } from '../engine/unified-memory-engine.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpServer } from '../mcp.js';

describe('memory engine v2 query policy', () => {
  it('uses a compact budget for a single-fact query', () => {
    const profile = classifyRecallQuery('what database does Helios use now');
    expect(profile.kind).toBe('fact');
    expect(profile.budget).toBe(800);
    expect(profile.weights.bm25).toBeGreaterThan(0.8);
  });

  it('raises graph weight and budget for relationship queries', () => {
    const profile = classifyRecallQuery('how is Helios connected to Memron and what changed since last week');
    expect(profile.kind).toBe('relationship');
    expect(profile.budget).toBe(4000);
    expect(profile.weights.graph).toBe(1.6);
    expect(profile.weights.recency).toBe(0.9);
  });

  it('caps broad context queries at 10,000 tokens', () => {
    const profile = classifyRecallQuery('tell me everything about the whole Helios project history and current state');
    expect(profile.kind).toBe('broad');
    expect(profile.budget).toBe(10000);
  });

  it('exposes the v2 wire fields without legacy retrieval knobs', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    const client = new Client({ name: 'v2-contract-test', version: '1.0.0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      const store = tools.tools.find(tool => tool.name === 'memory_store');
      const recall = tools.tools.find(tool => tool.name === 'memory_recall');
      expect(store?.inputSchema.required).toEqual(['content']);
      expect(Object.keys(store?.inputSchema.properties || {})).toEqual(['content', 'tags', 'importance', 'space']);
      expect(recall?.inputSchema.required).toEqual(['query']);
      expect(Object.keys(recall?.inputSchema.properties || {})).toEqual(['query', 'budget', 'space']);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
