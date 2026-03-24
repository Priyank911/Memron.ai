/**
 * Analysis Pipeline
 * Orchestrates the full analysis workflow from conversation to structured output
 */
import type { ConversationMessage, AnalysisPipelineInput, AnalysisPipelineResult } from './types.js';
export interface PipelineConfig {
    useLLM?: boolean;
    parallel?: boolean;
    maxEpisodes?: number;
    maxMemoriesPerEpisode?: number;
}
/**
 * Run the full analysis pipeline
 */
export declare function runPipeline(input: AnalysisPipelineInput, config?: PipelineConfig): Promise<AnalysisPipelineResult>;
/**
 * Run pipeline synchronously (no LLM calls)
 */
export declare function runPipelineSync(input: AnalysisPipelineInput, config?: Omit<PipelineConfig, 'useLLM' | 'parallel'>): AnalysisPipelineResult;
/**
 * Quick analysis for immediate feedback
 */
export declare function quickAnalyze(messages: ConversationMessage[], userId: string): Promise<{
    outcome: string;
    hallucinationRisk: string;
    memoriesExtracted: number;
    compressionRatio: number;
}>;
/**
 * Get pipeline summary
 */
export declare function getPipelineSummary(result: AnalysisPipelineResult): string;
//# sourceMappingURL=pipeline.d.ts.map