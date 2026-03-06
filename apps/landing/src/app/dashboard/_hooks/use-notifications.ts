'use client';

/**
 * Global Notification Store — singleton shared by all components.
 *
 * Production pattern: ONE fetch loop for the entire dashboard.
 * Multiple components (NotificationBell, Notifications page, Sidebar badge)
 * can subscribe without triggering additional API calls.
 *
 * Features:
 *   - Single fetch loop (no duplicate requests across components)
 *   - Exponential backoff: 30s → 60s → 120s → 180s (slows down when idle)
 *   - Resets to 30s when new notifications arrive
 *   - Pauses when tab is hidden (visibility API)
 *   - Client-side dedup (only one in-flight request at a time)
 *   - Abort on unmount (no zombie requests)
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

interface NotifState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  lastFetchedAt: number;
}

// ─── Singleton Store ─────────────────────────────────────────

const MIN_INTERVAL = 30_000;   // 30s — baseline
const MAX_INTERVAL = 180_000;  // 3min — max backoff
const BACKOFF_FACTOR = 2;

let state: NotifState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  lastFetchedAt: 0,
};

let listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentInterval = MIN_INTERVAL;
let subscriberCount = 0;
let inflightRequest: Promise<void> | null = null;
let abortController: AbortController | null = null;
let lastUnreadCount = 0;

function emit() {
  listeners.forEach((fn) => fn());
}

function setState(partial: Partial<NotifState>) {
  state = { ...state, ...partial };
  emit();
}

async function fetchNotifications() {
  // Client-side dedup: skip if already in-flight
  if (inflightRequest) return inflightRequest;

  // Skip if tab is hidden
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  abortController?.abort();
  abortController = new AbortController();

  const promise = (async () => {
    try {
      setState({ loading: state.notifications.length === 0 });

      const res = await fetch('/api/dashboard/notifications', {
        credentials: 'include',
        signal: abortController!.signal,
      });

      if (!res.ok) {
        // If rate-limited (429), back off aggressively
        if (res.status === 429) {
          currentInterval = MAX_INTERVAL;
        }
        return;
      }

      const data = await res.json();
      const notifications: Notification[] = data.notifications || [];
      const unreadCount: number = data.unreadCount || 0;

      setState({
        notifications,
        unreadCount,
        loading: false,
        lastFetchedAt: Date.now(),
      });

      // Adaptive interval: if unread count changed → new activity → reset to fast
      // If unchanged → slow down (exponential backoff)
      if (unreadCount !== lastUnreadCount) {
        currentInterval = MIN_INTERVAL;
      } else {
        currentInterval = Math.min(currentInterval * BACKOFF_FACTOR, MAX_INTERVAL);
      }
      lastUnreadCount = unreadCount;
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setState({ loading: false });
    } finally {
      inflightRequest = null;
    }
  })();

  inflightRequest = promise;
  return promise;
}

function scheduleNext() {
  if (pollTimer) clearTimeout(pollTimer);
  if (subscriberCount <= 0) return;

  pollTimer = setTimeout(async () => {
    await fetchNotifications();
    scheduleNext();
  }, currentInterval);
}

function startPolling() {
  fetchNotifications().then(scheduleNext);
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  abortController?.abort();
  inflightRequest = null;
}

// Visibility handler — pause/resume polling
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && subscriberCount > 0) {
      // Tab became visible — fetch immediately and resume
      currentInterval = MIN_INTERVAL; // reset backoff on refocus
      fetchNotifications().then(scheduleNext);
    } else {
      stopPolling();
    }
  });
}

// ─── React Hook ──────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;

  // First subscriber — start polling
  if (subscriberCount === 1) {
    startPolling();
  }

  return () => {
    listeners.delete(listener);
    subscriberCount--;

    // Last subscriber — stop polling
    if (subscriberCount === 0) {
      stopPolling();
    }
  };
}

function getSnapshot(): NotifState {
  return state;
}

/**
 * Hook to consume notification state from anywhere in the dashboard.
 * Multiple callers share the SAME fetch loop — zero extra API calls.
 */
export function useNotifications() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/dashboard/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setState({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      });
      lastUnreadCount = 0;
    } catch { /* ignore */ }
  }, []);

  const refetch = useCallback(() => {
    currentInterval = MIN_INTERVAL;
    fetchNotifications();
  }, []);

  return {
    notifications: snap.notifications,
    unreadCount: snap.unreadCount,
    loading: snap.loading,
    markAllRead,
    refetch,
  };
}
