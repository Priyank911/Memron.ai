import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import {
  getUserFromPostgres,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
} from '@/lib/postgres';
import { cachedQuery, checkRateLimit, invalidateEndpoint, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/dashboard/notifications — Get notifications + unread count
 * Protected by: auth + rate limiter + server-side cache (10s TTL).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(authUser.uid, 'notifications', CACHE_PROFILES.notifications);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter || 60_000) / 1000)) } },
      );
    }

    const cacheKey = `notifications:${authUser.uid}`;
    const data = await cachedQuery(cacheKey, async () => {
      const user = await getUserFromPostgres(authUser.uid);
      if (!user) return { notifications: [], unreadCount: 0 };

      const [notifications, unreadCount] = await Promise.all([
        getNotifications(user.id),
        getUnreadNotificationCount(user.id),
      ]);

      return {
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
      };
    }, CACHE_PROFILES.notifications);

    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Notifications API] GET:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/notifications — Mark notifications as read
 * Invalidates the notification cache so the next GET returns fresh data.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromPostgres(authUser.uid);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const notifIds = Array.isArray(body.notifIds) ? body.notifIds : undefined;

    await markNotificationsRead(user.id, notifIds);

    // Invalidate the cache so next GET is fresh
    invalidateEndpoint(authUser.uid, 'notifications');

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Notifications API] PATCH:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
