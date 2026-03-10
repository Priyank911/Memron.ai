/**
 * Embedding Service — Computes vector embeddings via Groq API.
 *
 * Used at memory creation time to generate an embedding from plaintext
 * content (before encryption). The embedding is stored alongside the encrypted
 * content in the memories table for vector similarity search.
 *
 * Uses the same GROQ_API_KEY used for LLM inference.
 * If GROQ_API_KEY is not set, embedding generation is skipped gracefully
 * and the memory is stored without an embedding (keyword search still works).
 */

/**
 * Groq embedding model. Update if Groq changes available models.
 * See https://console.groq.com/docs/models for current options.
 */
const EMBEDDING_MODEL = 'nomic-embed-text-v1.5';
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_API_URL = 'https://api.groq.com/openai/v1/embeddings';
const TIMEOUT_MS = 10_000;

/**
 * Check if embedding generation is available.
 */
export function isEmbeddingConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Build embedding input text from memory fields.
 * Combines title + tags + content for maximum semantic coverage.
 * Truncates to ~8000 chars (~2000 tokens) to stay within model limits.
 */
export function buildEmbeddingInput(
  title: string,
  tags: string[],
  content: string,
): string {
  const tagStr = tags.length > 0 ? `Tags: ${tags.join(', ')}` : '';
  const combined = [title, tagStr, content].filter(Boolean).join('\n');
  return combined.slice(0, 8000);
}

/**
 * Generate a 1536-dim embedding vector for the given text.
 * Returns null if OPENAI_API_KEY is not configured or if generation fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const input = text.trim();
  if (!input) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Embeddings] Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const embedding: number[] = data?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.warn('[Embeddings] Unexpected response shape');
      return null;
    }

    return embedding;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Embeddings] Timeout generating embedding');
    } else {
      console.warn('[Embeddings] Error:', err.message);
    }
    return null;
  }
}

/**
 * Format embedding as pgvector-compatible string: '[0.1,0.2,...]'
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
