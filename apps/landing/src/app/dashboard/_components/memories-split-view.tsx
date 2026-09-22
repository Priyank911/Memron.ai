'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Brain, BookOpen, Search, Filter,
  MoveRight, Pin, PinOff, Pencil, Trash2, Merge,
  Loader2, RefreshCw, X, Check,
  Globe, Tag, User, Link as LinkIcon, Clock,
} from 'lucide-react';

/* ── Types ── */
interface MemoryItem {
  id: string;
  pointerId: string;
  title: string;
  bucket: string;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  status: 'untriaged' | 'context' | 'knowledge';
  isPinned: boolean;
  source: 'membrow' | 'agent' | 'api' | 'manual';
  category?: string;
}

interface MemoriesSplitViewProps {
  orgId?: string | null;
}

const MEMBROW_CATEGORIES = ['Research', 'Tools', 'Agents', 'Models', 'Skills'];

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function categoryColor(cat: string): string {
  // Categories use the product accent; meaning comes from the label,
  // not a rainbow of unrelated AI-dashboard colours.
  return cat ? '#8fa8c5' : '#6e6e76';
}

export function MemoriesSplitView({ orgId }: MemoriesSplitViewProps) {
  const [tab, setTab] = useState<'inbox' | 'context' | 'knowledge'>('inbox');
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const orgParam = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
      const res = await fetch(`/api/dashboard/memories${orgParam}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const raw: any[] = data.memories || [];
      const mapped: MemoryItem[] = raw.map((r: any) => {
        const meta = r.metadata || {};
        const status: MemoryItem['status'] =
          r.status === 'context' || meta.status === 'context' ? 'context' :
          r.status === 'knowledge' || meta.status === 'knowledge' ? 'knowledge' : 'untriaged';
        const source: MemoryItem['source'] =
          (r.source || meta.source) === 'membrow' ? 'membrow' :
          meta.source === 'api' ? 'api' :
          meta.source === 'manual' ? 'manual' : 'agent';
        return {
          id: r.id,
          pointerId: r.id,
          title: r.title || '(untitled)',
          bucket: r.bucket || 'default',
          tags: r.tags || [],
          metadata: meta,
          createdAt: r.createdAt || '',
          updatedAt: r.updatedAt || r.createdAt || '',
          status,
          isPinned: Boolean(meta.is_pinned),
          source,
          category: meta.category || (MEMBROW_CATEGORIES.includes(meta.knowledge_type) ? meta.knowledge_type : undefined),
        };
      });
      setItems(mapped);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const tabItems = items.filter(m => {
    const matchesTab = m.status === (tab === 'inbox' ? 'untriaged' : tab);
    const matchesSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) || m.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  const inboxCount = items.filter(m => m.status === 'untriaged').length;

  const performAction = async (action: string, extra?: Record<string, any>) => {
    if (!selected) return;
    setActionLoading(action);
    try {
      const orgParam = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
      const res = await fetch(`/api/dashboard/triage${orgParam}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointerId: selected.pointerId, action, data: extra }),
      });
      if (res.ok) {
        showToast(
          action === 'move_to_context' ? 'Moved to Context ✓' :
          action === 'move_to_knowledge' ? 'Moved to Knowledge ✓' :
          action === 'pin' ? 'Pinned ✓' :
          action === 'unpin' ? 'Unpinned ✓' :
          action === 'discard' ? 'Discarded ✓' :
          action === 'edit' ? 'Saved ✓' : 'Done ✓'
        );
        await fetchMemories();
        if (action === 'discard' || action === 'move_to_context' || action === 'move_to_knowledge') {
          setSelected(null);
        }
      } else {
        const error = await res.json().catch(() => ({}));
        showToast(error.error || 'Action could not be completed');
      }
    } catch { /* ignore */ } finally {
      setActionLoading(null);
      setEditMode(false);
    }
  };

  return (
    <div className="mm-split-root">
      {/* Toast */}
      {toast && (
        <div className="mm-split-toast">
          <Check size={13} />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="mm-split-header">
        <div className="mm-split-header-left">
          <h1 className="mm-page-title">Memories</h1>
          <p className="mm-page-subtitle">Triage, organize, and review all your memory items.</p>
        </div>
        <button className="mm-btn-icon-sm" onClick={fetchMemories} title="Refresh">
          <RefreshCw size={14} className={loading ? 'mm-spin' : ''} />
        </button>
      </div>

      {/* Tab bar + search */}
      <div className="mm-split-tabs-row">
        <div className="mm-split-tabs">
          <button
            className={`mm-split-tab${tab === 'inbox' ? ' active' : ''}`}
            onClick={() => { setTab('inbox'); setSelected(null); }}
          >
            <Inbox size={14} />
            <span>Inbox</span>
            {inboxCount > 0 && <span className="mm-split-tab-badge">{inboxCount}</span>}
          </button>
          <button
            className={`mm-split-tab${tab === 'context' ? ' active' : ''}`}
            onClick={() => { setTab('context'); setSelected(null); }}
          >
            <Brain size={14} />
            <span>Context</span>
          </button>
          <button
            className={`mm-split-tab${tab === 'knowledge' ? ' active' : ''}`}
            onClick={() => { setTab('knowledge'); setSelected(null); }}
          >
            <BookOpen size={14} />
            <span>Knowledge</span>
          </button>
        </div>
        <div className="mm-split-search-wrap">
          <Search size={13} className="mm-split-search-icon" />
          <input
            className="mm-split-search"
            placeholder="Search memories…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="mm-split-search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Split panel */}
      <div className="mm-split-body">
        {/* LEFT: List */}
        <div className="mm-split-list">
          {loading ? (
            <div className="mm-split-empty">
              <Loader2 size={22} className="mm-spin" />
              <p>Loading…</p>
            </div>
          ) : tabItems.length === 0 ? (
            <div className="mm-split-empty">
              {tab === 'inbox' ? <Inbox size={28} strokeWidth={1.2} className="mm-empty-icon-svg" /> :
               tab === 'context' ? <Brain size={28} strokeWidth={1.2} className="mm-empty-icon-svg" /> :
               <BookOpen size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />}
              <p>No {tab} memories{search ? ' matching your search' : ''}</p>
            </div>
          ) : (
            tabItems.map(item => (
              <button
                key={item.id}
                className={`mm-split-list-item${selected?.id === item.id ? ' active' : ''}${item.isPinned ? ' pinned' : ''}`}
                onClick={() => { setSelected(item); setEditMode(false); }}
              >
                <div className="mm-split-list-top">
                  <span className="mm-split-list-title">{item.title}</span>
                  {item.isPinned && <Pin size={11} className="mm-split-pin-icon" />}
                </div>
                <div className="mm-split-list-meta">
                  <span className={`mm-split-source-badge mm-split-source-${item.source}`}>
                    {item.source === 'membrow' ? 'Membrow' :
                     item.source === 'agent' ? 'Agent' :
                     item.source === 'api' ? 'API' : 'Manual'}
                  </span>
                  <span className="mm-split-list-time">{relativeTime(item.updatedAt || item.createdAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* RIGHT: Detail panel */}
        <div className={`mm-split-detail${selected ? ' has-item' : ''}`}>
          {!selected ? (
            <div className="mm-split-empty">
              <Filter size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <p>Select a memory to view details</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="mm-split-detail-head">
                <div className="mm-split-detail-badges">
                  {selected.category && (
                    <span
                      className="mm-split-cat-badge"
                      style={{ background: `${categoryColor(selected.category)}18`, color: categoryColor(selected.category), borderColor: `${categoryColor(selected.category)}30` }}
                    >
                      {selected.category}
                    </span>
                  )}
                  <span className={`mm-split-status-badge mm-split-status-${selected.status}`}>
                    {selected.status}
                  </span>
                </div>
                {!editMode ? (
                  <h2 className="mm-split-detail-title">{selected.title}</h2>
                ) : (
                  <input
                    className="mm-split-edit-input"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    autoFocus
                  />
                )}
              </div>

              {/* Membrow metadata grid (if from membrow) */}
              {selected.source === 'membrow' && (
                <div className="mm-split-meta-grid">
                  <div className="mm-split-meta-row">
                    <Globe size={12} className="mm-split-meta-icon" />
                    <span className="mm-split-meta-label">Platform</span>
                    <span className="mm-split-meta-val">{selected.metadata.platform || selected.metadata.url?.split('/')[2] || '—'}</span>
                  </div>
                  {selected.metadata.author && (
                    <div className="mm-split-meta-row">
                      <User size={12} className="mm-split-meta-icon" />
                      <span className="mm-split-meta-label">Author</span>
                      <span className="mm-split-meta-val">{selected.metadata.author}</span>
                    </div>
                  )}
                  {selected.metadata.url && (
                    <div className="mm-split-meta-row">
                      <LinkIcon size={12} className="mm-split-meta-icon" />
                      <span className="mm-split-meta-label">Source URL</span>
                      <a className="mm-split-meta-link" href={selected.metadata.url} target="_blank" rel="noopener noreferrer">
                        {selected.metadata.url.slice(0, 50)}{selected.metadata.url.length > 50 ? '…' : ''}
                      </a>
                    </div>
                  )}
                  <div className="mm-split-meta-row">
                    <Clock size={12} className="mm-split-meta-icon" />
                    <span className="mm-split-meta-label">Captured</span>
                    <span className="mm-split-meta-val">{relativeTime(selected.createdAt)}</span>
                  </div>
                </div>
              )}

              {/* Tags */}
              {selected.tags.length > 0 && (
                <div className="mm-split-tags">
                  <Tag size={12} />
                  {selected.tags.map(t => (
                    <span key={t} className="mm-split-tag">{t}</span>
                  ))}
                </div>
              )}

              {/* Bucket info */}
              <div className="mm-split-bucket-row">
                <span className="mm-split-bucket-label">Bucket</span>
                <span className="mm-split-bucket-val">{selected.bucket}</span>
              </div>

              {/* Triage action bar */}
              <div className="mm-split-actions">
                {/* Primary actions (context/knowledge) */}
                <div className="mm-split-actions-primary">
                  {selected.status !== 'context' && (
                    <button
                      className="mm-split-action-btn"
                      onClick={() => performAction('move_to_context')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === 'move_to_context' ? <Loader2 size={13} className="mm-spin" /> : <Brain size={13} />}
                      Move to Context
                    </button>
                  )}
                  {selected.status !== 'knowledge' && (
                    <button
                      className={`mm-split-action-btn${selected.source === 'membrow' ? ' membrow-accent' : ''}`}
                      onClick={() => performAction('move_to_knowledge')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === 'move_to_knowledge' ? <Loader2 size={13} className="mm-spin" /> : <BookOpen size={13} />}
                      Move to Knowledge
                    </button>
                  )}
                </div>

                {/* Secondary actions */}
                <div className="mm-split-actions-secondary">
                  <button
                    className="mm-split-action-icon"
                    title={selected.isPinned ? 'Unpin' : 'Pin'}
                    onClick={() => performAction(selected.isPinned ? 'unpin' : 'pin')}
                    disabled={!!actionLoading}
                  >
                    {selected.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    className="mm-split-action-icon"
                    title={editMode ? 'Save' : 'Edit title'}
                    onClick={() => {
                      if (editMode) {
                        performAction('edit', { title: editTitle });
                      } else {
                        setEditTitle(selected.title);
                        setEditMode(true);
                      }
                    }}
                    disabled={!!actionLoading}
                  >
                    {editMode ? <Check size={14} /> : <Pencil size={14} />}
                  </button>
                  {editMode && (
                    <button
                      className="mm-split-action-icon"
                      title="Cancel edit"
                      onClick={() => setEditMode(false)}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    className="mm-split-action-icon mm-split-action-danger"
                    title="Discard"
                    onClick={() => performAction('discard')}
                    disabled={!!actionLoading}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
