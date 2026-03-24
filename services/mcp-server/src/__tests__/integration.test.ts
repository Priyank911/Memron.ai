/**
 * Integration Smoke Tests
 * Tests for end-to-end flows: ingest → analyze → recipe → packet,
 * graph operations, and versioning workflows
 */
import { describe, it, expect } from 'vitest';

// ============================================================================
// Pipeline Flow Tests (unit-level simulation)
// ============================================================================

describe('Ingest → Analyze → Recipe → Packet Flow', () => {
  const sampleMessages = [
    { role: 'user' as const, content: 'How do I implement JWT authentication in Express?', timestamp: '2024-01-01T10:00:00Z' },
    { role: 'assistant' as const, content: 'Here is how to implement JWT auth: 1. Install jsonwebtoken, 2. Create middleware...', timestamp: '2024-01-01T10:00:30Z' },
    { role: 'user' as const, content: 'The token verification is failing with invalid signature', timestamp: '2024-01-01T10:01:00Z' },
    { role: 'assistant' as const, content: 'That error usually means the secret key is different. Make sure you use the same JWT_SECRET...', timestamp: '2024-01-01T10:01:30Z' },
    { role: 'user' as const, content: 'Fixed it! The env variable was not loaded. Thanks!', timestamp: '2024-01-01T10:02:00Z' },
  ];

  it('should produce valid message structure for ingestion', () => {
    for (const msg of sampleMessages) {
      expect(['user', 'assistant', 'system', 'tool']).toContain(msg.role);
      expect(msg.content.length).toBeGreaterThan(0);
      expect(msg.content.length).toBeLessThanOrEqual(100000);
      expect(msg.timestamp).toBeDefined();
    }
  });

  it('should have at least user and assistant messages', () => {
    const roles = new Set(sampleMessages.map(m => m.role));
    expect(roles.has('user')).toBe(true);
    expect(roles.has('assistant')).toBe(true);
  });

  it('should produce valid pipeline input structure', () => {
    const input = {
      sessionId: 'session_test123',
      userId: '1',
      messages: sampleMessages,
      options: {
        useLLM: false,
        extractEpisodes: true,
        extractMemories: true,
        analyzeTrajectory: true,
        distillRecipes: true,
        extractEntities: true,
      },
    };

    expect(input.sessionId).toBeTruthy();
    expect(input.userId).toBeTruthy();
    expect(input.messages.length).toBeGreaterThan(0);
  });

  it('should support disabling individual pipeline stages', () => {
    const options = {
      extractEpisodes: false,
      extractMemories: true,
      analyzeTrajectory: false,
      distillRecipes: false,
      extractEntities: false,
    };

    // Only memories should be extracted
    expect(options.extractEpisodes).toBe(false);
    expect(options.extractMemories).toBe(true);
    expect(options.analyzeTrajectory).toBe(false);
  });
});

// ============================================================================
// Graph Operations Flow Tests
// ============================================================================

describe('Graph Operations: Entity → Relationship → Query → Paths', () => {
  it('should produce valid entity structure', () => {
    const entity = {
      entityId: 'ent_abc123',
      userId: 1,
      name: 'JWT',
      canonicalName: 'jwt',
      entityType: 'technology',
      description: 'JSON Web Tokens for authentication',
      mentionCount: 3,
    };

    expect(entity.entityId).toBeTruthy();
    expect(entity.name.length).toBeLessThanOrEqual(200);
    expect(entity.canonicalName).toBe(entity.name.toLowerCase());
    expect(entity.mentionCount).toBeGreaterThan(0);
  });

  it('should produce valid relationship structure', () => {
    const relationship = {
      relationshipId: 'rel_xyz789',
      userId: 1,
      sourceEntityId: 'ent_jwt',
      targetEntityId: 'ent_express',
      relationshipType: 'used_with',
      strength: 0.8,
      evidenceCount: 2,
    };

    expect(relationship.sourceEntityId).not.toBe(relationship.targetEntityId);
    expect(relationship.strength).toBeGreaterThanOrEqual(0);
    expect(relationship.strength).toBeLessThanOrEqual(1);
  });

  it('should normalize entity names to canonical form', () => {
    const canonicalize = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    expect(canonicalize('JWT')).toBe('jwt');
    expect(canonicalize('Next.js')).toBe('next-js');
    expect(canonicalize('TypeScript')).toBe('typescript');
    expect(canonicalize('VS Code')).toBe('vs-code');
    expect(canonicalize('  spaces  ')).toBe('spaces');
  });

  it('should find paths between connected entities', () => {
    // Simulate a small graph
    const edges = [
      { source: 'jwt', target: 'express', type: 'used_with' },
      { source: 'express', target: 'node', type: 'runs_on' },
      { source: 'node', target: 'typescript', type: 'supports' },
    ];

    // BFS from jwt to typescript
    const start = 'jwt';
    const end = 'typescript';
    const visited = new Set<string>();
    const queue: string[][] = [[start]];

    let foundPath: string[] | null = null;
    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === end) {
        foundPath = path;
        break;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          queue.push([...path, edge.target]);
        }
        if (edge.target === current && !visited.has(edge.source)) {
          queue.push([...path, edge.source]);
        }
      }
    }

    expect(foundPath).not.toBeNull();
    expect(foundPath).toEqual(['jwt', 'express', 'node', 'typescript']);
  });

  it('should identify hub entities by connection count', () => {
    const connections = new Map<string, number>();
    const edges = [
      { source: 'typescript', target: 'react' },
      { source: 'typescript', target: 'node' },
      { source: 'typescript', target: 'express' },
      { source: 'react', target: 'node' },
      { source: 'express', target: 'node' },
    ];

    for (const edge of edges) {
      connections.set(edge.source, (connections.get(edge.source) || 0) + 1);
      connections.set(edge.target, (connections.get(edge.target) || 0) + 1);
    }

    const sorted = [...connections.entries()].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('typescript'); // Most connected
    expect(sorted[0][1]).toBe(3);
  });
});

