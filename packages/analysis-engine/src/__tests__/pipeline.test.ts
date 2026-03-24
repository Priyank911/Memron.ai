/**
 * Pipeline Tests
 */

import { describe, it, expect } from 'vitest';
import {
  runPipelineSync,
  quickAnalyze,
  getPipelineSummary,
} from '../pipeline';
import type { ConversationMessage, AnalysisPipelineInput } from '../types';

describe('Analysis Pipeline', () => {
  const createInput = (messages: ConversationMessage[]): AnalysisPipelineInput => ({
    sessionId: 'test_session',
    userId: 'test_user',
    messages,
  });

  describe('runPipelineSync', () => {
    it('should run the full pipeline synchronously', () => {
      const input = createInput([
        { role: 'user', content: 'Help me build a login system', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sure, let me help with authentication', timestamp: new Date().toISOString() },
        { role: 'user', content: 'I prefer using JWT tokens', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'JWT is a good choice for stateless auth', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Perfect, this works great!', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Glad I could help!', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.sessionId).toBe('test_session');
      expect(result.episodes.length).toBeGreaterThan(0);
      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.processingStats).toBeDefined();
    });

    it('should extract episodes', () => {
      const input = createInput([
        { role: 'user', content: 'What is TypeScript?', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.episodes.length).toBeGreaterThan(0);
      expect(result.episodes[0].sessionId).toBe('test_session');
    });

    it('should extract memories', () => {
      const input = createInput([
        { role: 'user', content: 'I always want to use strict mode', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Noted, strict mode will be enabled', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('should analyze trajectories', () => {
      const input = createInput([
        { role: 'user', content: 'Fix this bug', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Looking at the issue', timestamp: new Date().toISOString() },
        { role: 'user', content: 'That fixed it!', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.analyses.length).toBeGreaterThan(0);
    });

    it('should distill recipes from successful episodes', () => {
      const input = createInput([
        { role: 'user', content: 'How do I sort an array?', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Use Array.sort() method', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Perfect, that works!', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Great!', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      // Recipes are distilled from successful episodes
      expect(result.recipes).toBeDefined();
      expect(Array.isArray(result.recipes)).toBe(true);
    });

    it('should extract entities', () => {
      const input = createInput([
        { role: 'user', content: 'I am using React and TypeScript', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Great stack choice!', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should handle options to skip steps', () => {
      const input: AnalysisPipelineInput = {
        sessionId: 'test',
        userId: 'user',
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        ],
        options: {
          extractMemories: false,
          extractEntities: false,
          distillRecipes: false,
        },
      };

      const result = runPipelineSync(input);

      expect(result.memories.length).toBe(0);
      expect(result.entities.length).toBe(0);
      expect(result.recipes.length).toBe(0);
    });

    it('should handle empty messages', () => {
      const input = createInput([]);
      const result = runPipelineSync(input);

      expect(result.episodes.length).toBe(0);
      expect(result.memories.length).toBe(0);
    });

    it('should track processing stats', () => {
      const input = createInput([
        { role: 'user', content: 'Test message', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Response', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);

      expect(result.processingStats.inputTokens).toBeGreaterThan(0);
      expect(result.processingStats.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingStats.episodesFound).toBeGreaterThan(0);
    });
  });

  describe('quickAnalyze', () => {
    it('should perform quick analysis', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Help me with this', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sure thing', timestamp: new Date().toISOString() },
        { role: 'user', content: 'That worked!', timestamp: new Date().toISOString() },
      ];

      const result = await quickAnalyze(messages, 'user_1');

      expect(result.outcome).toBeDefined();
      expect(result.hallucinationRisk).toBeDefined();
      expect(result.memoriesExtracted).toBeGreaterThanOrEqual(0);
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
    });

    it('should detect outcome correctly', async () => {
      const successMessages: ConversationMessage[] = [
        { role: 'user', content: 'Perfect, exactly what I needed!', timestamp: new Date().toISOString() },
      ];

      const result = await quickAnalyze(successMessages, 'user_1');

      expect(result.outcome).toBe('success');
    });
  });

  describe('getPipelineSummary', () => {
    it('should generate a readable summary', () => {
      const input = createInput([
        { role: 'user', content: 'Test', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Response', timestamp: new Date().toISOString() },
      ]);

      const result = runPipelineSync(input);
      const summary = getPipelineSummary(result);

      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
      expect(summary).toContain('episodes');
      expect(summary).toContain('memories');
    });
  });
});
