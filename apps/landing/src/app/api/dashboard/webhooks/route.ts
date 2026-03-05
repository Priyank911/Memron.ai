import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supaQuery, resolveSupabaseUser } from '@/lib/supabase-read';

/**
 * GET /api/dashboard/webhooks — List user's webhook endpoints
 * POST /api/dashboard/webhooks — Create a new webhook endpoint
 * DELETE /api/dashboard/webhooks — Delete a webhook endpoint
 */

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) return NextResponse.json({ webhooks: [] });

    const { id: uid } = supaUser;

    const res = await supaQuery(
      `SELECT id, url, events, is_active, secret, created_at, last_triggered_at
       FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC`,
      [uid],
    );

    return NextResponse.json({
      webhooks: res.rows.map((w: any) => ({
        id: w.id,
        url: w.url,
        events: w.events || [],
        isActive: w.is_active,
        createdAt: w.created_at,
        lastTriggeredAt: w.last_triggered_at,
      })),
    });
  } catch (e: any) {
    // If table doesn't exist yet, return empty
    if (e.message?.includes('relation') || e.message?.includes('does not exist')) {
      return NextResponse.json({ webhooks: [] });
    }
    console.error('[Webhooks GET]', e.message);
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { url, events } = body;

    if (!url || !url.startsWith('https://')) {
      return NextResponse.json({ error: 'URL must start with https://' }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'At least one event is required' }, { status: 400 });
    }

    const validEvents = ['memory.created', 'memory.updated', 'memory.deleted', 'bucket.created', 'bucket.shared'];
    const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json({ error: `Invalid events: ${invalidEvents.join(', ')}` }, { status: 400 });
    }

    // Generate a signing secret
    const secret = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('')}`;

    const { id: uid } = supaUser;

    // Ensure table exists
    await supaQuery(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        url TEXT NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        secret TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_triggered_at TIMESTAMPTZ
      )
    `, []);

    const res = await supaQuery(
      `INSERT INTO webhooks (user_id, url, events, secret)
       VALUES ($1, $2, $3, $4)
       RETURNING id, url, events, is_active, secret, created_at`,
      [uid, url, events, secret],
    );

    const w = res.rows[0];
    return NextResponse.json({
      webhook: {
        id: w.id,
        url: w.url,
        events: w.events,
        isActive: w.is_active,
        secret: w.secret,
        createdAt: w.created_at,
      },
    });
  } catch (e: any) {
    console.error('[Webhooks POST]', e.message);
    return NextResponse.json({ error: e.message || 'Failed to create webhook' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { webhookId } = body;

    if (!webhookId) {
      return NextResponse.json({ error: 'webhookId is required' }, { status: 400 });
    }

    const { id: uid } = supaUser;

    await supaQuery(
      `DELETE FROM webhooks WHERE id = $1 AND user_id = $2`,
      [webhookId, uid],
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Webhooks DELETE]', e.message);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supaUser = await resolveSupabaseUser(clerkId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { webhookId, isActive } = body;

    if (!webhookId) {
      return NextResponse.json({ error: 'webhookId is required' }, { status: 400 });
    }

    const { id: uid } = supaUser;

    await supaQuery(
      `UPDATE webhooks SET is_active = $1 WHERE id = $2 AND user_id = $3`,
      [isActive, webhookId, uid],
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Webhooks PATCH]', e.message);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}
