/**
 * Hallucination Detector
 * Detects potential hallucinations in AI responses
 */
import type { ConversationMessage } from '../types';
export type RiskLevel = 'low' | 'medium' | 'high';
export interface HallucinationIndicator {
    content: string;
    reason: string;
    riskLevel: RiskLevel;
    verificationStep: string;
    messageIndex: number;
}
export interface HallucinationAnalysis {
    hallucinations: HallucinationIndicator[];
    overallRisk: RiskLevel;
    confidence: number;
}
export interface HallucinationDetectorConfig {
    useHeuristics?: boolean;
    useLLM?: boolean;
}
/**
 * Analyze messages for hallucinations
 */
export declare function detectHallucinations(messages: ConversationMessage[], config?: HallucinationDetectorConfig): Promise<HallucinationAnalysis>;
/**
 * Detect hallucinations synchronously using heuristics only
 */
export declare function detectHallucinationsSync(messages: ConversationMessage[], config?: HallucinationDetectorConfig): HallucinationAnalysis;
/**
 * Get a summary of hallucination risk
 */
export declare function getHallucinationSummary(analysis: HallucinationAnalysis): string;
/**
 * Check if a specific claim needs verification
 */
export declare function needsVerification(claim: string, context: ConversationMessage[]): boolean;
//# sourceMappingURL=hallucination-detector.d.ts.map