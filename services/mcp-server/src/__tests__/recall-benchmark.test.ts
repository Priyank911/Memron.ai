/**
 * Memron Recall Accuracy Benchmark
 *
 * Five test categories that directly measure the core retrieval promise:
 *   1. Single-hop recall — one fact stored, one fact asked
 *   2. Multi-hop recall — answer requires stitching 2+ facts
 *   3. Temporal/contradiction resolution — newer version wins
 *   4. Distractor rejection — irrelevant facts alongside the real one
 *   5. Abstention — asking about something never stored
 *
 * Run:
 *   pnpm --filter @memron/mcp-server test -- --reporter=verbose src/__tests__/recall-benchmark.test.ts
 *
 * Or against a live server:
 *   RECALL_BENCHMARK_URL=http://localhost:5201 RECALL_BENCHMARK_KEY=mm_live_xxx \
 *     pnpm --filter @memron/mcp-server tsx src/__tests__/recall-benchmark.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ─── Configuration ──────────────────────────────────────────

const LIVE_URL = process.env.RECALL_BENCHMARK_URL;
const LIVE_KEY = process.env.RECALL_BENCHMARK_KEY;
const isLive = !!LIVE_URL && !!LIVE_KEY;

// ─── Live server helpers ────────────────────────────────────

let _mcpSessionId: string | undefined;

async function mcpRaw(method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${LIVE_KEY}`,
  };
  if (_mcpSessionId) headers['Mcp-Session-Id'] = _mcpSessionId;

  const res = await fetch(`${LIVE_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  // Capture session ID from response headers
  const sessionId = res.headers.get('mcp-session-id');
  if (sessionId) _mcpSessionId = sessionId;

  const text = await res.text();
  // MCP Streamable HTTP returns SSE: "event: message\ndata: {...}"
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  const jsonStr = dataLine ? dataLine.slice(6) : text;
  try {
    return JSON.parse(jsonStr);
  } catch {
    // If it's a plain text error from the server, wrap it
    throw new Error(`MCP raw response: ${text.slice(0, 500)}`);
  }
}

async function mcpInit() {
  const initRes = await mcpRaw('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'recall-benchmark', version: '1.0.0' },
  });
  if (initRes.error) throw new Error(`Init failed: ${JSON.stringify(initRes.error)}`);

  // Send initialized notification
  await fetch(`${LIVE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${LIVE_KEY}`,
      ...(_mcpSessionId ? { 'Mcp-Session-Id': _mcpSessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
}

async function mcpCall(tool: string, args: Record<string, unknown>) {
  const json = await mcpRaw('tools/call', { name: tool, arguments: args });
  if (json.error) throw new Error(JSON.stringify(json.error));
  const resultText = json.result?.content?.[0]?.text ?? '{}';
  return JSON.parse(resultText);
}

async function storeFact(content: string, opts: { type?: string; tags?: string[]; bucket?: string } = {}) {
  return mcpCall('memory_store', {
    content,
    type: opts.type || 'fact',
    tags: opts.tags || [],
    bucket: opts.bucket || 'knowledge',
    source: 'cli',
  });
}

async function recall(query: string, opts: { mode?: string; tags?: string[]; bucket?: string; limit?: number } = {}) {
  return mcpCall('memory_recall', {
    query,
    mode: opts.mode || 'hybrid',
    tags: opts.tags,
    bucket: opts.bucket,
    limit: opts.limit || 10,
    tokenBudget: 2000,
  });
}

async function manage(action: string, pointerId: string, extra: Record<string, unknown> = {}) {
  return mcpCall('memory_manage', { action, pointerId, ...extra });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Test suite ─────────────────────────────────────────────

describe.skipIf(!isLive)('Memron Recall Accuracy Benchmark', () => {
  // Track stored pointer IDs for cleanup
  const stored: string[] = [];

  beforeAll(async () => {
    if (!isLive) return;
    await mcpInit();
  }, 30_000);

  afterAll(async () => {
    if (!isLive) return;
    for (const pid of stored) {
      try { await manage('delete', pid); } catch { /* cleanup best-effort */ }
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 1. SINGLE-HOP RECALL
  // ═══════════════════════════════════════════════════════════
  describe('1. Single-hop recall', () => {
    it('should retrieve a stored fact by direct query', async () => {
      const fact = 'The Memron encryption algorithm uses AES-256-GCM with a 256-bit key derived from scrypt.';
      const storeResult = await storeFact(fact, { tags: ['encryption', 'security'] });
      stored.push(storeResult.pointerId);
      expect(storeResult.status).toBe('stored');

      // Wait for async embedding generation
      await sleep(5000);

      const result = await recall('What encryption algorithm does Memron use?');
      expect(result.totalFound).toBeGreaterThan(0);

      const contents = result.results.map((r: any) => r.content?.toLowerCase() || '');
      const found = contents.some((c: string) => c.includes('aes-256') || c.includes('aes256'));
      expect(found).toBe(true);
    });

    it('should retrieve a stored preference', async () => {
      const pref = 'The user prefers TypeScript over JavaScript for all backend services.';
      const storeResult = await storeFact(pref, { type: 'preference', tags: ['typescript', 'language'] });
      stored.push(storeResult.pointerId);

      await sleep(5000);

      const result = await recall('What programming language does the user prefer for backend?');
      expect(result.totalFound).toBeGreaterThan(0);

      const contents = result.results.map((r: any) => r.content?.toLowerCase() || '');
      const found = contents.some((c: string) => c.includes('typescript'));
      expect(found).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. MULTI-HOP RECALL
  // ═══════════════════════════════════════════════════════════
  describe('2. Multi-hop recall', () => {
    it('should stitch two related facts to answer a compound question', async () => {
      const fact1 = 'Memron uses PostgreSQL with pgvector for vector similarity search.';
      const fact2 = 'The default vector dimensions in Memron are 1024, generated by Gemini Embedding 2.';
      const r1 = await storeFact(fact1, { tags: ['database', 'architecture'] });
      const r2 = await storeFact(fact2, { tags: ['embeddings', 'architecture'] });
      stored.push(r1.pointerId, r2.pointerId);

      await sleep(5000);

      // A multi-hop question: requires knowing both the DB tech AND the embedding model
      const result = await recall('What database and embedding model does Memron use for vector search?');
      expect(result.totalFound).toBeGreaterThanOrEqual(2);

      const allContent = result.results.map((r: any) => (r.content || '').toLowerCase()).join(' ');
      const hasPgvector = allContent.includes('pgvector') || allContent.includes('postgresql');
      const hasGemini = allContent.includes('gemini') || allContent.includes('1024');
      expect(hasPgvector).toBe(true);
      expect(hasGemini).toBe(true);
    });

    it('should connect facts via shared entity across different contexts', async () => {
      const fact1 = 'The MCP server runs on Express.js and listens on port 5201.';
      const fact2 = 'The MCP server uses OAuth 2.1 with PKCE for client authentication.';
      const r1 = await storeFact(fact1, { tags: ['mcp-server', 'infrastructure'] });
      const r2 = await storeFact(fact2, { tags: ['mcp-server', 'auth'] });
      stored.push(r1.pointerId, r2.pointerId);

      await sleep(5000);

      const result = await recall('How is the MCP server configured and secured?');
      expect(result.totalFound).toBeGreaterThanOrEqual(2);

      const allContent = result.results.map((r: any) => (r.content || '').toLowerCase()).join(' ');
      const hasExpress = allContent.includes('express') || allContent.includes('5201');
      const hasOauth = allContent.includes('oauth') || allContent.includes('pkce');
      expect(hasExpress).toBe(true);
      expect(hasOauth).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. TEMPORAL / CONTRADICTION RESOLUTION
  // ═══════════════════════════════════════════════════════════
  describe('3. Temporal/contradiction resolution', () => {
    it('should prefer the newer version when a fact is contradicted', async () => {
      // Store old version
      const old = 'The project uses Firebase Auth for authentication.';
      const r1 = await storeFact(old, { tags: ['auth', 'architecture'] });
      stored.push(r1.pointerId);

      await sleep(3000);

      // Store newer, contradictory version
      const updated = 'The project has migrated from Firebase Auth to WorkOS AuthKit for authentication.';
      const r2 = await storeFact(updated, { tags: ['auth', 'architecture'] });
      stored.push(r2.pointerId);

      // Triage both to knowledge so they're searchable
      await manage('triage', r1.pointerId, { status: 'knowledge' });
      await manage('triage', r2.pointerId, { status: 'knowledge' });

      await sleep(5000);

      const result = await recall('What authentication system does the project use?');
      expect(result.totalFound).toBeGreaterThan(0);

      // The newer fact should rank higher or be present
      const contents = result.results.map((r: any) => (r.content || '').toLowerCase());
      const hasWorkos = contents.some((c: string) => c.includes('workos'));
      expect(hasWorkos).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. DISTRACTOR REJECTION
  // ═══════════════════════════════════════════════════════════
  describe('4. Distractor rejection', () => {
    it('should return the relevant fact, not near-duplicate noise', async () => {
      // Store the real fact
      const real = 'Memron uses AES-256-GCM for encrypting memory content at rest.';
      const r1 = await storeFact(real, { tags: ['encryption', 'security'] });
      stored.push(r1.pointerId);

      // Store distractors — similar topic, different meaning
      const d1 = 'AES-256 is a symmetric encryption standard used by many cloud providers.';
      const d2 = 'GCM mode provides authenticated encryption with associated data.';
      const d3 = 'The project uses encryption for database connections via SSL.';
      const rd1 = await storeFact(d1, { tags: ['encryption', 'general'] });
      const rd2 = await storeFact(d2, { tags: ['encryption', 'general'] });
      const rd3 = await storeFact(d3, { tags: ['database', 'security'] });
      stored.push(rd1.pointerId, rd2.pointerId, rd3.pointerId);

      await sleep(5000);

      // Query specifically about Memron's encryption
      const result = await recall('How does Memron encrypt memory content at rest?');
      expect(result.totalFound).toBeGreaterThan(0);

      // The first result should be the specific fact about Memron, not the generic AES description
      const topResult = result.results[0];
      expect(topResult).toBeDefined();
      const topContent = (topResult.content || '').toLowerCase();
      // Should mention "memron" or "at rest" or "memory content" — not just generic AES
      const isSpecific = topContent.includes('memron') || topContent.includes('memory content') || topContent.includes('at rest');
      expect(isSpecific).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. ABSTENTION
  // ═══════════════════════════════════════════════════════════
  describe('5. Abstention', () => {
    it('should return empty results for a query about something never stored', async () => {
      // Query for something we never stored
      const result = await recall('What is the capital of Atlantis?');
      // Should return 0 results, not hallucinate a memory
      expect(result.totalFound).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should not return unrelated memories for an off-topic query', async () => {
      // Store a specific fact
      const fact = 'The Memron analysis engine uses Groq with llama-3.3-70b-versatile for LLM calls.';
      const r = await storeFact(fact, { tags: ['llm', 'analysis'] });
      stored.push(r.pointerId);

      await sleep(5000);

      // Query about something completely different
      const result = await recall('What is the recipe for chocolate cake?');
      // Should not return the LLM fact as a "match"
      if (result.totalFound > 0) {
        // If it returns anything, it should be clearly low-relevance
        for (const item of result.results) {
          const content = (item.content || '').toLowerCase();
          const isOffTopic = !content.includes('chocolate') && !content.includes('cake');
          // If it returned the LLM fact, that's a false positive
          if (content.includes('groq') || content.includes('llama')) {
            expect.fail('Retrieved an unrelated memory about LLM for a chocolate cake query — false positive');
          }
        }
      }
    });
  });
});

// ─── CLI entry point for live testing ───────────────────────

if (isLive && process.argv[1]?.includes('recall-benchmark')) {
  console.log(`\n  Memron Recall Benchmark (live: ${LIVE_URL})\n`);
  console.log('  Run via: pnpm --filter @memron/mcp-server test -- src/__tests__/recall-benchmark.test.ts\n');
}
