'use client';

import { Trash2, Filter, RefreshCw } from 'lucide-react';
import type { MemoryRow } from './types';

interface MemoriesTableProps {
  memories: MemoryRow[];
  dateRange: string;
  categoryFilters: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

export function MemoriesTable({
  memories,
  dateRange,
  categoryFilters,
  activeCategory,
  onCategoryChange,
}: MemoriesTableProps) {
  return (
    <div className="db-memories">
      <div className="db-memories-header">
        <h2 className="db-section-title">Memories</h2>
        <div className="db-memories-header-right">
          <span className="db-memories-date">Pick a date range ▾</span>
          <div className="db-memories-range-pills">
            {['All Time', '1d', '7d', '30d'].map((r) => (
              <button key={r} className={`db-pill${dateRange === r ? ' active' : ''}`}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="db-memories-tabs">
        <button className={`db-memories-tab${activeCategory === 'Overview' ? ' active' : ''}`} onClick={() => onCategoryChange('Overview')}>
          <span className="db-memories-tab-icon">⊞</span> Overview
        </button>
        {categoryFilters.map((cat) => (
          <button
            key={cat}
            className={`db-memories-tab${activeCategory === cat ? ' active' : ''}`}
            onClick={() => onCategoryChange(cat)}
          >
            <span className="db-memories-tab-dot" style={{ background: catColor(cat) }} />
            {cat}
          </button>
        ))}

        <div className="db-memories-tab-actions">
          <button className="db-btn-ghost"><Filter size={13} /> Filters</button>
          <button className="db-btn-ghost"><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Table */}
      <div className="db-table-wrapper">
        <table className="db-table">
          <thead>
            <tr>
              <th><span className="db-th-icon">🕐</span> Time</th>
              <th><span className="db-th-icon">👤</span> Entities</th>
              <th><span className="db-th-icon">💬</span> Memory Content</th>
              <th><span className="db-th-icon">🏷</span> Categories</th>
              <th><span className="db-th-icon">⋯</span> Action</th>
            </tr>
          </thead>
          <tbody>
            {memories.length === 0 ? (
              <tr><td colSpan={5} className="db-table-empty">No memories found.</td></tr>
            ) : (
              memories.map((m) => (
                <tr key={m.id}>
                  <td className="db-table-time">{m.time}</td>
                  <td>
                    <span className="db-entity-badge">
                      <span className="db-entity-icon">👤</span>
                      {m.entity}
                    </span>
                  </td>
                  <td className="db-table-content">{m.content}</td>
                  <td>
                    <div className="db-cat-badges">
                      {m.categories.map((c) => (
                        <span key={c} className="db-cat-badge">{c}</span>
                      ))}
                      {m.categories.length > 1 && <span className="db-cat-more">+{m.categories.length - 1}</span>}
                    </div>
                  </td>
                  <td>
                    <button className="db-table-action" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function catColor(cat: string): string {
  const map: Record<string, string> = {
    'Professional Details': '#3b82f6',
    'Technology': '#f59e0b',
    'User Preferences': '#22c55e',
  };
  return map[cat] || '#71717a';
}
