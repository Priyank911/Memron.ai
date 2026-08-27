/**
 * LLM Client — OpenAI gpt-4o-mini Inference Client
 * Ultra-fast, low-cost structured JSON extraction for memory analysis tasks
 */

import OpenAI from 'openai';

export interface LLMClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Backwards compatibility type alias
export type GroqClientConfig = LLMClientConfig;

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

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.1;

let openaiClient: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  if (!openaiClient) {
    const key = apiKey || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

/**
 * Analyze content using OpenAI gpt-4o-mini with structured JSON output
 */
export async function analyze<T>(
  systemPrompt: string,
  content: string,
  config: LLMClientConfig = {}
): Promise<AnalysisResult<T>> {
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
    throw new Error('No content in OpenAI response');
  }

  let data: T;
  try {
    data = JSON.parse(message.content) as T;
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${message.content}`);
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
export async function analyzeBatch<T>(
  systemPrompt: string,
  items: string[],
  config: LLMClientConfig = {}
): Promise<AnalysisResult<T>[]> {
  // Process in parallel for speed
  return Promise.all(items.map((content) => analyze<T>(systemPrompt, content, config)));
}

/**
 * Stream analysis for long content (returns chunks)
 */
export async function* analyzeStream(
  systemPrompt: string,
  content: string,
  config: LLMClientConfig = {}
): AsyncGenerator<string, void, unknown> {
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
export function resetClient(): void {
  openaiClient = null;
}

/**
 * Get embedding-ready text (prepares content for external embedding)
 */
export function prepareForEmbedding(text: string, maxLength: number = 8000): string {
  let cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 3) + '...';
  }
  return cleaned;
}
