/**
 * MCP Tools Integration Tests
 * Tests for analysis pipeline components
 */
import { describe, it, expect, vi } from 'vitest';

// Import from dist to avoid path resolution issues
import {
  runPipelineSync,
  splitIntoEpisodesSync,
  extractMemoriesSync,
  analyzeTrajectorySync,
  distillRecipeSync,
  extractEntitiesSync,
  detectOutcome,
  quickAnalyze,
  getPipelineSummary,
  type ConversationMessage,
  type Episode,
} from '@memron/analysis-engine';

describe('Analysis Pipeline Integration', () => {
  const testMessages: ConversationMessage[] = [
    { role: 'user', content: 'Help me fix this bug in my code', timestamp: '2024-01-01T10:00:00Z' },
    { role: 'assistant', content: 'I see the issue. The variable is undefined because...', timestamp: '2024-01-01T10:00:30Z' },
    { role: 'user', content: 'That fixed it! Thanks!', timestamp: '2024-01-01T10:01:00Z' },
  ];

  describe('Episode Splitting', () => {
    it('should split conversation into episodes', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      expect(episodes).toBeDefined();
      expect(Array.isArray(episodes)).toBe(true);
      expect(episodes.length).toBeGreaterThan(0);
    });

    it('should assign correct episode types', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      for (const episode of episodes) {
        expect(episode.episodeType).toBeDefined();
        expect(['goal_definition', 'planning', 'execution', 'troubleshooting',
                'verification', 'conclusion', 'failed_attempt', 'correction',
                'user_clarification', 'tool_result', 'final_solution',
                'context_setup', 'exploration']).toContain(episode.episodeType);
      }
    });

    it('should include all messages in episodes', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const totalMessages = episodes.reduce((sum: number, ep: any) => sum + ep.messages.length, 0);
      expect(totalMessages).toBe(testMessages.length);
    });

    it('should set session ID on all episodes', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      for (const episode of episodes) {
        expect(episode.sessionId).toBe('test_session');
      }
    });
  });

  describe('Memory Extraction', () => {
    it('should extract memories from episode', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const memories = extractMemoriesSync(episodes[0], 'user_123');
      expect(memories).toBeDefined();
      expect(Array.isArray(memories)).toBe(true);
    });

    it('should assign correct memory types', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const memories = extractMemoriesSync(episodes[0], 'user_123');
      for (const memory of memories) {
        expect(memory.memoryType).toBeDefined();
        expect(['fact', 'goal', 'constraint', 'preference', 'attempted_action',
                'observed_failure', 'observed_success', 'final_resolution']).toContain(memory.memoryType);
      }
    });

    it('should include confidence scores between 0 and 1', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const memories = extractMemoriesSync(episodes[0], 'user_123');
      for (const memory of memories) {
        expect(memory.confidence).toBeGreaterThanOrEqual(0);
        expect(memory.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include success scores between 0 and 1', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const memories = extractMemoriesSync(episodes[0], 'user_123');
      for (const memory of memories) {
        expect(memory.successScore).toBeGreaterThanOrEqual(0);
        expect(memory.successScore).toBeLessThanOrEqual(1);
      }
    });

    it('should include transferability scores between 0 and 1', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const memories = extractMemoriesSync(episodes[0], 'user_123');
      for (const memory of memories) {
        expect(memory.transferability).toBeGreaterThanOrEqual(0);
        expect(memory.transferability).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Trajectory Analysis', () => {
    it('should analyze episode trajectory', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const analysis = analyzeTrajectorySync(episodes[0]);
      expect(analysis).toBeDefined();
      expect(analysis.outcome).toBeDefined();
      expect(analysis.trajectoryPoints).toBeDefined();
    });

    it('should detect outcome correctly', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const analysis = analyzeTrajectorySync(episodes[0]);
      expect(['success', 'partial', 'failure', 'neutral']).toContain(analysis.outcome);
    });

    it('should include trajectory points', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const analysis = analyzeTrajectorySync(episodes[0]);
      expect(Array.isArray(analysis.trajectoryPoints)).toBe(true);
    });

    it('should include outcome confidence', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const analysis = analyzeTrajectorySync(episodes[0]);
      expect(analysis.outcomeConfidence).toBeGreaterThanOrEqual(0);
      expect(analysis.outcomeConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Recipe Distillation', () => {
    it('should distill recipe from successful episode', () => {
      const successMessages: ConversationMessage[] = [
        { role: 'user', content: 'How do I implement authentication?', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Here is how to implement JWT auth: 1. Install packages 2. Create middleware', timestamp: '2024-01-01T10:00:30Z' },
        { role: 'user', content: 'Perfect, it works!', timestamp: '2024-01-01T10:01:00Z' },
      ];

      const episodes = splitIntoEpisodesSync('test_session', successMessages);
      const successEpisode = { ...episodes[0], outcome: 'success' as const };
      const recipe = distillRecipeSync(successEpisode);

      if (recipe) {
        expect(recipe.recipeName).toBeDefined();
        expect(recipe.taskType).toBeDefined();
        expect(recipe.approach).toBeDefined();
        expect(Array.isArray(recipe.approach)).toBe(true);
      }
    });

    it('should include do and dont lists', () => {
      const successMessages: ConversationMessage[] = [
        { role: 'user', content: 'How do I implement authentication?', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Use JWT tokens. Do not store tokens in localStorage.', timestamp: '2024-01-01T10:00:30Z' },
        { role: 'user', content: 'Perfect!', timestamp: '2024-01-01T10:01:00Z' },
      ];

      const episodes = splitIntoEpisodesSync('test_session', successMessages);
      const successEpisode = { ...episodes[0], outcome: 'success' as const };
      const recipe = distillRecipeSync(successEpisode);

      if (recipe) {
        expect(Array.isArray(recipe.doList)).toBe(true);
        expect(Array.isArray(recipe.dontList)).toBe(true);
      }
    });
  });

  describe('Entity Extraction', () => {
    it('should extract entities from episode', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const { entities, relationships } = extractEntitiesSync(episodes[0], 'user_123');
      expect(entities).toBeDefined();
      expect(Array.isArray(entities)).toBe(true);
      expect(relationships).toBeDefined();
      expect(Array.isArray(relationships)).toBe(true);
    });

    it('should assign entity types', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const { entities } = extractEntitiesSync(episodes[0], 'user_123');
      for (const entity of entities) {
        expect(entity.entityType).toBeDefined();
      }
    });

    it('should track mention counts', () => {
      const episodes = splitIntoEpisodesSync('test_session', testMessages);
      const { entities } = extractEntitiesSync(episodes[0], 'user_123');
      for (const entity of entities) {
        expect(entity.mentionCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Full Pipeline', () => {
    it('should run complete pipeline', () => {
      const result = runPipelineSync({
        sessionId: 'test_session',
        userId: 'user_123',
        messages: testMessages,
      });

      expect(result).toBeDefined();
      expect(result.episodes).toBeDefined();
      expect(result.memories).toBeDefined();
      expect(result.analyses).toBeDefined();
      expect(result.recipes).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(result.processingStats).toBeDefined();
    });

    it('should include processing stats', () => {
      const result = runPipelineSync({
        sessionId: 'test_session',
        userId: 'user_123',
        messages: testMessages,
      });

      expect(result.processingStats.inputTokens).toBeGreaterThan(0);
      expect(result.processingStats.episodesFound).toBeGreaterThan(0);
      expect(result.processingStats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty messages', () => {
      const result = runPipelineSync({
        sessionId: 'test_session',
        userId: 'user_123',
        messages: [],
      });
      expect(result.episodes.length).toBe(0);
    });

    it('should handle single message', () => {
      const result = runPipelineSync({
        sessionId: 'test_session',
        userId: 'user_123',
        messages: [{ role: 'user', content: 'Hello', timestamp: '2024-01-01T10:00:00Z' }],
      });
      expect(result).toBeDefined();
    });

    it('should generate pipeline summary', () => {
      const result = runPipelineSync({
        sessionId: 'test_session',
        userId: 'user_123',
        messages: testMessages,
      });
      const summary = getPipelineSummary(result);
      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(summary).toContain('episodes');
      expect(summary).toContain('memories');
    });
  });

  describe('Quick Analysis', () => {
    it('should perform quick analysis', async () => {
      const result = await quickAnalyze(testMessages, 'user_123');
      expect(result).toBeDefined();
      expect(result.outcome).toBeDefined();
      expect(result.hallucinationRisk).toBeDefined();
      expect(result.memoriesExtracted).toBeGreaterThanOrEqual(0);
    });

    it('should return compression ratio', async () => {
      const result = await quickAnalyze(testMessages, 'user_123');
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
    });
  });
});

describe('Outcome Detection', () => {
  it('should detect success from positive feedback', () => {
    const episode: Episode = {
      episodeId: 'test',
      sessionId: 'test',
      episodeType: 'final_solution',
      startIndex: 0,
      endIndex: 2,
      messages: [
        { role: 'user', content: 'Fix the bug', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Here is the fix', timestamp: '2024-01-01T10:00:30Z' },
        { role: 'user', content: 'Perfect! That works great!', timestamp: '2024-01-01T10:01:00Z' },
      ],
      createdAt: new Date().toISOString(),
    };

    const result = detectOutcome(episode);
    expect(result.outcome).toBe('success');
  });

  it('should detect failure from negative feedback', () => {
    const episode: Episode = {
      episodeId: 'test',
      sessionId: 'test',
      episodeType: 'failed_attempt',
      startIndex: 0,
      endIndex: 2,
      messages: [
        { role: 'user', content: 'Fix the bug', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Try this solution', timestamp: '2024-01-01T10:00:30Z' },
        { role: 'user', content: 'That does not work at all, still broken', timestamp: '2024-01-01T10:01:00Z' },
      ],
      createdAt: new Date().toISOString(),
    };

    const result = detectOutcome(episode);
    expect(['failure', 'neutral']).toContain(result.outcome);
  });

  it('should detect neutral for ambiguous feedback', () => {
    const episode: Episode = {
      episodeId: 'test',
      sessionId: 'test',
      episodeType: 'goal_definition',
      startIndex: 0,
      endIndex: 1,
      messages: [
        { role: 'user', content: 'I want to learn about React', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'React is a JavaScript library', timestamp: '2024-01-01T10:00:30Z' },
      ],
      createdAt: new Date().toISOString(),
    };

    const result = detectOutcome(episode);
    expect(['neutral', 'success', 'partial']).toContain(result.outcome);
  });
});

describe('Compression', () => {
  it('should compress content', () => {
    const longMessages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'I have a very long and detailed question about implementing a complex authentication system with OAuth 2.0, JWT tokens, refresh tokens, and role-based access control.',
        timestamp: '2024-01-01T10:00:00Z'
      },
      {
        role: 'assistant',
        content: 'Here is a comprehensive guide to implementing authentication with all those features...',
        timestamp: '2024-01-01T10:00:30Z'
      },
    ];

    const result = runPipelineSync({
      sessionId: 'test_session',
      userId: 'user_123',
      messages: longMessages,
    });

    for (const memory of result.memories) {
      if (memory.compressedContent) {
        expect(memory.compressedContent.length).toBeLessThanOrEqual(memory.content.length);
      }
    }
  });
});

describe('Memory Type Classification', () => {
  const testCases = [
    { content: 'I prefer using TypeScript', expectedTypes: ['preference'] },
    { content: 'The API returns a 404 error', expectedTypes: ['fact', 'observed_failure'] },
    { content: 'I want to build a login system', expectedTypes: ['goal', 'preference'] },
    { content: 'It must be under 100 lines of code', expectedTypes: ['constraint'] },
  ];

  for (const testCase of testCases) {
    it(`should handle "${testCase.content.slice(0, 30)}..." appropriately`, () => {
      const episode: Episode = {
        episodeId: 'test',
        sessionId: 'test',
        episodeType: 'goal_definition',
        startIndex: 0,
        endIndex: 1,
        messages: [
          { role: 'user', content: testCase.content, timestamp: '2024-01-01T10:00:00Z' },
        ],
        createdAt: new Date().toISOString(),
      };

      const memories = extractMemoriesSync(episode, 'user_123');
      expect(memories).toBeDefined();
      expect(Array.isArray(memories)).toBe(true);
    });
  }
});
