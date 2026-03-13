/**
 * RAG Pipeline Orchestrator — Chains input guard → context builder → LLM.
 *
 * Single entry point for the playground API route.
 */

export { guardInput, type GuardResult } from './input-guard';
export {
  buildRAGContext,
  type RAGContext,
  type RetrievedMemory,
} from './context-builder';
export {
  generateAnswer,
  isGroqConfigured,
  type LLMRequest,
  type LLMResponse,
} from './llm-service';

import { guardInput } from './input-guard';
import { buildRAGContext } from './context-builder';
import { generateAnswer, type LLMResponse } from './llm-service';

// ─── Casual/greeting detection ───────────────────────────────

const GREETING_PATTERNS = /^\s*(h(i|ey|ello|owdy|ola)|yo|sup|what'?s\s*up|good\s*(morning|afternoon|evening|day)|gm|greetings|namaste|heya?|hii+|thanks?|thank\s*you|ok(ay)?|bye|goodbye|see\s*ya|cheers|welcome|nice|cool|great|awesome|wow|lol|haha|hehe|wassup|whaddup|how\s*are\s*you|how'?s\s*it\s*going|how\s*do\s*you\s*do|who\s*are\s*you|what\s*are\s*you|what\s*can\s*you\s*do|help|introduce\s*yourself)\s*[!?.]*\s*$/i;

function isCasualQuery(query: string): boolean {
  return GREETING_PATTERNS.test(query.trim());
}

// ─── Types ───────────────────────────────────────────────────

export interface PipelineInput {
  clerkId: string;
  rawQuery: string;
  bucket: string | null;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface PipelineResult {
  ok: boolean;
  rejection?: string;
  answer?: string;
  memories: Array<{
    id: string;
    bucket: string;
    title: string;
    tags: string[];
    tokenCount: number;
    score: number;
    content?: string;
    createdAt: string;
  }>;
  meta: {
    query: string;
    bucket: string | null;
    totalFound: number;
    model: string;
    tokensUsed: number;
    grounded: boolean;
    latencyMs: number;
  };
}

// ─── Pipeline ────────────────────────────────────────────────

export async function runRAGPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  // 1. Input validation & sanitization
  const guard = guardInput(input.rawQuery);
  if (!guard.ok) {
    return {
      ok: false,
      rejection: guard.rejection,
      memories: [],
      meta: {
        query: '',
        bucket: input.bucket,
        totalFound: 0,
        model: 'none',
        tokensUsed: 0,
        grounded: false,
        latencyMs: 0,
      },
    };
  }

  const query = guard.sanitized!;

  // 2. Check if this is a casual/greeting query that doesn't need memory retrieval
  const isConversational = isCasualQuery(query);

  // 3. Retrieve and rank memories (skip for greetings/casual chat)
  const ctx = isConversational
    ? { memories: [], query, bucket: input.bucket, totalFound: 0, contextText: '', hasRelevantData: false, pastQA: [] }
    : await buildRAGContext(input.clerkId, query, input.bucket);

  // 4. Generate grounded LLM answer
  let llm: LLMResponse;
  try {
    llm = await generateAnswer({
      query,
      contextText: ctx.contextText,
      hasRelevantData: ctx.hasRelevantData,
      bucket: input.bucket,
      memoryCount: ctx.memories.length,
      chatHistory: input.chatHistory,
    });
  } catch (err: any) {
    console.error('[RAG Pipeline] LLM error:', err.message);
    llm = {
      answer: 'An error occurred while generating an answer. Your memories were still retrieved successfully.',
      model: 'error',
      tokensUsed: 0,
      grounded: false,
      latencyMs: 0,
    };
  }

  // 5. Return combined result
  return {
    ok: true,
    answer: llm.answer,
    memories: ctx.memories.map((m) => ({
      id: m.id,
      bucket: m.bucket,
      title: m.title,
      tags: m.tags,
      tokenCount: m.tokenCount,
      score: m.score,
      content: m.content,
      createdAt: m.createdAt,
    })),
    meta: {
      query,
      bucket: ctx.bucket,
      totalFound: ctx.totalFound,
      model: llm.model,
      tokensUsed: llm.tokensUsed,
      grounded: llm.grounded,
      latencyMs: llm.latencyMs,
    },
  };
}
