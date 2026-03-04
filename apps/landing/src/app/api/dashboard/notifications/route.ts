import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserFromPostgres,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
} from '@/lib/postgres';

/**
 * GET /api/dashboard/notifications — Get notifications + unread count
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromPostgres(clerkId);
    if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 });

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(user.id),
      getUnreadNotificationCount(user.id),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.notif_id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata,
        isRead: n.is_read,
        createdAt: n.created_at,
      })),
      unreadCount,
    });
  } catch (error: any) {
    console.error('[Notifications API] GET error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/notifications — Mark notifications as read
 *
 * Body: { notifIds?: string[] }
 * If notifIds is omitted, marks ALL as read.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromPostgres(clerkId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const notifIds = Array.isArray(body.notifIds) ? body.notifIds : undefined;

    await markNotificationsRead(user.id, notifIds);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Notifications API] PATCH error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
