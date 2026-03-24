/**
 * Groq LLM Client
 * Fast inference client for analysis tasks
 */
export interface GroqClientConfig {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface AnalysisResult<T> {
    data: T;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
    latencyMs: number;
}
/**
 * Analyze content using Groq with structured JSON output
 */
export declare function analyze<T>(systemPrompt: string, content: string, config?: GroqClientConfig): Promise<AnalysisResult<T>>;
/**
 * Batch analyze multiple items with the same prompt
 */
export declare function analyzeBatch<T>(systemPrompt: string, items: string[], config?: GroqClientConfig): Promise<AnalysisResult<T>[]>;
/**
 * Stream analysis for long content (returns chunks)
 */
export declare function analyzeStream(systemPrompt: string, content: string, config?: GroqClientConfig): AsyncGenerator<string, void, unknown>;
/**
 * Reset the client (useful for testing)
 */
export declare function resetClient(): void;
/**
 * Get embedding-ready text (prepares content for external embedding)
 * Note: Groq doesn't provide embeddings, so we prepare text for external services
 */
export declare function prepareForEmbedding(text: string, maxLength?: number): string;
//# sourceMappingURL=groq-client.d.ts.map