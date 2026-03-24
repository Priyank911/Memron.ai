/**
 * Embedding Generator
 * Generates embeddings for memories, recipes, and entities using various providers
 */
import Groq from 'groq-sdk';
const DEFAULT_CONFIG = {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    dimensions: 1536,
    apiKey: process.env.GROQ_API_KEY || '',
};
let groqClient = null;
function getGroqClient(apiKey) {
    if (!groqClient) {
        groqClient = new Groq({
            apiKey: apiKey || process.env.GROQ_API_KEY,
        });
    }
    return groqClient;
}
/**
 * Generate embedding for text content
 * Note: Groq doesn't have native embeddings yet, so we use a workaround
 * In production, you'd use OpenAI or a dedicated embedding service
 */
export async function generateEmbedding(text, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    if (fullConfig.provider === 'local') {
        return generateLocalEmbedding(text, fullConfig.dimensions);
    }
    // For now, generate a deterministic embedding based on content
    // In production, integrate with OpenAI, Cohere, or other embedding services
    return generateLocalEmbedding(text, fullConfig.dimensions);
}
/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts, config = {}) {
    const results = [];
    for (const text of texts) {
        const result = await generateEmbedding(text, config);
        results.push(result);
    }
    return results;
}
/**
 * Generate a local deterministic embedding (for development/testing)
 * Uses a simple hash-based approach - NOT for production use
 */
function generateLocalEmbedding(text, dimensions) {
    const normalized = text.toLowerCase().trim();
    const embedding = new Array(dimensions).fill(0);
    // Simple character-based embedding (for development only)
    for (let i = 0; i < normalized.length; i++) {
        const charCode = normalized.charCodeAt(i);
        const idx = (i * 31 + charCode) % dimensions;
        embedding[idx] += Math.sin(charCode * 0.1) * 0.1;
    }
    // Add n-gram features
    const words = normalized.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const hash = simpleHash(word);
        const idx = hash % dimensions;
        embedding[idx] += 0.2;
        // Bigrams
        if (i < words.length - 1) {
            const bigram = `${word} ${words[i + 1]}`;
            const bigramHash = simpleHash(bigram);
            embedding[bigramHash % dimensions] += 0.15;
        }
    }
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
        for (let i = 0; i < embedding.length; i++) {
            embedding[i] /= magnitude;
        }
    }
    return {
        embedding,
        tokens: Math.ceil(text.length / 4),
        model: 'local-hash',
    };
}
/**
 * Simple string hash function
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}
/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same dimension');
    }
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }
    return dotProduct / (magnitudeA * magnitudeB);
}
/**
 * Find most similar items from a list
 */
export function findMostSimilar(query, items, topK = 10) {
    const scored = items.map(({ embedding, item }) => ({
        item,
        similarity: cosineSimilarity(query, embedding),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
}
/**
 * Generate embedding for a memory unit
 */
export async function embedMemory(content, memoryType, config) {
    // Prefix with type for better semantic separation
    const enrichedContent = `[${memoryType}] ${content}`;
    const result = await generateEmbedding(enrichedContent, config);
    return result.embedding;
}
/**
 * Generate embedding for a recipe
 */
export async function embedRecipe(problemStatement, taskType, approach, config) {
    const content = `
Task: ${taskType}
Problem: ${problemStatement}
Approach: ${approach.join('. ')}
  `.trim();
    const result = await generateEmbedding(content, config);
    return result.embedding;
}
/**
 * Generate embedding for an entity
 */
export async function embedEntity(name, entityType, description, config) {
    const content = description
        ? `[${entityType}] ${name}: ${description}`
        : `[${entityType}] ${name}`;
    const result = await generateEmbedding(content, config);
    return result.embedding;
}
/**
 * Generate embedding for a query
 */
export async function embedQuery(query, config) {
    const result = await generateEmbedding(query, config);
    return result.embedding;
}
//# sourceMappingURL=embedding-generator.js.map