/**
 * Groq LLM Client
 * Fast inference client for analysis tasks
 */
import Groq from 'groq-sdk';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.1;
let groqClient = null;
function getClient(apiKey) {
    if (!groqClient) {
        const key = apiKey || process.env.GROQ_API_KEY;
        if (!key) {
            throw new Error('GROQ_API_KEY environment variable is required');
        }
        groqClient = new Groq({ apiKey: key });
    }
    return groqClient;
}
/**
 * Analyze content using Groq with structured JSON output
 */
export async function analyze(systemPrompt, content, config = {}) {
    const client = getClient(config.apiKey);
    const model = config.model || DEFAULT_MODEL;
    const startTime = Date.now();
    const response = await client.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    });
    const latencyMs = Date.now() - startTime;
    const message = response.choices[0]?.message;
    if (!message?.content) {
        throw new Error('No content in Groq response');
    }
    let data;
    try {
        data = JSON.parse(message.content);
    }
    catch (error) {
        throw new Error(`Failed to parse Groq JSON response: ${message.content}`);
    }
    return {
        data,
        usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
        },
        model: response.model,
        latencyMs,
    };
}
/**
 * Batch analyze multiple items with the same prompt
 */
export async function analyzeBatch(systemPrompt, items, config = {}) {
    // Process in parallel for speed
    return Promise.all(items.map((content) => analyze(systemPrompt, content, config)));
}
/**
 * Stream analysis for long content (returns chunks)
 */
export async function* analyzeStream(systemPrompt, content, config = {}) {
    const client = getClient(config.apiKey);
    const model = config.model || DEFAULT_MODEL;
    const stream = await client.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
        ],
        max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: config.temperature ?? DEFAULT_TEMPERATURE,
        stream: true,
    });
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
            yield content;
        }
    }
}
/**
 * Reset the client (useful for testing)
 */
export function resetClient() {
    groqClient = null;
}
/**
 * Get embedding-ready text (prepares content for external embedding)
 * Note: Groq doesn't provide embeddings, so we prepare text for external services
 */
export function prepareForEmbedding(text, maxLength = 8000) {
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    // Truncate if too long
    if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength - 3) + '...';
    }
    return cleaned;
}
//# sourceMappingURL=groq-client.js.map