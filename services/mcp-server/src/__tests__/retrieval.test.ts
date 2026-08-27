process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('../db/client.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

vi.mock('../db/queries-graph.js', () => ({
  getPinnedFacts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../db/queries-analysis.js', () => ({
  searchAtomicMemories: vi.fn().mockResolvedValue([
    {
      id: 1,
      memory_id: 'mem_1',
      memory_type: 'preference',
      content: 'User prefers TypeScript',
      compressed_content: 'Prefers TypeScript',
      confidence: 0.9,
      success_score: 0.8,
      failure_score: 0.1,
      transferability: 0.85,
      valid_from: new Date(),
      share_policy: 'private',
    },
    {
      id: 2,
      memory_id: 'mem_2',
      memory_type: 'fact',
      content: 'API uses JWT for authentication',
      compressed_content: 'JWT auth',
      confidence: 0.85,
      success_score: 0.7,
      failure_score: 0.2,
      transferability: 0.7,
      valid_from: new Date(),
      share_policy: 'private',
    },
  ]),
  searchAtomicMemoriesByVector: vi.fn().mockResolvedValue([]),
  searchRecipes: vi.fn().mockResolvedValue([
    {
      id: 1,
      recipe_id: 'rec_1',
      recipe_name: 'JWT Authentication',
      task_type: 'authentication',
      problem_statement: 'Implement JWT auth',
      recipe_content: {
        approach: [{ step: 1, action: 'Install packages' }],
        doList: ['Use httpOnly cookies'],
        dontList: ['Store in localStorage'],
      },
      success_rate: 0.85,
      usage_count: 10,
      positive_feedback: 8,
      negative_feedback: 1,
      avg_token_cost: 500,
      transferability_score: 0.8,
    },
  ]),
  searchRecipesByVector: vi.fn().mockResolvedValue([]),
  searchEntities: vi.fn().mockResolvedValue([
    {
      entity_id: 'ent_1',
      name: 'JWT',
      entity_type: 'technology',
      description: 'JSON Web Token for authentication',
      mention_count: 5,
    },
  ]),
  getEntityRelationships: vi.fn().mockResolvedValue([
    {
      relationship_type: 'uses',
      target_entity_id: 'Express',
    },
  ]),
  getEntityRelationshipsBatch: vi.fn().mockResolvedValue([
    {
      source_entity_id: 'ent_1',
      target_entity_id: 'Express',
      relationship_type: 'uses',
      strength: 0.8,
    },
  ]),
}));

import {
  verifyMemorySet,
  assessHallucinationRisk,
  filterByVerificationThreshold,
  getResponseWarnings,
  suggestVerificationSteps,
} from '../retrieval/anti-hallucination.js';

import { buildMemoryPacket, formatPacketForPrompt } from '../retrieval/packet-builder.js';

describe('Anti-Hallucination System', () => {
  const mockMemories = [
    {
      id: 1,
      memory_id: 'mem_1',
      memory_type: 'fact',
      content: 'API uses REST',
      compressed_content: 'REST API',
      confidence: 0.9,
      success_score: 0.8,
      failure_score: 0.1,
      transferability: 0.85,
      valid_from: new Date(),
      valid_to: null,
      share_policy: 'private',
      user_id: 1,
      episode_id: null,
      workspace_id: null,
      agent_id: null,
      task_id: null,
      event_time: null,
      supersedes_memory_id: null,
      source_span_start: 0,
      source_span_end: 0,
      graph_links: [],
      expiry: null,
      embedding: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  describe('Memory Verification', () => {
    it('should verify memory set', () => {
      const verified = verifyMemorySet(mockMemories as any);

      expect(verified).toBeDefined();
      expect(Array.isArray(verified)).toBe(true);
      expect(verified.length).toBe(mockMemories.length);
    });

    it('should include verification scores', () => {
      const verified = verifyMemorySet(mockMemories as any);

      for (const v of verified) {
        expect(v.verificationScore).toBeGreaterThanOrEqual(0);
        expect(v.verificationScore).toBeLessThanOrEqual(1);
      }
    });

    it('should filter by threshold', () => {
      const verified = verifyMemorySet(mockMemories as any);
      const filtered = filterByVerificationThreshold(verified, 0.5);

      expect(filtered.length).toBeLessThanOrEqual(verified.length);
    });
  });

  describe('Hallucination Risk Assessment', () => {
    it('should assess risk level', () => {
      const risk = assessHallucinationRisk(
        'How do I implement auth?',
        mockMemories as any,
        [],
        []
      );

      expect(risk).toBeDefined();
      expect(risk.level).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(risk.level);
    });

    it('should include risk factors', () => {
      const risk = assessHallucinationRisk(
        'How do I implement auth?',
        mockMemories as any,
        [],
        []
      );

      expect(risk.factors).toBeDefined();
      expect(Array.isArray(risk.factors)).toBe(true);
    });
  });

  describe('Warning Generation', () => {
    it('should generate warnings for low confidence', () => {
      const lowConfMemories = [{
        ...mockMemories[0],
        confidence: 0.3,
      }];

      const verified = verifyMemorySet(lowConfMemories as any);
      const risk = assessHallucinationRisk('test', lowConfMemories as any, [], []);
      const warnings = getResponseWarnings(verified, risk);

      expect(warnings).toBeDefined();
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('should suggest verification steps', () => {
      const verified = verifyMemorySet(mockMemories as any);
      const risk = assessHallucinationRisk('test', mockMemories as any, [], []);
      const steps = suggestVerificationSteps(risk, verified);

      expect(steps).toBeDefined();
      expect(Array.isArray(steps)).toBe(true);
    });
  });
});

describe('Packet Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Memory Packet Construction', () => {
    it('should build memory packet', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'How do I implement authentication?',
        tokenBudget: 1000,
      });

      expect(packet).toBeDefined();
      expect(packet.packetId).toBeDefined();
      expect(packet.generatedAt).toBeDefined();
    });

    it('should include user preferences', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'How do I implement authentication?',
        includePreferences: true,
      });

      expect(packet.userPreferences).toBeDefined();
      expect(Array.isArray(packet.userPreferences)).toBe(true);
    });

    it('should include prior recipe when available', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'How do I implement authentication?',
        includeRecipes: true,
      });

      expect(packet.priorSuccessfulRecipe).toBeDefined();
    });

    it('should respect token budget', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
        tokenBudget: 500,
      });

      expect(packet.tokenUsage.total).toBeLessThanOrEqual(packet.tokenUsage.budget);
    });

    it('should include hallucination risk assessment', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
      });

      expect(packet.hallucinationRisk).toBeDefined();
      expect(packet.hallucinationRisk.level).toBeDefined();
    });

    it('should include linked sources', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
      });

      expect(packet.linkedSources).toBeDefined();
      expect(Array.isArray(packet.linkedSources)).toBe(true);
    });
  });

  describe('Packet Formatting', () => {
    it('should format packet for prompt injection', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
      });

      const formatted = formatPacketForPrompt(packet);

      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('<memory_context>');
      expect(formatted).toContain('</memory_context>');
    });

    it('should include preferences section when present', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
        includePreferences: true,
      });

      const formatted = formatPacketForPrompt(packet);

      if (packet.userPreferences.length > 0) {
        expect(formatted).toContain('<preferences>');
      }
    });

    it('should include recipe section when present', async () => {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
        includeRecipes: true,
      });

      const formatted = formatPacketForPrompt(packet);

      if (packet.priorSuccessfulRecipe) {
        expect(formatted).toContain('<prior_recipe>');
      }
    });
  });
});

describe('Token Accounting', () => {
  it('should track token usage by section', async () => {
    const packet = await buildMemoryPacket({
      userId: 1,
      query: 'How do I implement authentication?',
      tokenBudget: 2000,
    });

    expect(packet.tokenUsage).toBeDefined();
    expect(packet.tokenUsage.bySection).toBeDefined();
    expect(typeof packet.tokenUsage.total).toBe('number');
  });

  it('should not exceed budget', async () => {
    const budgets = [500, 1000, 2000];

    for (const budget of budgets) {
      const packet = await buildMemoryPacket({
        userId: 1,
        query: 'test query',
        tokenBudget: budget,
      });

      expect(packet.tokenUsage.total).toBeLessThanOrEqual(budget);
    }
  });
});
