import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';
import { runRAGPipeline, isGroqConfigured } from '@/lib/rag';
import { saveInteraction } from '@/lib/playground-history';

/**
 * POST /api/dashboard/playground — RAG + LLM pipeline
 *
 * Body: { query: string, bucket?: string, sessionId?: string }
 * Returns: { ok, answer?, memories, meta, rejection? }
 */

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(clerkId, 'playground', CACHE_PROFILES.memories);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 60_000) / 1000)) } },
      );
    }

    const body = await req.json();
    const rawQuery = typeof body.query === 'string' ? body.query : '';
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() || null : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : `s_${Date.now()}`;
    const chatHistory = Array.isArray(body.chatHistory)
      ? body.chatHistory
          .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
          .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 2000) }))
          .slice(-20)
      : [];

    if (!rawQuery.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const result = await runRAGPipeline({ clerkId, rawQuery, bucket, chatHistory });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        rejection: result.rejection,
        memories: [],
        meta: result.meta,
      }, { status: 400 });
    }

    console.log(
      `[Playground] bucket=${bucket || 'all'} memories=${result.memories.length} model=${result.meta.model} tokens=${result.meta.tokensUsed} latency=${result.meta.latencyMs}ms`,
    );

    // Persist Q&A interaction with embedding and generate title
    let generatedTitle: string | undefined;
    try {
      const saveResult = await saveInteraction({
        clerkId,
        sessionId,
        bucket,
        query: rawQuery.trim(),
        answer: result.answer || '',
        memoryIds: result.memories.map(m => m.id),
        tokensUsed: result.meta.tokensUsed,
        model: result.meta.model,
        latencyMs: result.meta.latencyMs,
      });
      generatedTitle = saveResult.title;
    } catch (err: any) {
      console.warn('[Playground] History save failed:', err.message);
    }

    return NextResponse.json({
      ok: true,
      answer: result.answer,
      memories: result.memories,
      meta: result.meta,
      llmConfigured: isGroqConfigured(),
      ...(generatedTitle ? { title: generatedTitle } : {}),
    });
  } catch (error: unknown) {
    console.error('[Playground API] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
