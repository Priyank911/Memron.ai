import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  listSessions,
  getSessionMessages,
  deleteSession,
  searchHistory,
  getSessionTitle,
  updateSessionTitle,
  toggleSessionPin,
} from '@/lib/playground-history';

/**
 * GET /api/dashboard/playground/history
 *
 * Query params:
 *   ?action=list              — List all sessions (default)
 *   ?action=messages&sessionId=xxx  — Get messages for a session
 *   ?action=search&q=xxx&bucket=xxx — Semantic search over past Q&A
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';

    if (action === 'search') {
      const q = searchParams.get('q')?.trim();
      if (!q) return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
      const bucket = searchParams.get('bucket') || null;
      const results = await searchHistory(clerkId, q, bucket);
      return NextResponse.json({ ok: true, results });
    }

    if (action === 'messages') {
      const sessionId = searchParams.get('sessionId')?.trim();
      if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
      const messages = await getSessionMessages(clerkId, sessionId);
      return NextResponse.json({ ok: true, messages });
    }

    if (action === 'title') {
      const sessionId = searchParams.get('sessionId')?.trim();
      if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
      const title = await getSessionTitle(clerkId, sessionId);
      return NextResponse.json({ ok: true, title });
    }

    // Default: list sessions
    const sessions = await listSessions(clerkId);
    return NextResponse.json({ ok: true, sessions });
  } catch (error: unknown) {
    console.error('[History API] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/playground/history?sessionId=xxx
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId')?.trim();
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

    const deleted = await deleteSession(clerkId, sessionId);
    return NextResponse.json({ ok: true, deleted });
  } catch (error: unknown) {
    console.error('[History API] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/playground/history
 * Body: { sessionId, action: 'title' | 'pin', title?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

    if (body.action === 'title') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
      const ok = await updateSessionTitle(clerkId, sessionId, title);
      return NextResponse.json({ ok });
    }

    if (body.action === 'pin') {
      const pinned = await toggleSessionPin(clerkId, sessionId);
      return NextResponse.json({ ok: true, pinned });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[History API] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
