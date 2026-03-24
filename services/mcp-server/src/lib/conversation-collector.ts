/**
 * Conversation Collector — Per-session buffer for auto-capturing MCP tool calls.
 *
 * Records tool calls as conversation messages, buffers them in memory,
 * periodically persists to DB, and flushes through the analysis pipeline
 * when a session ends.
 */

import type { ConversationMessage } from '@memron/analysis-engine';
import {
  upsertConversationHistory,
  markConversationIngested,
} from '../db/queries-analysis.js';
import { autoIngest } from './auto-ingest.js';
import { config } from '../config.js';

/** Tools excluded from recording (already run pipeline or are diagnostic-only) */
const EXCLUDED_TOOLS = new Set([
  'memory_ingest',
  'memory_analyze',
  'system_health',
  'system_stats',
]);

interface ConversationBuffer {
  sessionId: string;
  userId: number | null;
  messages: ConversationMessage[];
  toolCallCount: number;
  /** Number of messages not yet persisted to DB */
  unpersisted: number;
  firstActivityAt: number;
  lastActivityAt: number;
}

/** Maximum buffer size to prevent unbounded memory growth */
const MAX_BUFFER_MESSAGES = 500;

const buffers = new Map<string, ConversationBuffer>();

/**
 * Check if a tool name should be excluded from recording.
 */
export function isExcludedTool(toolName: string): boolean {
  return EXCLUDED_TOOLS.has(toolName);
}

/**
 * Record a tool call and its result as conversation messages.
 */
export function recordToolCall(
  sessionId: string,
  userId: number | null,
  toolName: string,
  args: unknown,
  result: unknown,
): void {
  if (!config.autoIngest.enabled) return;
  if (EXCLUDED_TOOLS.has(toolName)) return;

  let buffer = buffers.get(sessionId);
  if (!buffer) {
    buffer = {
      sessionId,
      userId,
      messages: [],
      toolCallCount: 0,
      unpersisted: 0,
      firstActivityAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    buffers.set(sessionId, buffer);
  }

  // Update userId if we didn't have it before
  if (userId != null && buffer.userId == null) {
    buffer.userId = userId;
  }

  // Don't exceed max buffer size
  if (buffer.messages.length >= MAX_BUFFER_MESSAGES) return;

  const now = new Date().toISOString();

  // User message representing the tool call
  buffer.messages.push({
    role: 'user',
    content: `Tool call: ${toolName}\nArgs: ${JSON.stringify(args)}`,
    timestamp: now,
  });

  // Tool response
  const resultText = typeof result === 'string'
    ? result
    : JSON.stringify(result);

  buffer.messages.push({
    role: 'tool' as ConversationMessage['role'],
    content: resultText.slice(0, 10000), // Cap individual message size
    timestamp: now,
  });

  buffer.toolCallCount++;
  buffer.unpersisted += 2;
  buffer.lastActivityAt = Date.now();

  // Periodic DB persistence
  if (buffer.unpersisted >= config.autoIngest.persistEvery * 2) {
    persistBuffer(sessionId).catch((err) => {
      console.warn(`[Collector] Persist failed for ${sessionId}:`, err);
    });
  }
}

/**
 * Persist the current buffer to the database (incremental).
 */
async function persistBuffer(sessionId: string): Promise<void> {
  const buffer = buffers.get(sessionId);
  if (!buffer || buffer.unpersisted === 0) return;

  const newMessages = buffer.messages.slice(-buffer.unpersisted);
  const newCallCount = Math.floor(buffer.unpersisted / 2);
  buffer.unpersisted = 0;

  try {
    await upsertConversationHistory({
      sessionId: buffer.sessionId,
      userId: buffer.userId,
      messages: newMessages,
      toolCallCount: newCallCount,
    });
  } catch (err) {
    // Re-add unpersisted count so we retry next time
    buffer.unpersisted = newMessages.length;
    throw err;
  }
}

/**
 * Flush a session: persist remaining buffer to DB, run analysis pipeline if
 * threshold is met, mark as ingested. Fire-and-forget — errors are logged,
 * never propagated to callers.
 */
export async function flushSession(sessionId: string): Promise<void> {
  const buffer = buffers.get(sessionId);
  if (!buffer) return;

  buffers.delete(sessionId);

  try {
    // Persist any remaining messages
    if (buffer.unpersisted > 0) {
      const newMessages = buffer.messages.slice(-buffer.unpersisted);
      const newCallCount = Math.floor(buffer.unpersisted / 2);
      await upsertConversationHistory({
        sessionId: buffer.sessionId,
        userId: buffer.userId,
        messages: newMessages,
        toolCallCount: newCallCount,
      });
    }

    // Run analysis if we have enough tool calls and a valid user
    if (
      buffer.toolCallCount >= config.autoIngest.minCalls &&
      buffer.userId != null
    ) {
      const result = await autoIngest({
        sessionId: buffer.sessionId,
        userId: buffer.userId,
        messages: buffer.messages,
        useLLM: config.autoIngest.useLLM,
      });

      await markConversationIngested(buffer.sessionId);

      console.log(
        `[Collector] Flushed session ${sessionId}: ` +
        `${result.stats.episodes} episodes, ${result.stats.memories} memories, ` +
        `${result.stats.recipes} recipes, ${result.stats.entities} entities`
      );
    }
  } catch (err) {
    console.warn(`[Collector] Flush failed for session ${sessionId}:`, err);
  }
}

/**
 * Get the current buffer for a session (diagnostics).
 */
export function getBuffer(sessionId: string): ConversationBuffer | undefined {
  return buffers.get(sessionId);
}

/**
 * Flush all active sessions (used during shutdown).
 */
export async function flushAll(): Promise<void> {
  const sessionIds = [...buffers.keys()];
  for (const id of sessionIds) {
    await flushSession(id);
  }
}
