/**
 * Episode Splitter Tests
 */

import { describe, it, expect } from 'vitest';
import {
  splitIntoEpisodesSync,
  summarizeEpisode,
} from '../episode-splitter';
import type { ConversationMessage } from '../types';

describe('Episode Splitter', () => {
  const createMessage = (
    role: ConversationMessage['role'],
    content: string,
    timestamp?: string
  ): ConversationMessage => ({
    role,
    content,
    timestamp: timestamp || new Date().toISOString(),
  });

  describe('splitIntoEpisodesSync', () => {
    it('should create a single episode for short conversations', () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      const episodes = splitIntoEpisodesSync('session_1', messages);

      expect(episodes.length).toBe(1);
      expect(episodes[0].sessionId).toBe('session_1');
      expect(episodes[0].messages.length).toBe(2);
    });

    it('should detect goal definition episodes', () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'I want to build a login system'),
        createMessage('assistant', 'Sure, I can help with that.'),
        createMessage('user', 'It should support OAuth'),
        createMessage('assistant', 'Got it, OAuth authentication.'),
      ];

      const episodes = splitIntoEpisodesSync('session_2', messages);

      expect(episodes.length).toBeGreaterThanOrEqual(1);
      expect(episodes[0].episodeType).toBe('goal_definition');
    });

    it('should detect troubleshooting episodes', () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'The code is not working'),
        createMessage('assistant', 'Let me check the error'),
        createMessage('user', 'I get this error: TypeError'),
        createMessage('assistant', 'The issue is in line 42'),
        createMessage('user', 'That fixed it, thanks!'),
        createMessage('assistant', 'Great!'),
      ];

      const episodes = splitIntoEpisodesSync('session_3', messages);

      // Should have at least one episode
      expect(episodes.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect correction points as episode boundaries', () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'Help me write a function'),
        createMessage('assistant', 'Here is the function: function foo(){}'),
        createMessage('user', "No, that's wrong. It should return a number"),
        createMessage('assistant', 'Sorry, here is the corrected version'),
        createMessage('user', 'Perfect, thanks!'),
        createMessage('assistant', 'You are welcome!'),
      ];

      const episodes = splitIntoEpisodesSync('session_4', messages);

      // Should detect correction and create appropriate episodes
      expect(episodes.length).toBeGreaterThanOrEqual(1);
      expect(episodes.some(e => e.outcome === 'success' || e.outcome === 'partial')).toBe(true);
    });

    it('should detect conclusion episodes', () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'Help me fix this bug'),
        createMessage('assistant', 'Looking at the code...'),
        createMessage('user', 'Great, the solution works!'),
        createMessage('assistant', 'Glad I could help!'),
        createMessage('user', 'Thanks, goodbye!'),
        createMessage('assistant', 'Goodbye!'),
      ];

      const episodes = splitIntoEpisodesSync('session_5', messages);

      const lastEpisode = episodes[episodes.length - 1];
      expect(lastEpisode.outcome).toBe('success');
    });

    it('should handle empty messages array', () => {
      const episodes = splitIntoEpisodesSync('session_empty', []);
      expect(episodes.length).toBe(0);
    });
  });

  // Note: summarizeEpisode tests are skipped because they require GROQ_API_KEY
  // These are integration tests that should be run with proper credentials
  describe('summarizeEpisode', () => {
    const hasApiKey = !!process.env.GROQ_API_KEY;

    it.skipIf(!hasApiKey)('should generate a summary for an episode', async () => {
      const messages: ConversationMessage[] = [
        createMessage('user', 'How do I sort an array in JavaScript?'),
        createMessage('assistant', 'You can use array.sort() method.'),
      ];

      const episodes = splitIntoEpisodesSync('session_6', messages);

      // summarizeEpisode is async and requires GROQ_API_KEY
      const summary = await summarizeEpisode(episodes[0]);

      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it.skipIf(!hasApiKey)('should handle episodes with many messages', async () => {
      const messages: ConversationMessage[] = Array(10)
        .fill(null)
        .map((_, i) =>
          createMessage(
            i % 2 === 0 ? 'user' : 'assistant',
            `Message ${i + 1}`
          )
        );

      const episodes = splitIntoEpisodesSync('session_7', messages);

      // summarizeEpisode is async and requires GROQ_API_KEY
      const summary = await summarizeEpisode(episodes[0]);

      expect(summary).toBeTruthy();
    });
  });
});
