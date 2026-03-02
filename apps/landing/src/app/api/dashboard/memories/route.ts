import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserFromPostgres } from '@/lib/postgres';
import { query } from '@/lib/postgres';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await query(
      `SELECT id, pointer_id, bucket, title, tags, token_count, metadata, created_at, updated_at
       FROM memories
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 100`,
      [dbUser.id],
    );

    const memories = result.rows.map((r: any) => ({
      id: r.pointer_id,
      bucket: r.bucket,
      title: r.title || '(untitled)',
      tags: r.tags || [],
      tokenCount: r.token_count,
      metadata: r.metadata || {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return NextResponse.json({ memories });
  } catch (error: any) {
    console.error('[Dashboard API] Memories error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
