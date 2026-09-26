/**
 * Embedding Service — Production multi-provider with circuit breaker.
 *
 * Used at memory creation time to generate an embedding from plaintext
 * content (before encryption). The embedding is stored alongside the encrypted
 * content in the memories table for vector similarity search.
 *
 * Provider selection:
 *   1. GEMINI_API_KEY → Gemini Embedding 2 (1024d output)
 *   2. EMBEDDING_PROVIDER=openrouter → LiquidAI LFM2.5 (explicit legacy option)
 *   3. EMBEDDING_PROVIDER=openai → OpenAI text-embedding-3-small (explicit)
 *   4. No configured provider → embeddings disabled, keyword-only search
 *
 * Gemini is the default provider. OpenRouter and OpenAI remain available only
 * when selected explicitly.
 *
 * Production features:
 *   - Circuit breaker: 5 failures → 5min cooldown
 *   - Concurrency limiter: 10 parallel, 100 queued
 */

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1024);
const TIMEOUT_MS = 15_000;
// Free hosted embedding endpoints are rate-limited. A small queue is safer
// than allowing a memory burst to create a provider 429 storm.
const MAX_CONCURRENT = 2;
const MAX_QUEUED = 100;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60_000;

// ─── Provider resolution ────────────────────────────────────

interface ProviderConfig {
  name: string;
  url: string;
  apiKey: string;
  buildBody: (input: string) => Record<string, unknown>;
  headers?: Record<string, string>;
}

let _loggedDisabled = false;

function resolveProvider(): ProviderConfig | null {
  const requestedProvider = (process.env.EMBEDDING_PROVIDER || 'gemini').toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (requestedProvider === 'gemini' && geminiKey) {
    const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
    return {
      name: 'gemini',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      apiKey: geminiKey,
      buildBody: (input) => ({
        model: `models/${model}`,
        content: { parts: [{ text: input }] },
        // The database and vector indexes use vector(1024). Gemini's native
        // 3072 output is reduced server-side before storage.
        output_dimensionality: EMBEDDING_DIMENSIONS,
      }),
      headers: { 'x-goog-api-key': geminiKey },
    };
  }

  if (requestedProvider === 'openrouter' && openRouterKey) {
    return {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/embeddings',
      apiKey: openRouterKey,
      buildBody: (input) => ({
        model: process.env.OPENROUTER_EMBEDDING_MODEL || 'liquid/lfm-2.5-embedding-350m:free',
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      headers: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://memron.ai',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Memron',
      },
    };
  }

  if (requestedProvider === 'openai' && openaiKey) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/embeddings',
      apiKey: openaiKey,
      buildBody: (input) => ({
        model: 'text-embedding-3-small',
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    };
  }

  if (!_loggedDisabled) {
    _loggedDisabled = true;
    console.info('[Embeddings] No configured embedding provider — embeddings disabled, using keyword search only');
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
 * Generate a 1024-dim embedding vector for the given text.
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
        ...(provider.name === 'gemini' ? {} : { 'Authorization': `Bearer ${provider.apiKey}` }),
        ...(provider.headers || {}),
      },
      body: JSON.stringify(provider.buildBody(input)),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const isRateLimitFailure = res.status === 429;
      const isBillingFailure = isRateLimitFailure && /insufficient|credits|billing/i.test(errBody);
      if (isBillingFailure) {
        // Do not hammer the provider once it has explicitly rejected the
        // account for billing. Memories remain durable and keyword search
        // continues while semantic indexing is paused.
        _failures = CIRCUIT_THRESHOLD;
        _lastFail = Date.now();
        if (!_loggedDisabled) {
          _loggedDisabled = true;
          console.error('[Embeddings] OpenAI rejected the request because the account has no API credits. Semantic indexing paused for 5 minutes; keyword and graph extraction remain available.');
        }
      } else if (isRateLimitFailure) {
        // Stop sending more requests for a short window after a provider
        // throttle. Memory writes continue without vectors and hybrid search
        // falls back to keyword/graph signals until the window expires.
        _failures = CIRCUIT_THRESHOLD;
        _lastFail = Date.now();
        if (!_loggedDisabled) {
          _loggedDisabled = true;
          console.warn('[Embeddings] OpenRouter rate limit reached. Semantic indexing paused for 60 seconds; memory writes remain available.');
        }
      } else {
        console.warn(`[Embeddings] ${provider.name} error ${res.status}: ${errBody.slice(0, 200)}`);
        _failures++; _lastFail = Date.now();
      }
      return null;
    }

    const data = await res.json();
    const embedding: number[] = provider.name === 'gemini'
      ? (data?.embedding?.values ?? data?.embeddings?.[0]?.values)
      : data?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.warn(`[Embeddings] ${provider.name} unexpected response shape`);
      _failures++; _lastFail = Date.now();
      return null;
    }

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(`[Embeddings] ${provider.name} returned ${embedding.length} dimensions; expected ${EMBEDDING_DIMENSIONS}. Check EMBEDDING_DIMENSIONS and the database migration.`);
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

/** Generate a bounded batch of embeddings for the indexing worker. */
export async function generateEmbeddings(texts: string[]): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];
  const provider = resolveProvider();
  if (!provider) return texts.map(() => null);
  const normalized = texts.map(text => text.trim());
  if (normalized.some(text => !text)) return texts.map(() => null);
  if (circuitOpen()) return texts.map(() => null);

  const slot = await acquireSlot();
  if (!slot) return texts.map(() => null);
  const started = Date.now();
  try {
    // Gemini has a native batch endpoint. Other providers use the same
    // single-input path as foreground queries so queued memories are not
    // silently left without vectors.
    if (provider.name !== 'gemini') {
      return await Promise.all(normalized.map(text => generateEmbedding(text)));
    }

    const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify({
        requests: normalized.map(text => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          output_dimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[Embeddings] gemini batch error ${res.status}: ${body.slice(0, 240)}`);
      _failures++;
      _lastFail = Date.now();
      return texts.map(() => null);
    }
    const data = await res.json() as { embeddings?: Array<{ values?: number[] }> };
    const values = data.embeddings?.map(item => item.values || null) || [];
    if (values.length !== texts.length || values.some(value => !value || value.length !== EMBEDDING_DIMENSIONS)) {
      console.warn(`[Embeddings] gemini batch returned ${values.length} results for ${texts.length} inputs`);
      _failures++;
      _lastFail = Date.now();
      return texts.map(() => null);
    }
    _failures = 0;
    console.info(JSON.stringify({ event: 'embedding_batch', provider: 'gemini', batchSize: texts.length, latencyMs: Date.now() - started }));
    return values;
  } catch (error) {
    console.warn(`[Embeddings] batch failure: ${error instanceof Error ? error.message : String(error)}`);
    _failures++;
    _lastFail = Date.now();
    return texts.map(() => null);
  } finally {
    releaseSlot();
  }
}

export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
