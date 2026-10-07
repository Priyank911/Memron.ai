/**
 * Embedding Service — Production multi-provider with circuit breaker.
 *
 * Used at memory creation time to generate an embedding from plaintext
 * content (before encryption). The embedding is stored alongside the encrypted
 * content in the memories table for vector similarity search.
 *
 * Provider selection:
 *   1. EMBEDDING_PROVIDER selects the primary provider (Gemini by default).
 *   2. EMBEDDING_FALLBACK_PROVIDER optionally selects an explicitly approved
 *      secondary provider used only after primary failure/circuit open.
 *   3. No configured provider → embeddings disabled, keyword-only search.
 *
 * Gemini is the default provider. OpenRouter and OpenAI remain available only
 * when selected explicitly.
 *
 * Production features:
 *   - Circuit breaker: 3 failures → 60s cooldown
 *   - Concurrency limiter: 2 parallel, 100 queued
 */

import { getEnv } from '../env.js';

const embeddingDims = () => Number(getEnv('EMBEDDING_DIMENSIONS') || 1024);
// In Cloudflare Workers the 30-second wall-clock budget is shared across the
// auth DB lookup + MCP bridge setup + the tool handler itself. A 15-second
// embedding timeout leaves no headroom. Use a short timeout so memory_store
// falls back to the background indexing queue rather than timing out the whole
// Worker request.
const isWorkerRuntime = () => getEnv('MEMRON_RUNTIME') === 'worker';
const TIMEOUT_MS = isWorkerRuntime() ? 4_000 : 15_000;
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

function resolveProviderByName(requestedProvider: string): ProviderConfig | null {
  const geminiKey = getEnv('GEMINI_API_KEY');
  const openRouterKey = getEnv('OPENROUTER_API_KEY');
  const openaiKey = getEnv('OPENAI_API_KEY');

  if (requestedProvider === 'gemini' && geminiKey) {
    const model = getEnv('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2';
    return {
      name: 'gemini',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      apiKey: geminiKey,
      buildBody: (input) => ({
        model: `models/${model}`,
        content: { parts: [{ text: input }] },
        // The database and vector indexes use vector(1024). Gemini's native
        // 3072 output is reduced server-side before storage.
        output_dimensionality: embeddingDims(),
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
        model: getEnv('OPENROUTER_EMBEDDING_MODEL') || 'liquid/lfm-2.5-embedding-350m:free',
        input,
        dimensions: embeddingDims(),
      }),
      headers: {
        'HTTP-Referer': getEnv('OPENROUTER_HTTP_REFERER') || 'https://memron.ai',
        'X-Title': getEnv('OPENROUTER_APP_TITLE') || 'Memron',
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
        dimensions: embeddingDims(),
      }),
    };
  }

  return null;
}

