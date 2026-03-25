'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, Share2, Info } from 'lucide-react';
import { useNotifications } from '../_hooks/use-notifications';

interface NotificationBellProps {
  enabled?: boolean;
}

export function NotificationBell({ enabled = true }: NotificationBellProps) {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'bucket_share': return <Share2 size={14} className="db-notif-icon-share" />;
      default: return <Info size={14} className="db-notif-icon-info" />;
    }
  };

  // Initialize with current timestamp (lazy initialization to avoid unnecessary renders)
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Update timestamp every minute for "X mins ago" display
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const relativeTime = (isoStr: string) => {
    const diff = now - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="db-notif-wrap" ref={panelRef}>
      <button
        className={`db-notif-bell${unreadCount > 0 ? ' has-unread' : ''}`}
        onClick={() => setOpen((p) => !p)}
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="db-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="db-notif-panel">
          <div className="db-notif-panel-header">
            <span className="db-notif-panel-title">Notifications</span>
            <div className="db-notif-panel-actions">
              {unreadCount > 0 && (
                <button className="db-notif-mark-read" onClick={markAllRead} title="Mark all read">
                  <CheckCheck size={14} />
                </button>
              )}
              <button className="db-notif-close" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="db-notif-list">
            {notifications.length === 0 ? (
              <div className="db-notif-empty">
                <Bell size={20} />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`db-notif-item${n.isRead ? '' : ' unread'}`}>
                  <div className="db-notif-item-icon">{getIcon(n.type)}</div>
                  <div className="db-notif-item-body">
                    <span className="db-notif-item-title">{n.title}</span>
                    {n.body && <span className="db-notif-item-desc">{n.body}</span>}
                    <span className="db-notif-item-time">{relativeTime(n.createdAt)}</span>
                  </div>
                  {!n.isRead && <span className="db-notif-item-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
