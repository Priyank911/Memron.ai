/**
 * Episode Splitter
 * Splits conversations into semantic episodes for structured analysis
 */

import { nanoid } from 'nanoid';
import { analyze } from './llm/groq-client';
import { EPISODE_SPLITTING_PROMPT } from './llm/prompts';
import type {
  ConversationMessage,
  Episode,
  EpisodeBoundary,
  EpisodeType,
} from './types';

export interface EpisodeSplitterConfig {
  minEpisodeLength?: number;
  maxEpisodeLength?: number;
  useHeuristics?: boolean;
  useLLM?: boolean;
}

interface LLMBoundaryResult {
  boundaries: Array<{
    index: number;
    episodeType: EpisodeType;
    reason: string;
    confidence: number;
  }>;
  totalMessages: number;
}

const DEFAULT_CONFIG: Required<EpisodeSplitterConfig> = {
  minEpisodeLength: 1,
  maxEpisodeLength: 50,
  useHeuristics: true,
  useLLM: true,
};

/**
 * Heuristic patterns for episode boundary detection
 */
const BOUNDARY_PATTERNS = {
  goalDefinition: [
    /^(i want|i need|can you|please|help me|how do i|what is|create|build|fix|implement|add)/i,
    /^(my goal is|the task is|i'm trying to)/i,
  ],
  failedAttempt: [
    /^(that didn't work|error|failed|not working|broken|wrong|incorrect)/i,
    /^(i got an error|there's a problem|this is failing)/i,
  ],
  correction: [
    /^(actually|no,|wait|correction|let me clarify|i meant)/i,
    /^(that's not quite|not exactly|close but)/i,
  ],
  userClarification: [
    /^(to clarify|specifically|what i mean is|in other words|for context)/i,
    /^(additional info|more details|here's more)/i,
  ],
  toolResult: [/^```[\s\S]*```/m, /^(output:|result:|error:|log:)/i],
  finalSolution: [
    /^(perfect|that works|great|thanks|exactly|this is what i needed)/i,
    /^(solved|fixed|done|complete|working now)/i,
  ],
  exploration: [
    /^(let me (check|look|search|find)|searching|looking at)/i,
    /^(i found|here's what i see|based on)/i,
  ],
};

/**
 * Detect episode type from message content using heuristics
 */
function detectEpisodeTypeFromContent(
  message: ConversationMessage,
  _previousMessages: ConversationMessage[]
): { type: EpisodeType; confidence: number } | null {
  const content = message.content.trim().toLowerCase();

  // Tool results
  if (message.role === 'tool' || message.toolResult !== undefined) {
    return { type: 'tool_result', confidence: 0.95 };
  }

  // User messages
  if (message.role === 'user') {
    for (const pattern of BOUNDARY_PATTERNS.goalDefinition) {
      if (pattern.test(content)) {
        return { type: 'goal_definition', confidence: 0.8 };
      }
    }
    for (const pattern of BOUNDARY_PATTERNS.failedAttempt) {
      if (pattern.test(content)) {
        return { type: 'failed_attempt', confidence: 0.85 };
      }
    }
    for (const pattern of BOUNDARY_PATTERNS.correction) {
      if (pattern.test(content)) {
        return { type: 'correction', confidence: 0.8 };
      }
    }
    for (const pattern of BOUNDARY_PATTERNS.userClarification) {
      if (pattern.test(content)) {
        return { type: 'user_clarification', confidence: 0.75 };
      }
    }
    for (const pattern of BOUNDARY_PATTERNS.finalSolution) {
      if (pattern.test(content)) {
        return { type: 'final_solution', confidence: 0.9 };
      }
    }
  }

  // Assistant exploration
  if (message.role === 'assistant') {
    for (const pattern of BOUNDARY_PATTERNS.exploration) {
      if (pattern.test(content)) {
        return { type: 'exploration', confidence: 0.7 };
      }
    }
  }

  return null;
}

/**
 * Use heuristics to find episode boundaries
 */
function findHeuristicBoundaries(
  messages: ConversationMessage[],
  config: Required<EpisodeSplitterConfig>
): EpisodeBoundary[] {
  const boundaries: EpisodeBoundary[] = [];

  // First message is always a boundary
  if (messages.length > 0) {
    detectEpisodeTypeFromContent(messages[0], []);
    boundaries.push({
      index: 0,
      reason: 'Conversation start',
      confidence: 1.0,
    });
  }

  for (let i = 1; i < messages.length; i++) {
    const currentMessage = messages[i];
    const previousMessages = messages.slice(0, i);
    const detection = detectEpisodeTypeFromContent(currentMessage, previousMessages);

    if (detection && detection.confidence > 0.7) {
      // Check if this represents a significant change from previous
      const lastBoundary = boundaries[boundaries.length - 1];
      const messagesSinceLast = i - lastBoundary.index;

      // Avoid too-short episodes unless it's a clear boundary
      if (messagesSinceLast >= config.minEpisodeLength || detection.confidence > 0.9) {
        boundaries.push({
          index: i,
          reason: `Detected ${detection.type}`,
          confidence: detection.confidence,
        });
      }
    }

    // Enforce max episode length
    const lastBoundary = boundaries[boundaries.length - 1];
    if (i - lastBoundary.index >= config.maxEpisodeLength) {
      boundaries.push({
        index: i,
        reason: 'Max episode length reached',
        confidence: 0.6,
      });
    }
  }

  return boundaries;
}

/**
 * Use LLM to find episode boundaries
 */
async function findLLMBoundaries(
  messages: ConversationMessage[]
): Promise<EpisodeBoundary[]> {
  const conversationText = messages
    .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}`)
    .join('\n\n');

  const result = await analyze<LLMBoundaryResult>(
    EPISODE_SPLITTING_PROMPT,
    conversationText
  );

  return result.data.boundaries.map((b) => ({
    index: b.index,
    reason: b.reason,
    confidence: b.confidence,
  }));
}

/**
 * Merge and deduplicate boundaries from multiple sources
 */
function mergeBoundaries(
  heuristicBoundaries: EpisodeBoundary[],
  llmBoundaries: EpisodeBoundary[]
): EpisodeBoundary[] {
  const merged = new Map<number, EpisodeBoundary>();

  // Add heuristic boundaries
  for (const b of heuristicBoundaries) {
    merged.set(b.index, b);
  }

  // Merge LLM boundaries (higher confidence wins)
  for (const b of llmBoundaries) {
    const existing = merged.get(b.index);
    if (!existing || b.confidence > existing.confidence) {
      merged.set(b.index, b);
    }
  }

  // Sort by index
  return Array.from(merged.values()).sort((a, b) => a.index - b.index);
}

/**
 * Determine episode type from context
 */
function determineEpisodeType(
  messages: ConversationMessage[],
  boundaryReason: string
): EpisodeType {
  // Check the boundary reason first
  const reasonLower = boundaryReason.toLowerCase();
  if (reasonLower.includes('goal')) return 'goal_definition';
  if (reasonLower.includes('fail')) return 'failed_attempt';
  if (reasonLower.includes('correct')) return 'correction';
  if (reasonLower.includes('clarif')) return 'user_clarification';
  if (reasonLower.includes('tool')) return 'tool_result';
  if (reasonLower.includes('final') || reasonLower.includes('solution')) return 'final_solution';
  if (reasonLower.includes('explor')) return 'exploration';
  if (reasonLower.includes('context') || reasonLower.includes('setup')) return 'context_setup';

  // Analyze message content
  if (messages.length === 0) return 'context_setup';

  const firstMessage = messages[0];
  const detection = detectEpisodeTypeFromContent(firstMessage, []);
  if (detection) return detection.type;

  // Check for tool results
  if (messages.some((m) => m.role === 'tool' || m.toolResult !== undefined)) {
    return 'tool_result';
  }

  // Default based on first message role
  if (firstMessage.role === 'user') return 'goal_definition';
  if (firstMessage.role === 'assistant') return 'exploration';

  return 'context_setup';
}

/**
 * Determine episode outcome from messages
 */
function determineOutcome(
  messages: ConversationMessage[]
): 'success' | 'partial' | 'failure' | 'neutral' {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (lastUserMessage) {
    const content = lastUserMessage.content.toLowerCase();

    // Success indicators
    if (
      /\b(perfect|works|great|thanks|exactly|solved|fixed|done|awesome)\b/.test(content)
    ) {
      return 'success';
    }

    // Failure indicators
    if (/\b(doesn't work|error|failed|wrong|broken|not working)\b/.test(content)) {
      return 'failure';
    }

    // Partial indicators
    if (/\b(almost|close|partially|kind of|sort of)\b/.test(content)) {
      return 'partial';
    }
  }

  return 'neutral';
}

/**
 * Split messages into episodes
 */
function createEpisodes(
  sessionId: string,
  messages: ConversationMessage[],
  boundaries: EpisodeBoundary[]
): Episode[] {
  const episodes: Episode[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const startIndex = boundaries[i].index;
    const endIndex = i < boundaries.length - 1 ? boundaries[i + 1].index : messages.length;

    const episodeMessages = messages.slice(startIndex, endIndex);

    episodes.push({
      episodeId: `ep_${nanoid(12)}`,
      sessionId,
      episodeType: determineEpisodeType(episodeMessages, boundaries[i].reason),
      startIndex,
      endIndex,
      messages: episodeMessages,
      outcome: determineOutcome(episodeMessages),
      createdAt: new Date().toISOString(),
    });
  }

  return episodes;
}

/**
 * Split a conversation into semantic episodes
 */
export async function splitIntoEpisodes(
  sessionId: string,
  messages: ConversationMessage[],
  config: EpisodeSplitterConfig = {}
): Promise<Episode[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (messages.length === 0) {
    return [];
  }

  let boundaries: EpisodeBoundary[] = [];

  // Use heuristics
  if (fullConfig.useHeuristics) {
    boundaries = findHeuristicBoundaries(messages, fullConfig);
  }

  // Use LLM for more nuanced splitting
  if (fullConfig.useLLM && messages.length > 3) {
    try {
      const llmBoundaries = await findLLMBoundaries(messages);
      boundaries = mergeBoundaries(boundaries, llmBoundaries);
    } catch (error) {
      // Fall back to heuristics only if LLM fails
      console.warn('LLM episode splitting failed, using heuristics only:', error);
    }
  }

  // Ensure we have at least one boundary at the start
  if (boundaries.length === 0 || boundaries[0].index !== 0) {
    boundaries.unshift({
      index: 0,
      reason: 'Conversation start',
      confidence: 1.0,
    });
  }

  return createEpisodes(sessionId, messages, boundaries);
}

/**
 * Split conversation using heuristics only (no LLM calls)
 */
export function splitIntoEpisodesSync(
  sessionId: string,
  messages: ConversationMessage[],
  config: EpisodeSplitterConfig = {}
): Episode[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config, useLLM: false };

  if (messages.length === 0) {
    return [];
  }

  const boundaries = findHeuristicBoundaries(messages, fullConfig);

  // Ensure we have at least one boundary at the start
  if (boundaries.length === 0 || boundaries[0].index !== 0) {
    boundaries.unshift({
      index: 0,
      reason: 'Conversation start',
      confidence: 1.0,
    });
  }

  return createEpisodes(sessionId, messages, boundaries);
}

/**
 * Generate a summary for an episode
 */
export async function summarizeEpisode(episode: Episode): Promise<string> {
  const content = episode.messages
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const prompt = `Summarize this conversation episode in 1-2 sentences. Focus on the main goal and outcome.`;

  const result = await analyze<{ summary: string }>(prompt, content);
  return result.data.summary;
}
