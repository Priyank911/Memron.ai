/**
 * Embedding Service — Production multi-provider with circuit breaker.
 *
 * Provider selection:
 *   1. OPENROUTER_API_KEY → LiquidAI LFM2.5 Embedding 350M (free, 1024d)
 *   2. EMBEDDING_PROVIDER=openai → OpenAI text-embedding-3-small (explicit)
 *   3. No configured provider → embeddings disabled, keyword-only search
 *
 * OpenRouter is the default provider. OpenAI remains available only when
 * explicitly selected for embeddings; RAG generation is configured separately.
 *
 * Production features:
 *   - Circuit breaker: 5 consecutive failures → 5min provider cooldown
 *   - Concurrency limiter: 10 parallel, 100 queued — excess requests dropped
 *   - Graceful degradation: always returns null on failure (never throws)
 */

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1024);
const TIMEOUT_MS = 8_000;
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
  headers?: Record<string, string>;
}

let _loggedDisabled = false;

function resolveProvider(): ProviderConfig | null {
  const requestedProvider = (process.env.EMBEDDING_PROVIDER || 'openrouter').toLowerCase();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (requestedProvider === 'openrouter' && openRouterKey) {
    return {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/embeddings',
      model: process.env.OPENROUTER_EMBEDDING_MODEL || 'liquid/lfm2.5-embedding-350m:free',
      apiKey: openRouterKey,
      extraBody: { dimensions: EMBEDDING_DIMENSIONS },
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
      model: 'text-embedding-3-small',
      apiKey: openaiKey,
      extraBody: { dimensions: EMBEDDING_DIMENSIONS },
    };
  }

  if (!_loggedDisabled) {
    _loggedDisabled = true;
    console.debug('[Embeddings] No configured embedding provider — embeddings disabled, using keyword search only');
  }
  return null;
}

// ─── Circuit breaker (per-process) ──────────────────────────

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

export async function embedQuery(text: string): Promise<number[] | null> {
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
        ...(provider.headers || {}),
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

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(`[Embeddings] ${provider.name} returned ${embedding.length} dimensions; expected ${EMBEDDING_DIMENSIONS}.`);
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