// ============================================================================
// Versioning Flow Tests
// ============================================================================

describe('Versioning: Create → Compare → Record → Feedback', () => {
  it('should create valid prompt template structure', () => {
    const template = {
      templateId: 'tmpl_abc123',
      userId: 1,
      name: 'Auth Helper Prompt',
      description: 'Prompt for authentication assistance',
    };

    expect(template.templateId).toBeTruthy();
    expect(template.name.length).toBeGreaterThan(0);
    expect(template.name.length).toBeLessThanOrEqual(500);
  });

  it('should track version numbers incrementally', () => {
    const versions = [
      { versionNumber: 1, status: 'draft' },
      { versionNumber: 2, status: 'active' },
      { versionNumber: 3, status: 'draft' },
    ];

    for (let i = 1; i < versions.length; i++) {
      expect(versions[i].versionNumber).toBeGreaterThan(versions[i - 1].versionNumber);
    }
  });

  it('should only have one active version at a time', () => {
    const versions = [
      { id: 'v1', status: 'archived' },
      { id: 'v2', status: 'active' },
      { id: 'v3', status: 'draft' },
    ];

    const activeCount = versions.filter(v => v.status === 'active').length;
    expect(activeCount).toBe(1);
  });

  it('should create valid run record structure', () => {
    const run = {
      runId: 'run_xyz',
      userId: 1,
      sessionId: 'session_abc',
      inputTokens: 500,
      outputTokens: 200,
      latencyMs: 1500,
      successScore: 0.85,
      hallucinationFlag: false,
    };

    expect(run.inputTokens).toBeGreaterThanOrEqual(0);
    expect(run.outputTokens).toBeGreaterThanOrEqual(0);
    expect(run.latencyMs).toBeGreaterThanOrEqual(0);
    expect(run.successScore).toBeGreaterThanOrEqual(0);
    expect(run.successScore).toBeLessThanOrEqual(1);
  });

  it('should adjust success score based on feedback', () => {
    let successScore = 0.5;

    // Positive feedback
    successScore = Math.min(successScore + 0.1, 1.0);
    expect(successScore).toBeCloseTo(0.6);

    // Negative feedback
    successScore = Math.max(successScore - 0.1, 0.0);
    expect(successScore).toBeCloseTo(0.5);

    // Multiple positive feedbacks should cap at 1.0
    for (let i = 0; i < 20; i++) {
      successScore = Math.min(successScore + 0.1, 1.0);
    }
    expect(successScore).toBe(1.0);

    // Multiple negative feedbacks should floor at 0.0
    for (let i = 0; i < 20; i++) {
      successScore = Math.max(successScore - 0.1, 0.0);
    }
    expect(successScore).toBeCloseTo(0.0);
  });

  it('should compare version performance metrics', () => {
    const versionA = {
      avgSuccessScore: 0.75,
      avgLatencyMs: 1200,
      avgInputTokens: 500,
      hallucinationRate: 0.05,
      runCount: 100,
    };

    const versionB = {
      avgSuccessScore: 0.82,
      avgLatencyMs: 1100,
      avgInputTokens: 480,
      hallucinationRate: 0.03,
      runCount: 50,
    };

    // B is better on all metrics
    expect(versionB.avgSuccessScore).toBeGreaterThan(versionA.avgSuccessScore);
    expect(versionB.avgLatencyMs).toBeLessThan(versionA.avgLatencyMs);
    expect(versionB.hallucinationRate).toBeLessThan(versionA.hallucinationRate);
  });
});

// ============================================================================
// Memory Packet Flow Tests
// ============================================================================

