/**
 * Stateless MCP JSON-RPC Handler for Cloudflare Workers.
 *
 * Cloudflare Workers are pure request/response; they cannot hold open SSE
 * streams. The standard WebStandardStreamableHTTPServerTransport uses
 * ReadableStream internally even with enableJsonResponse=true, causing a hang
 * when the async tool handlers do not resolve within the stream lifecycle.
 *
 * This module implements a fully stateless JSON-RPC dispatcher:
 *   1. Parse JSON-RPC body (single message or batch array).
 *   2. For `initialize`: synthesise capabilities directly from the MCP server
 *      without running a transport at all.
 *   3. For `tools/list`: ask the server for its registered tools and return.
 *   4. For `tools/call`: resolve the tool handler directly via a in-process
 *      InMemoryTransport pair, with a strict timeout so the Worker never hangs.
 *   5. Return `application/json` immediately — no SSE, no streams.
 *
 * Protocol reference: https://spec.modelcontextprotocol.io/specification/
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createMcpServer } from './mcp.js';

/** Timeout (ms) for each tool call routed through the in-process bridge. */
const TOOL_CALL_TIMEOUT_MS = 25_000;

/** MCP protocol version advertised in every response. */
const MCP_PROTOCOL_VERSION = '2025-11-25';

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// ─── In-process bridge ────────────────────────────────────────────────────────

/**
 * Create a (server, client) pair connected via in-memory transports.
 * Both transports are closed after the call resolves.
 */
async function withBridgedClient(
  userId: number | undefined,
  authInfo: AuthInfo | undefined,
  fn: (client: Client) => Promise<unknown>,
): Promise<unknown> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const mcpServer = createMcpServer({ userId });

  const client = new Client(
    { name: 'worker-bridge', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
    await mcpServer.close().catch(() => undefined);
  }
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

/**
 * Dispatch a single parsed JSON-RPC message.
 * Returns the response object (never throws).
 */
async function dispatch(
  msg: JsonRpcRequest,
  authInfo: AuthInfo | undefined,
): Promise<JsonRpcResponse> {
  const id = msg.id ?? null;
  const userId = (authInfo?.extra as Record<string, unknown> | undefined)?.userId as number | undefined;

  try {
    switch (msg.method) {
      // ── initialize ──────────────────────────────────────────────────────────
      case 'initialize': {
        return ok(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: {
            name: 'memron',
            version: '1.0.0',
          },
          instructions: [
            'Memron MCP Server — Sovereign memory backbone for AI agents.',
            '',
            'Available Core Verbs:',
            '  memory_store    — Store context, knowledge, clips, facts, or preferences',
            '  memory_recall   — Recall memories via hybrid RRF vector, BM25, graph, pinned rules',
            '  memory_manage   — Mutate memories (update, pin, unpin, triage, delete, feedback)',
            '  memory_validate — Pre-flight guardrail check against contradictions & failure patterns',
            '',
            'Authentication: OAuth 2.1 + PKCE or Memron API key as bearer token.',
          ].join('\n'),
        });
      }

      // ── notifications/initialized — no response needed (notification) ───────
      case 'notifications/initialized': {
        // Notifications do NOT have an id; return a sentinel that the caller
        // will filter out when building the final response array.
        return { jsonrpc: '2.0', id: null, result: '__notification__' };
      }

      // ── ping ────────────────────────────────────────────────────────────────
      case 'ping': {
        return ok(id, {});
      }

      // ── tools/list ──────────────────────────────────────────────────────────
      case 'tools/list': {
        const result = await withTimeout(
          withBridgedClient(userId, authInfo, (client) => client.listTools()),
          TOOL_CALL_TIMEOUT_MS,
          'tools/list timed out',
        );
        return ok(id, result);
      }

      // ── tools/call ──────────────────────────────────────────────────────────
      case 'tools/call': {
        const params = msg.params as { name: string; arguments?: Record<string, unknown> } | undefined;
        if (!params?.name) {
          return err(id, -32602, 'Invalid params: missing tool name');
        }
        const result = await withTimeout(
          withBridgedClient(userId, authInfo, (client) =>
            client.callTool({ name: params.name, arguments: params.arguments ?? {} }),
          ),
          TOOL_CALL_TIMEOUT_MS,
          `Tool call "${params.name}" timed out`,
        );
        return ok(id, result);
      }

      // ── resources/list ──────────────────────────────────────────────────────
      case 'resources/list': {
        return ok(id, { resources: [] });
      }

      // ── prompts/list ────────────────────────────────────────────────────────
      case 'prompts/list': {
        return ok(id, { prompts: [] });
      }

      // ── unknown method ───────────────────────────────────────────────────────
      default: {
        return err(id, -32601, `Method not found: ${msg.method}`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[worker-mcp] dispatch error (${msg.method}):`, message);
    return err(id, -32603, 'Internal error', message);
  }
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Handle a fully authenticated MCP request.
 *
 * `req`      — the original Fetch API Request (body not yet consumed).
 * `authInfo` — verified authentication info (contains userId in extra).
 *
 * Returns a plain `application/json` Response — no SSE streams.
 */
export async function handleStatelessMcpRequest(
  req: Request,
  authInfo: AuthInfo,
): Promise<Response> {
  const method = req.method.toUpperCase();

  // ── GET /mcp — SSE stream open from older clients; politely refuse ─────────
  if (method === 'GET') {
    return new Response(
      JSON.stringify({
        error: 'streaming_not_supported',
        error_description:
          'This edge deployment only supports stateless JSON-RPC POST requests. ' +
          'SSE streaming requires a persistent server (see https://docs.memron.ai/mcp).',
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          Allow: 'POST, DELETE, OPTIONS',
        },
      },
    );
  }

  // ── DELETE /mcp — session termination (stateless: always succeed) ──────────
  if (method === 'DELETE') {
    return new Response(null, { status: 200 });
  }

  // ── POST /mcp ──────────────────────────────────────────────────────────────
  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST, DELETE, OPTIONS' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error: invalid JSON body');
  }

  // ── Batch request ──────────────────────────────────────────────────────────
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return jsonRpcError(null, -32600, 'Invalid Request: empty batch');
    }
    const responses = await Promise.all(
      body.map((msg) => dispatch(msg as JsonRpcRequest, authInfo)),
    );
    // Filter out notification sentinels (no id, result === '__notification__')
    const filtered = responses.filter((r) => r.result !== '__notification__');
    return jsonResponse(filtered.length === 1 ? filtered[0] : filtered);
  }

  // ── Single request ─────────────────────────────────────────────────────────
  const msg = body as JsonRpcRequest;
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || !msg.method) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  // Notifications (no id) — process but return 202 with empty body
  if (msg.id === undefined && msg.method.startsWith('notifications/')) {
    await dispatch(msg, authInfo).catch(() => undefined);
    return new Response(null, { status: 202 });
  }

  const response = await dispatch(msg, authInfo);

  // Filter out pure notifications from single dispatch
  if (response.result === '__notification__') {
    return new Response(null, { status: 202 });
  }

  return jsonResponse(response);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
    },
  });
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): Response {
  return jsonResponse(err(id, code, message), 400);
}
