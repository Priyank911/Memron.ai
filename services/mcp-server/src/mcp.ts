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
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { registerAllTools } from './tools/index.js';
import { config } from './config.js';
import * as collector from './lib/conversation-collector.js';
import type { MemoryIndexQueue } from './lib/memory-index-queue.js';

/**
 * Mutable session context — populated after the transport is initialized.
 * Passed by reference so that the proxy captures the session ID once it's known.
 *
 * `authInfo` is set by the Cloudflare Worker's stateless bridge so that tool
 * handlers receive correct user identity even when called via InMemoryTransport
 * (which carries no HTTP auth headers).
 */
export interface SessionContext {
  sessionId?: string;
  userId?: number;
  authInfo?: AuthInfo;
  memoryIndexQueue?: MemoryIndexQueue;
}

/**
 * Create a fully configured MCP server with all tools registered.
 *
 * When a SessionContext is provided and auto-ingest is enabled, every tool
 * handler is wrapped to record the call and result into the conversation
 * collector for later analysis.
 *
 * When a SessionContext carries `authInfo`, every tool handler is also wrapped
 * to inject that authInfo into `extra` when the transport (e.g. InMemoryTransport)
 * does not supply it. This is required for the Cloudflare Worker stateless bridge.
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

  // Always proxy server.tool() when we have session context:
  //   1. Inject authInfo into extra when the transport doesn't supply it
  //      (Cloudflare Worker InMemoryTransport bridge — no HTTP auth layer)
  //   2. Wrap for auto-ingest recording when enabled
  const needsProxy = ctx && (ctx.authInfo !== undefined || (config.autoIngest.enabled && ctx.sessionId));

  if (needsProxy) {
    const originalToolFn = server.tool;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).tool = function (this: McpServer, ...toolArgs: any[]) {
      const lastIdx = toolArgs.length - 1;
      const handler = toolArgs[lastIdx];
      const toolName: string = toolArgs[0];

      if (typeof handler !== 'function') {
        return originalToolFn.apply(this, toolArgs as any);
      }

      const wrappedHandler = async (...handlerArgs: any[]) => {
        // ── Auth injection ─────────────────────────────────────────────────
        // The InMemoryTransport bridge (Cloudflare Worker) does not carry
        // HTTP auth headers, so extra.authInfo is undefined inside tool
        // handlers. Inject authInfo from the session context so that
        // getUserId(extra.authInfo) resolves correctly.
        if (ctx?.authInfo) {
          // The SDK normally supplies `extra` as the second callback
          // argument. In the Cloudflare InMemoryTransport bridge, some SDK
          // versions omit it for tools registered through overloads. Always
          // create the context when it is absent so the authenticated edge
          // request cannot become an anonymous tool call.
          if (!handlerArgs[1] || typeof handlerArgs[1] !== 'object') {
            handlerArgs[1] = { authInfo: ctx.authInfo };
          } else if (!handlerArgs[1].authInfo) {
            handlerArgs[1].authInfo = ctx.authInfo;
          }
        }

        const result = await handler(...handlerArgs);

        // ── Auto-ingest recording ──────────────────────────────────────────
        if (config.autoIngest.enabled && ctx?.sessionId && !collector.isExcludedTool(toolName)) {
          try {
            const args = handlerArgs[0];
            const userId = (handlerArgs[1] as any)?.authInfo?.extra?.userId ?? ctx.userId ?? null;
            collector.recordToolCall(ctx.sessionId, userId, toolName, args, result);
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

  registerAllTools(server, { queue: ctx?.memoryIndexQueue });

  return server;
}