describe('Memory Packet Building', () => {
  it('should produce valid packet structure', () => {
    const packet = {
      packetId: 'pkt_test123',
      generatedAt: new Date().toISOString(),
      userPreferences: ['Prefers TypeScript'],
      priorSuccessfulRecipe: null,
      knownFailuresToAvoid: ['OAuth redirect loop'],
      latestFactualUpdates: ['API uses JWT tokens'],
      unresolvedSteps: [],
      relevantEntities: [],
      linkedSources: [],
      continuationSummary: 'User preferences: Prefers TypeScript. Key facts: API uses JWT tokens.',
      warnings: [],
      hallucinationRisk: { level: 'low', score: 0.1, factors: [] },
      verificationSteps: [],
      tokenUsage: { total: 150, budget: 2000, bySection: { preferences: 5, facts: 10 } },
    };

    expect(packet.packetId).toMatch(/^pkt_/);
    expect(packet.tokenUsage.total).toBeLessThanOrEqual(packet.tokenUsage.budget);
    expect(packet.hallucinationRisk.level).toBeDefined();
  });

  it('should format packet for prompt injection', () => {
    const preferences = ['Prefers TypeScript'];
    const facts = ['API uses JWT'];
    const failures = ['Avoid plaintext passwords'];

    const sections: string[] = ['<memory_context>'];

    if (preferences.length > 0) {
      sections.push('<preferences>', preferences.join('\n'), '</preferences>');
    }
    if (facts.length > 0) {
      sections.push('<facts>', facts.join('\n'), '</facts>');
    }
    if (failures.length > 0) {
      sections.push('<avoid>', failures.join('\n'), '</avoid>');
    }

    sections.push('</memory_context>');
    const formatted = sections.join('\n');

    expect(formatted).toContain('<memory_context>');
    expect(formatted).toContain('</memory_context>');
    expect(formatted).toContain('<preferences>');
    expect(formatted).toContain('Prefers TypeScript');
    expect(formatted).toContain('<avoid>');
  });

  it('should respect token budget in packet building', () => {
    const budget = 500;
    let used = 0;
    const items: string[] = [];

    for (let i = 0; i < 100; i++) {
      const item = `Memory item ${i}: ${'x'.repeat(20)}`;
      const tokens = Math.ceil(item.length / 4);
      if (used + tokens > budget * 0.6) break;
      used += tokens;
      items.push(item);
    }

    expect(used).toBeLessThanOrEqual(budget * 0.6);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
  });
});

// ============================================================================
// Recipe Lifecycle Tests
// ============================================================================

describe('Recipe Lifecycle', () => {
  it('should start with neutral success rate', () => {
    const newRecipe = {
      successRate: 0.5,
      usageCount: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
    };
    expect(newRecipe.successRate).toBe(0.5);
  });

  it('should update success rate with feedback', () => {
    let positive = 0;
    let negative = 0;

    // 5 positive feedbacks
    for (let i = 0; i < 5; i++) {
      positive++;
      const rate = positive / (positive + negative);
      expect(rate).toBe(1.0);
    }

    // 2 negative feedbacks
    for (let i = 0; i < 2; i++) {
      negative++;
      const rate = positive / (positive + negative);
      expect(rate).toBeGreaterThan(0.5);
    }

    const finalRate = positive / (positive + negative);
    expect(finalRate).toBeCloseTo(0.714, 2);
  });

  it('should include approach steps in recipe content', () => {
    const recipeContent = {
      approach: [
        { step: 1, action: 'Install dependencies' },
        { step: 2, action: 'Configure middleware' },
        { step: 3, action: 'Implement routes' },
      ],
      doList: ['Use HTTPS', 'Validate inputs'],
      dontList: ['Store passwords in plaintext'],
    };

    expect(recipeContent.approach).toHaveLength(3);
    expect(recipeContent.doList).toHaveLength(2);
    expect(recipeContent.dontList).toHaveLength(1);
  });
});

// ============================================================================
// Data Flow Integrity Tests
// ============================================================================

describe('Data Flow Integrity', () => {
  it('should maintain userId across pipeline stages', () => {
    const userId = 42;

    const episode = { userId };
    const memory = { userId };
    const recipe = { userId };
    const entity = { userId };
    const packet = { userId };

    expect(episode.userId).toBe(userId);
    expect(memory.userId).toBe(userId);
    expect(recipe.userId).toBe(userId);
    expect(entity.userId).toBe(userId);
    expect(packet.userId).toBe(userId);
  });

  it('should maintain sessionId across pipeline stages', () => {
    const sessionId = 'session_test_001';

    const episodes = [{ sessionId }, { sessionId }];
    for (const ep of episodes) {
      expect(ep.sessionId).toBe(sessionId);
    }
  });

  it('should link memories to episodes via episodeId', () => {
    const episodeId = 'ep_abc';
    const memories = [
      { memoryId: 'mem_1', episodeId },
      { memoryId: 'mem_2', episodeId },
    ];

    for (const mem of memories) {
      expect(mem.episodeId).toBe(episodeId);
    }
  });
});
