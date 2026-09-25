/**
 * MCP Server Factory — Creates a configured McpServer instance with all tools.
 *
 * Each MCP session gets its own McpServer instance (required by the SDK).
 * Tools are stateless — they read user context from authInfo on each call.
 *
 * When auto-ingest is enabled, `server.tool()` is proxied to automatically
 * record tool calls and results into the conversation collector.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';
import { config } from './config.js';
import * as collector from './lib/conversation-collector.js';
import { indexStoredMemoryInGraph } from './lib/memory-graph.js';

/**
 * Mutable session context — populated after the transport is initialized.
 * Passed by reference so that the proxy captures the session ID once it's known.
 */
export interface SessionContext {
  sessionId?: string;
  userId?: number;
}

/**
 * Create a fully configured MCP server with all tools registered.
 *
 * When a SessionContext is provided and auto-ingest is enabled, every tool
 * handler is wrapped to record the call and result into the conversation
 * collector for later analysis.
 */
export function createMcpServer(ctx?: SessionContext): McpServer {
  const server = new McpServer(
    {
      name: 'memron',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions: [
        'Memron MCP Server — Sovereign memory backbone for AI agents.',
        '',
        'Available Core Verbs:',
        '  memory_store    — Store context, knowledge, clips, facts, or preferences into Inbox',
        '  memory_recall   — Recall memories via hybrid RRF vector, BM25, graph, and pinned rules',
        '  memory_manage   — Mutate existing memories (update, pin, unpin, triage, delete, feedback)',
        '  memory_validate — Pre-flight guardrail check against contradictions & failure patterns',
        '',
        'Authentication: OAuth 2.1 + PKCE or Memron API key as bearer token.',
      ].join('\n'),
    },
  );

  // Proxy server.tool() to wrap handlers with auto-capture
  if (config.autoIngest.enabled && ctx) {
    const originalToolFn = server.tool;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).tool = function (this: McpServer, ...toolArgs: any[]) {
      // Detect the overload: the last arg is always the handler callback
      const lastIdx = toolArgs.length - 1;
      const handler = toolArgs[lastIdx];
      const toolName: string = toolArgs[0];

      if (typeof handler !== 'function' || collector.isExcludedTool(toolName)) {
        return originalToolFn.apply(this, toolArgs as any);
      }

      // Wrap the handler
      const wrappedHandler = async (...handlerArgs: any[]) => {
        const result = await handler(...handlerArgs);

        // Record — never block tool responses
        if (ctx.sessionId) {
          try {
            const args = handlerArgs[0]; // first arg is the parsed params
            const userId = (handlerArgs[1] as any)?.authInfo?.extra?.userId ?? ctx.userId ?? null;
            collector.recordToolCall(ctx.sessionId, userId, toolName, args, result);
            // Do not wait for MCP session teardown for graph visibility. Many
            // clients keep one session open for hours; the durable episode
            // worker still runs later for richer analysis.
            if (typeof userId === 'number') {
              void indexStoredMemoryInGraph({
                userId,
                pointerId: `turn:${ctx.sessionId}:${Date.now()}`,
                title: `MCP ${toolName}`,
                content: `${JSON.stringify(args)}\n${JSON.stringify(result)}`,
              }).catch(error => {
                console.warn('[MCP] immediate graph indexing failed:', error instanceof Error ? error.message : error);
              });
            }
          } catch {
            // Never propagate recording errors
          }
        }

        return result;
      };

      toolArgs[lastIdx] = wrappedHandler;
      return originalToolFn.apply(this, toolArgs as any);
    };
  }

  registerAllTools(server);

  return server;
}
