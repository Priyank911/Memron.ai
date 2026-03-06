'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Plus, Upload, RefreshCw, Key, Settings,
  LayoutDashboard, Database, Activity, Bell, Globe,
  Zap, Moon, Sun, LogOut, Copy, Hash,
} from 'lucide-react';

interface CmdItem {
  id: string;
  icon: React.ComponentType<any>;
  label: string;
  description?: string;
  shortcut?: string;
  category: string;
  action?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (page: string) => void;
  onRefresh?: () => void;
  onCreateBucket?: () => void;
  onToggleTheme?: () => void;
  onSignOut?: () => void;
  memories?: { id: string; title: string; bucket: string }[];
  buckets?: { slug: string; name: string; memoryCount: number }[];
  stats?: { totalMemories: number; totalTokens: number };
}

export function CommandPalette({
  open, onClose, onNavigate, onRefresh, onCreateBucket,
  onToggleTheme, onSignOut, memories = [], buckets = [], stats,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build commands list
  const commands = useMemo<CmdItem[]>(() => {
    const nav = (page: string) => () => { onNavigate?.(page); onClose(); };
    const items: CmdItem[] = [
      // Quick actions
      { id: 'refresh', icon: RefreshCw, label: 'Refresh data', description: 'Reload all dashboard data', shortcut: 'Ctrl R', category: 'Actions', action: () => { onRefresh?.(); onClose(); } },
      { id: 'create-bucket', icon: Plus, label: 'Create new bucket', description: 'Add a new memory bucket', shortcut: 'Ctrl B', category: 'Actions', action: () => { onCreateBucket?.(); onClose(); } },
      { id: 'copy-stats', icon: Copy, label: 'Copy stats summary', description: `${stats?.totalMemories ?? 0} memories, ${stats?.totalTokens?.toLocaleString() ?? 0} tokens`, category: 'Actions', action: () => { navigator.clipboard.writeText(`Memories: ${stats?.totalMemories ?? 0}, Tokens: ${stats?.totalTokens ?? 0}`); onClose(); } },
      // Navigation
      { id: 'nav-dashboard', icon: LayoutDashboard, label: 'Go to Dashboard', description: 'Overview & analytics', category: 'Navigation', action: nav('dashboard') },
      { id: 'nav-memories', icon: Database, label: 'Go to Memories', description: 'Browse all stored memories', category: 'Navigation', action: nav('memories') },
      { id: 'nav-playground', icon: Zap, label: 'Go to Playground', description: 'Test your MCP connection', category: 'Navigation', action: nav('playground') },
      { id: 'nav-graph', icon: Activity, label: 'Go to Graph Memory', description: 'Visualize memory relationships', category: 'Navigation', action: nav('graph-memory') },
      { id: 'nav-webhooks', icon: Globe, label: 'Go to Webhooks', description: 'Manage webhook endpoints', category: 'Navigation', action: nav('webhooks') },
      { id: 'nav-notifications', icon: Bell, label: 'Go to Notifications', description: 'View alerts and updates', category: 'Navigation', action: nav('notifications') },
      { id: 'nav-usage', icon: Activity, label: 'Go to Usage', description: 'Monitor usage & limits', category: 'Navigation', action: nav('usage') },
      { id: 'nav-keys', icon: Key, label: 'Manage API keys', description: 'View and rotate API keys', shortcut: '', category: 'Navigation', action: nav('config') },
      { id: 'nav-settings', icon: Settings, label: 'Open settings', description: 'Configure your workspace', shortcut: 'Ctrl ,', category: 'Navigation', action: nav('config') },
      // Theme
      { id: 'toggle-theme', icon: Moon, label: 'Toggle theme', description: 'Switch between dark and light', category: 'Settings', action: () => { onToggleTheme?.(); onClose(); } },
      { id: 'sign-out', icon: LogOut, label: 'Sign out', description: 'Log out of your account', category: 'Settings', action: () => { onSignOut?.(); onClose(); } },
    ];

    // Dynamic bucket items
    buckets.forEach(b => {
      items.push({
        id: `bucket-${b.slug}`,
        icon: Hash,
        label: b.name,
        description: `${b.memoryCount} memories`,
        category: 'Buckets',
      });
    });

    return items;
  }, [onNavigate, onRefresh, onCreateBucket, onToggleTheme, onSignOut, onClose, stats, buckets]);

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, CmdItem[]>();
    filtered.forEach(c => {
      const list = map.get(c.category) || [];
      list.push(c);
      map.set(c.category, list);
    });
    return map;
  }, [filtered]);

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item?.action) item.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, activeIdx, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('.db-cmd-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="db-cmd-overlay" onClick={onClose}>
      <div className="db-cmd-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="db-cmd-search">
          <Search size={16} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search memories, commands, settings..."
            className="db-cmd-input"
          />
          <kbd className="db-kbd">ESC</kbd>
        </div>
        <div className="db-cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="db-cmd-empty">
              <Search size={18} />
              <span>No results for &ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="db-cmd-group">
                <div className="db-cmd-group-label">{category}</div>
                {items.map(c => {
                  flatIdx++;
                  const idx = flatIdx;
                  return (
                    <button
                      key={c.id}
                      className={`db-cmd-item${idx === activeIdx ? ' active' : ''}`}
                      onClick={() => c.action?.()}
                      onMouseEnter={() => setActiveIdx(idx)}
                    >
                      <c.icon size={15} />
                      <div className="db-cmd-item-text">
                        <span className="db-cmd-item-label">{c.label}</span>
                        {c.description && <span className="db-cmd-item-desc">{c.description}</span>}
                      </div>
                      {c.shortcut && <kbd className="db-kbd sm">{c.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="db-cmd-footer">
          <span className="db-cmd-hint"><kbd className="db-kbd sm">&uarr;&darr;</kbd> navigate</span>
          <span className="db-cmd-hint"><kbd className="db-kbd sm">Enter</kbd> select</span>
          <span className="db-cmd-hint"><kbd className="db-kbd sm">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
