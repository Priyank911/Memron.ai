/**
 * Send realistic test memories through the real authenticated MCP endpoint.
 *
 * Required:
 *   $env:MEMRON_API_KEY = 'mm_live_...'
 *
 * Optional:
 *   $env:MEMRON_MCP_URL = 'http://localhost:4201/mcp'
 *   $env:MEMRON_EXPECTED_EMAIL = 'you@example.com'
 *   $env:MEMRON_EXPECTED_USER_ID = '7'
 *   $env:MEMRON_TEST_LIMIT = '8'
 */

const endpoint = process.env.MEMRON_MCP_URL || 'http://localhost:4201/mcp';
const apiKey = process.env.MEMRON_API_KEY;
const expectedEmail = process.env.MEMRON_EXPECTED_EMAIL;
const expectedUserId = process.env.MEMRON_EXPECTED_USER_ID;
const limit = Math.max(1, Math.min(10, Number(process.env.MEMRON_TEST_LIMIT || 8)));

if (!apiKey) {
  console.error('Missing MEMRON_API_KEY. Set the bearer API key in the shell; never hardcode it in this file.');
  process.exit(1);
}

let requestId = 0;
let sessionId = null;

async function mcpRequest(method, params = {}, { notification = false } = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const body = {
    jsonrpc: '2.0',
    method,
    params,
    ...(notification ? {} : { id: ++requestId }),
  };

  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const responseText = await response.text();
  const responseSession = response.headers.get('mcp-session-id');
  if (responseSession) sessionId = responseSession;

  if (!response.ok) {
    throw new Error(`MCP ${method} failed (${response.status}): ${responseText.slice(0, 500)}`);
  }
  if (notification || !responseText.trim()) return null;

  // Streamable HTTP may return JSON or an SSE data frame depending on server
  // negotiation. Accept both so this test remains useful with deployed MCP.
  const dataLine = responseText.split('\n').reverse().find(line => line.startsWith('data:'));
  const jsonText = dataLine ? dataLine.slice(5).trim() : responseText;
  const result = JSON.parse(jsonText);
  if (result.error) throw new Error(`MCP ${method} returned an error: ${result.error.message}`);
  return result.result;
}

function parseToolText(result) {
  if (result?.isError) {
    const message = result?.content?.find(item => item.type === 'text')?.text || 'MCP tool call failed';
    throw new Error(message);
  }
  const text = result?.content?.find(item => item.type === 'text')?.text;
  if (!text) return result;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.isError || parsed?.error) {
      throw new Error(parsed.error?.message || parsed.message || text);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message !== text) throw error;
    if (/^(MCP error|error|failed)|expected \d+ dimensions|insufficient/i.test(text)) {
      throw new Error(text);
    }
    return { text };
  }
}

const testMemories = [
  {
    title: 'A2A protocol integration decision',
    content: 'Agent-to-agent communication will use the A2A protocol. The integration should preserve task context, capability discovery, and traceable handoffs between agents.',
    type: 'knowledge', tags: ['a2a', 'agent2agent', 'protocol'],
  },
  {
    title: 'Memron MCP authentication contract',
    content: 'Memron MCP clients authenticate with Authorization Bearer mm_live keys. The MCP server resolves the API key to the authenticated profile before memory_store and memory_recall operations.',
    type: 'knowledge', tags: ['mcp', 'authentication', 'bearer'],
  },
  {
    title: 'PostgreSQL vector storage',
    content: 'Memron stores encrypted memory records in PostgreSQL and stores semantic vectors in pgvector. Keyword search, vector similarity, and graph expansion are combined for hybrid retrieval.',
    type: 'knowledge', tags: ['postgresql', 'pgvector', 'hybrid-search'],
  },
  {
    title: 'NVIDIA Nemotron embedding provider',
    content: 'OpenRouter routes free NVIDIA Nemotron 3 Embed 1B requests for memory embeddings. The provider returns 2048-dimensional vectors for semantic search and graph similarity.',
    type: 'knowledge', tags: ['openrouter', 'nvidia', 'embeddings'],
  },
  {
    title: 'RAG retrieval policy',
    content: 'RAG answers should retrieve relevant memories using hybrid search, include graph-connected entities, and keep the original memory pointer available for evidence tracing.',
    type: 'fact', tags: ['rag', 'retrieval', 'evidence'],
  },
  {
    title: 'Webhook event handling preference',
    content: 'Webhook consumers should process memory.created and memory.updated events idempotently, verify signatures, and retry transient failures with bounded backoff.',
    type: 'preference', tags: ['webhooks', 'events', 'reliability'],
  },
  {
    title: 'Graph relationship extraction rule',
    content: 'The knowledge graph should retain explicit relationships when a predicate is present and use weaker mentioned_with co-occurrence edges when concepts appear together without a stated relationship.',
    type: 'knowledge', tags: ['knowledge-graph', 'relationships', 'co-occurrence'],
  },
  {
    title: 'Agent memory write workflow',
    content: 'An agent should recall relevant context before a non-trivial task, store durable decisions as knowledge, and leave short-lived conversation context in the inbox for triage.',
    type: 'recipe', tags: ['agent', 'memory-store', 'workflow'],
  },
];

try {
  await mcpRequest('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'memron-profile-test', version: '1.0.0' },
  });
  await mcpRequest('notifications/initialized', {}, { notification: true });

  const profile = parseToolText(await mcpRequest('tools/call', {
    name: 'profile_get',
    arguments: {},
  }));
  const user = profile.user || {};
  console.log(`Authenticated profile: ${user.name || 'unknown'} <${user.email || 'unknown'}> (id ${user.id ?? 'unknown'})`);

  if (expectedEmail && user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(`Bearer key belongs to ${user.email || 'an unknown profile'}, not ${expectedEmail}`);
  }
  if (expectedUserId && String(user.id) !== String(expectedUserId)) {
    throw new Error(`Bearer key belongs to user ${user.id}, not ${expectedUserId}`);
  }

  for (const memory of testMemories.slice(0, limit)) {
    const result = parseToolText(await mcpRequest('tools/call', {
      name: 'memory_store',
      arguments: {
        ...memory,
        source: 'agent',
        status: 'untriaged',
        metadata: {
          testRun: 'mcp-profile-test',
          testProvider: 'openrouter',
          generatedAt: new Date().toISOString(),
        },
      },
    }));
    if (result.semanticIndex?.status !== 'ready') {
      throw new Error(`Memory was stored without semantic indexing: ${JSON.stringify(result.semanticIndex || {})}`);
    }
    console.log(`Stored: ${memory.title} -> ${result.pointerId || result.pointer_id || JSON.stringify(result).slice(0, 160)}`);
  }

  const recall = parseToolText(await mcpRequest('tools/call', {
    name: 'memory_recall',
    arguments: {
      query: 'How do A2A, MCP authentication, OpenRouter embeddings, and pgvector work together?',
      limit: 10,
      mode: 'hybrid',
    },
  }));
  console.log(`Recall verification completed: ${JSON.stringify(recall).slice(0, 500)}`);

  if (sessionId) {
    await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}`, 'Mcp-Session-Id': sessionId },
    }).catch(() => undefined);
  }
  console.log(`Completed ${Math.min(limit, testMemories.length)} authenticated MCP memory tests.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
