/**
 * Compression Optimizer
 * Optimizes content compression while preserving essential information
 */
export interface CompressionResult {
    compressed: string;
    preservedElements: string[];
    compressionRatio: number;
    originalTokens: number;
    compressedTokens: number;
}
export interface CompressionConfig {
    targetRatio?: number;
    preserveKeywords?: string[];
    maxOutputLength?: number;
}
/**
 * Compress content optimally
 */
export declare function compressContent(content: string, config?: CompressionConfig): Promise<CompressionResult>;
/**
 * Compress content synchronously using heuristics
 */
export declare function compressContentSync(content: string, config?: CompressionConfig): CompressionResult;
/**
 * Compress multiple pieces of content
 */
export declare function compressBatch(contents: string[], config?: CompressionConfig): Promise<CompressionResult[]>;
/**
 * Get compression summary
 */
export declare function getCompressionSummary(result: CompressionResult): string;
//# sourceMappingURL=compression-optimizer.d.ts.map