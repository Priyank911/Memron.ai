'use client';

import type { ActivityItem } from './types';

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="db-card">
      <div className="db-card-header">
        <h3 className="db-card-title">Recent Activity</h3>
        <span className="db-card-badge">{items.length} total</span>
      </div>
      <div className="db-activity-list">
        {items.length === 0 ? (
          <div className="db-activity-empty">No recent activity</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="db-activity-item">
              <div className={`db-activity-dot ${it.status}`} />
              <div className="db-activity-body">
                <span className="db-activity-title">{it.title}</span>
                <span className="db-activity-desc">{it.desc}</span>
              </div>
              <span className="db-activity-time">{it.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
