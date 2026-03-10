/**
 * Embedding Service — Computes query embeddings via Groq API.
 *
 * Used at query time to embed user queries for vector similarity search
 * against pre-computed memory embeddings stored in Supabase.
 *
 * Uses the same GROQ_API_KEY that powers the LLM service.
 * If GROQ_API_KEY is not set, vector search is skipped and
 * the pipeline falls back to keyword-only search.
 */

/**
 * Groq embedding model. Update if Groq changes available models.
 * See https://console.groq.com/docs/models for current options.
 */
const EMBEDDING_MODEL = 'nomic-embed-text-v1.5';
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_API_URL = 'https://api.groq.com/openai/v1/embeddings';
const TIMEOUT_MS = 8_000;

/**
 * Check if embedding generation is available.
 */
export function isEmbeddingConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Generate an embedding vector for a user query.
 * Returns null if GROQ_API_KEY is not configured or if generation fails.
 */
export async function embedQuery(text: string): Promise<number[] | null> {
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
      console.warn('[Embeddings] Timeout');
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
