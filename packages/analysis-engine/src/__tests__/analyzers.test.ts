/**
 * Analyzer Tests
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeTrajectorySync,
  findWinningBranch,
  getTrajectorySimpleSummary,
} from '../analyzers/trajectory-analyzer';
import {
  detectOutcome,
  detectOutcomeFromMessages,
  getFinalUserSentiment,
  isSuccessfulConversation,
  getOutcomeExplanation,
} from '../analyzers/outcome-detector';
import {
  detectHallucinationsSync,
  getHallucinationSummary,
  needsVerification,
} from '../analyzers/hallucination-detector';
import type { ConversationMessage, Episode } from '../types';

const createEpisode = (
  messages: ConversationMessage[],
  outcome: Episode['outcome'] = 'neutral'
): Episode => ({
  episodeId: 'ep_test',
  sessionId: 'session_test',
  episodeType: 'goal_definition',
  startIndex: 0,
  endIndex: messages.length,
  messages,
  outcome,
  createdAt: new Date().toISOString(),
});

describe('Trajectory Analyzer', () => {
  describe('analyzeTrajectorySync', () => {
    it('should analyze a simple trajectory', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Help me fix this bug', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Looking at the code...', timestamp: new Date().toISOString() },
        { role: 'user', content: 'That worked!', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Great!', timestamp: new Date().toISOString() },
      ]);

      const analysis = analyzeTrajectorySync(episode);

      expect(analysis.episodeId).toBe('ep_test');
      expect(analysis.outcome).toBeDefined();
      expect(analysis.trajectoryPoints).toBeDefined();
      expect(Array.isArray(analysis.trajectoryPoints)).toBe(true);
    });

    it('should detect trajectory points', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Write a function to sort', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Here is bubble sort', timestamp: new Date().toISOString() },
        { role: 'user', content: 'No, use quicksort instead', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Here is quicksort', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Perfect!', timestamp: new Date().toISOString() },
      ]);

      const analysis = analyzeTrajectorySync(episode);

      expect(analysis.trajectoryPoints.length).toBeGreaterThan(0);
    });

    it('should calculate step scores', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Help me', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sure', timestamp: new Date().toISOString() },
      ]);

      const analysis = analyzeTrajectorySync(episode);

      expect(analysis.stepScores).toBeDefined();
      expect(Array.isArray(analysis.stepScores)).toBe(true);
    });

    it('should identify success criteria', () => {
      const episode = createEpisode(
        [
          { role: 'user', content: 'This is perfect!', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Glad it worked!', timestamp: new Date().toISOString() },
        ],
        'success'
      );

      const analysis = analyzeTrajectorySync(episode);

      expect(analysis.successCriteria).toBeDefined();
      expect(Array.isArray(analysis.successCriteria)).toBe(true);
    });
  });

  describe('findWinningBranch', () => {
    it('should find the winning branch', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Try approach A', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Approach A failed', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Try approach B', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Approach B worked!', timestamp: new Date().toISOString() },
      ]);

      const analysis = analyzeTrajectorySync(episode);
      const winningBranch = findWinningBranch(analysis);

      expect(winningBranch).toBeDefined();
    });
  });

  describe('getTrajectorySimpleSummary', () => {
    it('should generate a simple summary', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Help', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Done', timestamp: new Date().toISOString() },
      ]);

      const analysis = analyzeTrajectorySync(episode);
      const summary = getTrajectorySimpleSummary(analysis);

      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
    });
  });
});

describe('Outcome Detector', () => {
  describe('detectOutcome', () => {
    it('should detect success outcome', () => {
      const episode = createEpisode([
        { role: 'user', content: 'This is exactly what I needed!', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Great!', timestamp: new Date().toISOString() },
      ]);

      const result = detectOutcome(episode);

      expect(result.outcome).toBe('success');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect failure outcome', () => {
      const episode = createEpisode([
        { role: 'user', content: 'This is completely wrong and broken', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sorry about that', timestamp: new Date().toISOString() },
      ]);

      const result = detectOutcome(episode);

      expect(result.outcome).toBe('failure');
    });

    it('should detect neutral outcome', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Okay', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Alright', timestamp: new Date().toISOString() },
      ]);

      const result = detectOutcome(episode);

      expect(['neutral', 'partial']).toContain(result.outcome);
    });
  });

  describe('detectOutcomeFromMessages', () => {
    it('should detect outcome from messages', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Perfect solution!', timestamp: new Date().toISOString() },
      ];

      const result = detectOutcomeFromMessages(messages);

      expect(result.outcome).toBe('success');
    });
  });

  describe('getFinalUserSentiment', () => {
    it('should detect positive sentiment', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Thank you so much!', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Welcome!', timestamp: new Date().toISOString() },
      ];

      // getFinalUserSentiment takes ConversationMessage[], not Episode
      const sentiment = getFinalUserSentiment(messages);

      expect(sentiment).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      const messages: ConversationMessage[] = [
        // Use clearer negative indicators that match the NEGATIVE_PATTERNS
        { role: 'user', content: "This doesn't work and is still broken", timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sorry', timestamp: new Date().toISOString() },
      ];

      // getFinalUserSentiment takes ConversationMessage[], not Episode
      const sentiment = getFinalUserSentiment(messages);

      expect(sentiment).toBe('negative');
    });
  });

  describe('isSuccessfulConversation', () => {
    it('should return true for successful conversations', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Great work! This is exactly what I needed! Perfect!', timestamp: new Date().toISOString() },
      ];

      // isSuccessfulConversation takes ConversationMessage[], not Episode
      expect(isSuccessfulConversation(messages)).toBe(true);
    });
  });

  describe('getOutcomeExplanation', () => {
    it('should provide explanation for outcome', () => {
      const episode = createEpisode([
        { role: 'user', content: 'Thanks!', timestamp: new Date().toISOString() },
      ]);

      const result = detectOutcome(episode);
      const explanation = getOutcomeExplanation(result);

      expect(explanation).toBeTruthy();
      expect(typeof explanation).toBe('string');
    });
  });
});

describe('Hallucination Detector', () => {
  describe('detectHallucinationsSync', () => {
    it('should detect potential file path hallucinations', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'Look at /path/to/nonexistent/file.ts',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = detectHallucinationsSync(messages);

      expect(result.hallucinations).toBeDefined();
      expect(Array.isArray(result.hallucinations)).toBe(true);
    });

    it('should detect potential version hallucinations', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'Use react@99.0.0 for this feature',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = detectHallucinationsSync(messages);

      expect(result.overallRisk).toBeDefined();
    });

    it('should assign risk levels', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'The function exists in file.js line 500',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = detectHallucinationsSync(messages);

      expect(['low', 'medium', 'high']).toContain(result.overallRisk);
    });

    it('should handle clean messages', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'Hello, how can I help you?',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = detectHallucinationsSync(messages);

      expect(result.overallRisk).toBe('low');
    });
  });

  describe('getHallucinationSummary', () => {
    it('should generate a summary', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'Check file.ts', timestamp: new Date().toISOString() },
      ];

      const result = detectHallucinationsSync(messages);
      const summary = getHallucinationSummary(result);

      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
    });
  });

  describe('needsVerification', () => {
    it('should return true for ungrounded claims', () => {
      const context: ConversationMessage[] = [
        { role: 'user', content: 'Help me with React', timestamp: new Date().toISOString() },
      ];

      // Claim about something not mentioned by user
      const result = needsVerification('The file is at /some/random/path.ts', context);
      expect(result).toBe(true);
    });

    it('should return false for grounded claims', () => {
      const context: ConversationMessage[] = [
        { role: 'user', content: 'Check the authentication module', timestamp: new Date().toISOString() },
      ];

      // Claim that references user context
      const result = needsVerification('The authentication module needs fixing', context);
      expect(result).toBe(false);
    });
  });
});
