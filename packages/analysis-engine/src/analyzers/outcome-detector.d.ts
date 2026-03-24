/**
 * Outcome Detector
 * Detects and classifies conversation outcomes
 */
import type { ConversationMessage, Episode, OutcomeType } from '../types';
export interface OutcomeSignal {
    type: 'positive' | 'negative' | 'neutral';
    strength: number;
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
 * Detect outcome from an episode
 */
export declare function detectOutcome(episode: Episode): OutcomeDetectionResult;
/**
 * Detect outcome from conversation messages
 */
export declare function detectOutcomeFromMessages(messages: ConversationMessage[]): OutcomeDetectionResult;
/**
 * Get the final user sentiment
 */
export declare function getFinalUserSentiment(messages: ConversationMessage[]): 'positive' | 'negative' | 'neutral';
/**
 * Check if conversation ended successfully
 */
export declare function isSuccessfulConversation(messages: ConversationMessage[]): boolean;
/**
 * Get outcome explanation for display
 */
export declare function getOutcomeExplanation(result: OutcomeDetectionResult): string;
//# sourceMappingURL=outcome-detector.d.ts.map