/**
 * Outcome Detector
 * Detects and classifies conversation outcomes
 */

import type { ConversationMessage, Episode, OutcomeType } from '../types.js';

export interface OutcomeSignal {
  type: 'positive' | 'negative' | 'neutral';
  strength: number; // 0-1
  source: string;
  messageIndex: number;
}

export interface OutcomeDetectionResult {
  outcome: OutcomeType;
  confidence: number;
  signals: OutcomeSignal[];
  reasoning: string;
}

/**
 * Positive outcome indicators
 */
const POSITIVE_PATTERNS: Array<{ pattern: RegExp; strength: number; source: string }> = [
  { pattern: /\b(perfect|exactly|works|thank you|thanks|great)\b/i, strength: 0.9, source: 'explicit_gratitude' },
  { pattern: /\b(solved|fixed|done|complete|success)\b/i, strength: 0.85, source: 'completion_indicator' },
  { pattern: /\b(this is what i needed|that's it|exactly right)\b/i, strength: 0.95, source: 'explicit_satisfaction' },
  { pattern: /\b(awesome|excellent|brilliant|wonderful)\b/i, strength: 0.8, source: 'positive_emotion' },
  { pattern: /\b(yes|correct|right|agreed)\b/i, strength: 0.6, source: 'affirmation' },
];

/**
 * Negative outcome indicators
 */
const NEGATIVE_PATTERNS: Array<{ pattern: RegExp; strength: number; source: string }> = [
  { pattern: /\b(doesn't work|not working|still broken|failed)\b/i, strength: 0.9, source: 'explicit_failure' },
  { pattern: /\b(wrong|incorrect|that's not|no,)\b/i, strength: 0.7, source: 'rejection' },
  { pattern: /\b(error|exception|crash|bug)\b/i, strength: 0.6, source: 'error_mention' },
  { pattern: /\b(frustrated|annoyed|confused)\b/i, strength: 0.7, source: 'negative_emotion' },
  { pattern: /\b(try again|start over|different approach)\b/i, strength: 0.5, source: 'retry_request' },
];

/**
 * Partial success indicators
 */
const PARTIAL_PATTERNS: Array<{ pattern: RegExp; strength: number; source: string }> = [
  { pattern: /\b(almost|close|partially|kind of|sort of)\b/i, strength: 0.7, source: 'partial_indicator' },
  { pattern: /\b(mostly works|works but|good but)\b/i, strength: 0.8, source: 'qualified_success' },
  { pattern: /\b(one more thing|also need|additionally)\b/i, strength: 0.5, source: 'continuation_need' },
];

/**
 * Detect signals from a single message
 */
function detectSignals(
  message: ConversationMessage,
  messageIndex: number
): OutcomeSignal[] {
  const signals: OutcomeSignal[] = [];
  const content = message.content;

  // Only analyze user messages for outcome signals
  if (message.role !== 'user') {
    return signals;
  }

  // Check positive patterns
  for (const { pattern, strength, source } of POSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        type: 'positive',
        strength,
        source,
        messageIndex,
      });
    }
  }

  // Check negative patterns
  for (const { pattern, strength, source } of NEGATIVE_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        type: 'negative',
        strength,
        source,
        messageIndex,
      });
    }
  }

  // Check partial patterns
  for (const { pattern, strength, source } of PARTIAL_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        type: 'neutral', // Partial success signals are neutral
        strength,
        source,
        messageIndex,
      });
    }
  }

  return signals;
}

/**
 * Weight signals by recency (later messages have more weight)
 */
function weightByRecency(signals: OutcomeSignal[], totalMessages: number): OutcomeSignal[] {
  return signals.map((signal) => {
    const recencyFactor = 0.5 + (signal.messageIndex / totalMessages) * 0.5;
    return {
      ...signal,
      strength: signal.strength * recencyFactor,
    };
  });
}

/**
 * Calculate aggregate scores from signals
 */
function calculateScores(signals: OutcomeSignal[]): {
  positiveScore: number;
  negativeScore: number;
  neutralScore: number;
} {
  let positiveScore = 0;
  let negativeScore = 0;
  let neutralScore = 0;

  for (const signal of signals) {
    switch (signal.type) {
      case 'positive':
        positiveScore += signal.strength;
        break;
      case 'negative':
        negativeScore += signal.strength;
        break;
      case 'neutral':
        neutralScore += signal.strength;
        break;
    }
  }

  return { positiveScore, negativeScore, neutralScore };
}

/**
 * Determine outcome from scores
 */