function resolveProviders(): ProviderConfig[] {
  const primary = (getEnv('EMBEDDING_PROVIDER') || 'gemini').toLowerCase();
  const fallbackNames = (getEnv('EMBEDDING_FALLBACK_PROVIDER') || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const names = Array.from(new Set([primary, ...fallbackNames]));
  const providers = names
    .map((name) => resolveProviderByName(name))
    .filter((provider): provider is ProviderConfig => provider !== null);
  if (!providers.length && !_loggedDisabled) {
    _loggedDisabled = true;
    console.info('[Embeddings] No configured embedding provider — embeddings disabled, using keyword search only');
  }
  return providers;
}

function resolveProvider(): ProviderConfig | null {
  return resolveProviders()[0] || null;
}

// ─── Circuit breaker ────────────────────────────────────────

let _failures = 0;
let _lastFail = 0;

function circuitOpen(): boolean {
  if (_failures < CIRCUIT_THRESHOLD) return false;
  if (Date.now() - _lastFail > CIRCUIT_RESET_MS) { _failures = 0; return false; }
  return true;
}

/**
 * Read-only snapshot of embedding health for the pipeline eye
 * (system_diagnostics tool). No side effects — never trips or resets.
 */
export function getEmbeddingHealth(): {
  configured: boolean;
  provider: string | null;
  fallbackProvider: string | null;
  circuitOpen: boolean;
  consecutiveFailures: number;
  cooldownMsRemaining: number;
  activeSlots: number;
  queuedSlots: number;
} {
  const providers = resolveProviders();
  const provider = providers[0];
  const open = _failures >= CIRCUIT_THRESHOLD && Date.now() - _lastFail <= CIRCUIT_RESET_MS;
  return {
    configured: providers.length > 0,
    provider: provider?.name ?? null,
    fallbackProvider: providers[1]?.name ?? null,
    circuitOpen: open,
    consecutiveFailures: _failures,
    cooldownMsRemaining: open ? Math.max(0, CIRCUIT_RESET_MS - (Date.now() - _lastFail)) : 0,
    activeSlots: _active,
    queuedSlots: _queue.length,
  };
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
  return resolveProviders().length > 0;
}

/** True when at least one configured provider can currently be attempted. */
export function isEmbeddingAvailable(): boolean {
  const providers = resolveProviders();
  return providers.length > 0 && (!circuitOpen() || providers.length > 1);
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
  const configuredProviders = resolveProviders();
  if (!configuredProviders.length) return null;

  const input = text.trim();
  if (!input) return null;
  // The breaker belongs to the primary path. If an explicitly configured
  // fallback exists, keep semantic retrieval alive without retrying the
  // exhausted primary provider on every Worker request.
  const providers = circuitOpen() ? configuredProviders.slice(1) : configuredProviders;
  if (!providers.length) return null;

  const slot = await acquireSlot();
  if (!slot) return null;

  try {
    for (const provider of providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
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
          const isBillingFailure = isRateLimitFailure && /insufficient|credits|billing|quota/i.test(errBody);
          if (isBillingFailure) {
            _failures = CIRCUIT_THRESHOLD;
            _lastFail = Date.now();
            console.error(`[Embeddings] ${provider.name} rejected the request (quota/billing limit); trying configured fallback if available.`);
          } else if (isRateLimitFailure) {
            _failures = Math.min(_failures + 1, CIRCUIT_THRESHOLD - 1);
            _lastFail = Date.now();
            console.warn(`[Embeddings] ${provider.name} rate limit hit; trying configured fallback if available.`);
          } else {
            _failures++;
            _lastFail = Date.now();
            console.warn(`[Embeddings] ${provider.name} error ${res.status}; trying configured fallback if available.`);
          }
          continue;
        }

        const data = await res.json();
        const embedding: number[] = provider.name === 'gemini'
          ? (data?.embedding?.values ?? data?.embeddings?.[0]?.values)
          : data?.data?.[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
          _failures++;
          _lastFail = Date.now();
          console.warn(`[Embeddings] ${provider.name} unexpected response shape; trying configured fallback if available.`);
          continue;
        }
        if (embedding.length !== embeddingDims()) {
          _failures++;
          _lastFail = Date.now();
          console.warn(`[Embeddings] ${provider.name} returned ${embedding.length} dimensions; expected ${embeddingDims()}.`);
          continue;
        }
        _failures = 0;
        _loggedDisabled = false;
        return embedding;
      } catch (err: any) {
        clearTimeout(timer);
        _failures++;
        _lastFail = Date.now();
        console.warn(`[Embeddings] ${provider.name} ${err.name === 'AbortError' ? 'timeout' : `error: ${err.message}`}; trying configured fallback if available.`);
      }
    }
    return null;
  } catch (err: any) {
    console.warn(`[Embeddings] unexpected embedding error: ${err.message}`);
    _failures++;
    _lastFail = Date.now();
    return null;
  } finally {
    releaseSlot();
  }
}

/** Generate a bounded batch of embeddings for the indexing worker. */
export async function generateEmbeddings(texts: string[]): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];
  const configuredProviders = resolveProviders();
  if (!configuredProviders.length) return texts.map(() => null);
  const normalized = texts.map(text => text.trim());
  if (normalized.some(text => !text)) return texts.map(() => null);
  const provider = circuitOpen() ? configuredProviders[1] : configuredProviders[0];
  if (!provider) return texts.map(() => null);

  // Do not hold a batch slot while calling generateEmbedding: each foreground
  // request acquires its own limiter slot, so retaining one here could deadlock
  // a non-Gemini fallback batch under load.
  if (provider.name !== 'gemini') {
    return Promise.all(normalized.map(text => generateEmbedding(text)));
  }

  const slot = await acquireSlot();
  if (!slot) return texts.map(() => null);
  const started = Date.now();
  try {
    const model = getEnv('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify({
        requests: normalized.map(text => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          output_dimensionality: embeddingDims(),
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
    if (values.length !== texts.length || values.some(value => !value || value.length !== embeddingDims())) {
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
