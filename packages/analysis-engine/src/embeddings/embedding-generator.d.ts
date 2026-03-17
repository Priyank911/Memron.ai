/**
 * Embedding Generator
 * Generates embeddings for memories, recipes, and entities using various providers
 */
export interface EmbeddingConfig {
    provider: 'groq' | 'openai' | 'local';
    model?: string;
    dimensions?: number;
    apiKey?: string;
}
export interface EmbeddingResult {
    embedding: number[];
    tokens: number;
    model: string;
}
/**
 * Generate embedding for text content
 * Note: Groq doesn't have native embeddings yet, so we use a workaround
 * In production, you'd use OpenAI or a dedicated embedding service
 */
export declare function generateEmbedding(text: string, config?: Partial<EmbeddingConfig>): Promise<EmbeddingResult>;
/**
 * Generate embeddings for multiple texts
 */
export declare function generateEmbeddings(texts: string[], config?: Partial<EmbeddingConfig>): Promise<EmbeddingResult[]>;
/**
 * Calculate cosine similarity between two embeddings
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Find most similar items from a list
 */
export declare function findMostSimilar<T>(query: number[], items: Array<{
    embedding: number[];
    item: T;
}>, topK?: number): Array<{
    item: T;
    similarity: number;
}>;
/**
 * Generate embedding for a memory unit
 */
export declare function embedMemory(content: string, memoryType: string, config?: Partial<EmbeddingConfig>): Promise<number[]>;
/**
 * Generate embedding for a recipe
 */
export declare function embedRecipe(problemStatement: string, taskType: string, approach: string[], config?: Partial<EmbeddingConfig>): Promise<number[]>;
/**
 * Generate embedding for an entity
 */
export declare function embedEntity(name: string, entityType: string, description?: string, config?: Partial<EmbeddingConfig>): Promise<number[]>;
/**
 * Generate embedding for a query
 */
export declare function embedQuery(query: string, config?: Partial<EmbeddingConfig>): Promise<number[]>;
//# sourceMappingURL=embedding-generator.d.ts.map