function determineOutcome(scores: {
  positiveScore: number;
  negativeScore: number;
  neutralScore: number;
}): { outcome: OutcomeType; confidence: number; reasoning: string } {
  const { positiveScore, negativeScore, neutralScore } = scores;
  const totalScore = positiveScore + negativeScore + neutralScore;

  if (totalScore === 0) {
    return {
      outcome: 'neutral',
      confidence: 0.3,
      reasoning: 'No clear outcome signals detected',
    };
  }

  // Clear success
  if (positiveScore > negativeScore * 2 && positiveScore > neutralScore) {
    return {
      outcome: 'success',
      confidence: Math.min(0.95, positiveScore / totalScore),
      reasoning: `Strong positive signals (${positiveScore.toFixed(2)}) dominate`,
    };
  }

  // Clear failure
  if (negativeScore > positiveScore * 2 && negativeScore > neutralScore) {
    return {
      outcome: 'failure',
      confidence: Math.min(0.95, negativeScore / totalScore),
      reasoning: `Strong negative signals (${negativeScore.toFixed(2)}) dominate`,
    };
  }

  // Partial success (positive with caveats)
  if (positiveScore > 0 && neutralScore > positiveScore * 0.5) {
    return {
      outcome: 'partial',
      confidence: Math.min(0.85, (positiveScore + neutralScore) / totalScore),
      reasoning: 'Positive signals with partial/qualified indicators',
    };
  }

  // Mixed signals - lean toward the stronger
  if (positiveScore > negativeScore) {
    return {
      outcome: positiveScore - negativeScore > 0.5 ? 'success' : 'partial',
      confidence: Math.min(0.7, (positiveScore - negativeScore) / totalScore + 0.3),
      reasoning: 'Mixed signals, slight positive lean',
    };
  }

  if (negativeScore > positiveScore) {
    return {
      outcome: 'failure',
      confidence: Math.min(0.7, (negativeScore - positiveScore) / totalScore + 0.3),
      reasoning: 'Mixed signals, slight negative lean',
    };
  }

  return {
    outcome: 'neutral',
    confidence: 0.5,
    reasoning: 'Balanced signals, no clear outcome',
  };
}

/**
 * Detect outcome from an episode
 */
export function detectOutcome(episode: Episode): OutcomeDetectionResult {
  const allSignals: OutcomeSignal[] = [];

  // Collect signals from all messages
  for (let i = 0; i < episode.messages.length; i++) {
    const signals = detectSignals(episode.messages[i], i);
    allSignals.push(...signals);
  }

  // Weight by recency
  const weightedSignals = weightByRecency(allSignals, episode.messages.length);

  // Calculate scores
  const scores = calculateScores(weightedSignals);

  // Determine outcome
  const { outcome, confidence, reasoning } = determineOutcome(scores);

  return {
    outcome,
    confidence,
    signals: weightedSignals,
    reasoning,
  };
}

/**
 * Detect outcome from conversation messages
 */
export function detectOutcomeFromMessages(
  messages: ConversationMessage[]
): OutcomeDetectionResult {
  const allSignals: OutcomeSignal[] = [];

  for (let i = 0; i < messages.length; i++) {
    const signals = detectSignals(messages[i], i);
    allSignals.push(...signals);
  }

  const weightedSignals = weightByRecency(allSignals, messages.length);
  const scores = calculateScores(weightedSignals);
  const { outcome, confidence, reasoning } = determineOutcome(scores);

  return {
    outcome,
    confidence,
    signals: weightedSignals,
    reasoning,
  };
}

/**
 * Get the final user sentiment
 */
export function getFinalUserSentiment(
  messages: ConversationMessage[]
): 'positive' | 'negative' | 'neutral' {
  // Find the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return 'neutral';
  }

  const signals = detectSignals(lastUserMessage, messages.length - 1);

  if (signals.length === 0) {
    return 'neutral';
  }

  const positiveStrength = signals
    .filter((s) => s.type === 'positive')
    .reduce((sum, s) => sum + s.strength, 0);

  const negativeStrength = signals
    .filter((s) => s.type === 'negative')
    .reduce((sum, s) => sum + s.strength, 0);

  if (positiveStrength > negativeStrength + 0.2) {
    return 'positive';
  } else if (negativeStrength > positiveStrength + 0.2) {
    return 'negative';
  }

  return 'neutral';
}

/**
 * Check if conversation ended successfully
 */
export function isSuccessfulConversation(messages: ConversationMessage[]): boolean {
  const result = detectOutcomeFromMessages(messages);
  return result.outcome === 'success' && result.confidence > 0.7;
}

/**
 * Get outcome explanation for display
 */
export function getOutcomeExplanation(result: OutcomeDetectionResult): string {
  const topSignals = result.signals
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  const signalDescriptions = topSignals
    .map((s) => `${s.source} (${s.type}, ${(s.strength * 100).toFixed(0)}%)`)
    .join(', ');

  return `${result.outcome.toUpperCase()} (${(result.confidence * 100).toFixed(0)}% confidence). ` +
    `Top signals: ${signalDescriptions}. ${result.reasoning}`;
}
