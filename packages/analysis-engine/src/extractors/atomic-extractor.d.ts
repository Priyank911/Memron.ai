/**
 * Atomic Memory Extractor
 * Extracts structured memory units from conversation episodes
 */
import type { AtomicMemoryUnit, ConversationMessage, Episode } from '../types';
export interface AtomicExtractorConfig {
    minConfidence?: number;
    maxMemoriesPerEpisode?: number;
    generateEmbeddings?: boolean;
}
/**
 * Extract atomic memory units from an episode
 */
export declare function extractMemories(episode: Episode, userId: string, config?: AtomicExtractorConfig): Promise<AtomicMemoryUnit[]>;
/**
 * Extract memories synchronously using heuristics only
 */
export declare function extractMemoriesSync(episode: Episode, userId: string, config?: AtomicExtractorConfig): AtomicMemoryUnit[];
/**
 * Calculate compression statistics for extracted memories
 */
export declare function calculateCompressionStats(originalMessages: ConversationMessage[], memories: AtomicMemoryUnit[]): {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    memoriesExtracted: number;
};
//# sourceMappingURL=atomic-extractor.d.ts.map