/**
 * Embedding Service — Production multi-provider with circuit breaker.
 *
 * Used at memory creation time to generate an embedding from plaintext
 * content (before encryption). The embedding is stored alongside the encrypted
 * content in the memories table for vector similarity search.
 *
 * Auto-detects provider from environment variables:
 *   1. OPENAI_API_KEY → OpenAI text-embedding-3-small (768d)
 *   2. No key         → embeddings disabled, keyword-only search
 *
 * Note: Groq removed all embedding models (2025). Only OPENAI_API_KEY works.
 *
 * Production features:
 *   - Circuit breaker: 5 failures → 5min cooldown
 *   - Concurrency limiter: 10 parallel, 100 queued
 */

const EMBEDDING_DIMENSIONS = 768;
const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 10;
const MAX_QUEUED = 100;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 5 * 60_000;

// ─── Provider resolution ────────────────────────────────────

interface ProviderConfig {
  name: string;
  url: string;
  model: string;
  apiKey: string;
  extraBody?: Record<string, unknown>;
}

let _loggedDisabled = false;

function resolveProvider(): ProviderConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/embeddings',
      model: 'text-embedding-3-small',
      apiKey: openaiKey,
      extraBody: { dimensions: EMBEDDING_DIMENSIONS },
    };
  }

  // Groq removed all embedding models — do not use GROQ_API_KEY for embeddings
  if (!_loggedDisabled) {
    _loggedDisabled = true;
    console.info('[Embeddings] No OPENAI_API_KEY set — embeddings disabled, using keyword search only');
  }
  return null;
}

// ─── Circuit breaker ────────────────────────────────────────

let _failures = 0;
let _lastFail = 0;

function circuitOpen(): boolean {
  if (_failures < CIRCUIT_THRESHOLD) return false;
  if (Date.now() - _lastFail > CIRCUIT_RESET_MS) { _failures = 0; return false; }
  return true;
}

// ─── Concurrency limiter ────────────────────────────────────

let _active = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<boolean> {
  if (_active < MAX_CONCURRENT) { _active++; return Promise.resolve(true); }
  if (_queue.length >= MAX_QUEUED) return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    _queue.push(() => { _active++; resolve(true); });
  });
}

function releaseSlot(): void {
  _active--;
  const next = _queue.shift();
  if (next) next();
}

// ─── Public API ─────────────────────────────────────────────

export function isEmbeddingConfigured(): boolean {
  return resolveProvider() !== null;
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
 * Generate a 768-dim embedding vector for the given text.
 * Returns null if no embedding provider is configured or on failure.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const provider = resolveProvider();
  if (!provider) return null;

  const input = text.trim();
  if (!input) return null;
  if (circuitOpen()) return null;

  const slot = await acquireSlot();
  if (!slot) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({ model: provider.model, input, ...provider.extraBody }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Embeddings] ${provider.name} error ${res.status}: ${errBody.slice(0, 200)}`);
      _failures++; _lastFail = Date.now();
      return null;
    }

    const data = await res.json();
    const embedding: number[] = data?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.warn(`[Embeddings] ${provider.name} unexpected response shape`);
      _failures++; _lastFail = Date.now();
      return null;
    }

    _failures = 0;
    return embedding;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[Embeddings] ${provider.name} timeout`);
    } else {
      console.warn(`[Embeddings] ${provider.name} error:`, err.message);
    }
    _failures++; _lastFail = Date.now();
    return null;
  } finally {
    releaseSlot();
  }
}

export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
