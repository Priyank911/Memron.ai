'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Plus, ChevronDown, ChevronRight, Check,
  Loader2, Copy, RefreshCw, Clock, GitBranch, Pencil,
  Play, RotateCcw, Sparkles, X,
} from 'lucide-react';

/* ── Types ── */
interface PromptVersion {
  id: string;
  versionNumber: number;
  promptText: string;
  changelog: string;
  createdAt: string;
  isActive: boolean;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: PromptVersion[];
}

interface PromptStudioViewProps {
  orgId?: string | null;
}

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PromptStudioView({ orgId }: PromptStudioViewProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PromptTemplate | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPromptText, setNewPromptText] = useState('You are a sovereign AI assistant powered by Memron. You have access to persistent memory and can recall past interactions to provide more personalized assistance.');
  const [addVersionOpen, setAddVersionOpen] = useState(false);
  const [newVersionText, setNewVersionText] = useState('');
  const [newVersionChangelog, setNewVersionChangelog] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const orgParam = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
      const res = await fetch(`/api/dashboard/prompts${orgParam}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const tpls: PromptTemplate[] = data.templates || [];
      setTemplates(tpls);
      if (tpls.length > 0 && !selected) {
        const first = tpls[0];
        setSelected(first);
        const active = first.versions.find(v => v.isActive) || first.versions[0] || null;
        setSelectedVersion(active);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setActionLoading('create_template');
    try {
      const res = await fetch('/api/dashboard/prompts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_template', name: newName, description: newDesc, promptText: newPromptText, changelog: 'Initial version' }),
      });
      if (res.ok) {
        showToast('Template created ✓');
        setCreateOpen(false);
        setNewName('');
        setNewDesc('');
        await fetchTemplates();
      }
    } catch { /* ignore */ } finally {
      setActionLoading(null);
    }
  };

  const addVersion = async () => {
    if (!selected || !newVersionText.trim()) return;
    setActionLoading('add_version');
    try {
      const res = await fetch('/api/dashboard/prompts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_version',
          templateId: selected.id,
          promptText: newVersionText,
          changelog: newVersionChangelog || 'New version',
        }),
      });
      if (res.ok) {
        showToast('Version added ✓');
        setAddVersionOpen(false);
        setNewVersionText('');
        setNewVersionChangelog('');
        await fetchTemplates();
      }
    } catch { /* ignore */ } finally {
      setActionLoading(null);
    }
  };

  const activateVersion = async (versionId: string) => {
    if (!selected) return;
    setActionLoading(`activate_${versionId}`);
    try {
      const res = await fetch('/api/dashboard/prompts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate_version', templateId: selected.id, versionId }),
      });
      if (res.ok) {
        showToast('Version activated ✓');
        await fetchTemplates();
      }
    } catch { /* ignore */ } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const selectTemplate = (tpl: PromptTemplate) => {
    setSelected(tpl);
    const active = tpl.versions.find(v => v.isActive) || tpl.versions[0] || null;
    setSelectedVersion(active);
    setAddVersionOpen(false);
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
          <h1 className="mm-page-title">Prompt Studio</h1>
          <p className="mm-page-subtitle">Manage and version your system prompt templates.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mm-btn-icon-sm" onClick={fetchTemplates} title="Refresh">
            <RefreshCw size={14} className={loading ? 'mm-spin' : ''} />
          </button>
          <button className="mm-btn-primary mm-btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> New Template
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mm-split-body">
        {/* LEFT: Template list */}
        <div className="mm-split-list">
          {loading && templates.length === 0 ? (
            <div className="mm-split-empty">
              <Loader2 size={22} className="mm-spin" />
              <p>Loading templates…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="mm-split-empty">
              <Terminal size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <p>No prompt templates yet</p>
              <button className="mm-btn-secondary mm-btn-sm" onClick={() => setCreateOpen(true)}>
                <Plus size={12} /> Create one
              </button>
            </div>
          ) : (
            templates.map(tpl => {
              const activeVer = tpl.versions.find(v => v.isActive) || tpl.versions[0];
              return (
                <button
                  key={tpl.id}
                  className={`mm-split-list-item${selected?.id === tpl.id ? ' active' : ''}`}
                  onClick={() => selectTemplate(tpl)}
                >
                  <div className="mm-split-list-top">
                    <span className="mm-split-list-title">{tpl.name}</span>
                    <span className="mm-ps-ver-count">{tpl.versions.length}v</span>
                  </div>
                  <div className="mm-split-list-meta">
                    {activeVer && (
                      <span className="mm-ps-active-badge">
                        <Check size={9} /> v{activeVer.versionNumber} active
                      </span>
                    )}
                    <span className="mm-split-list-time">{relativeTime(tpl.updatedAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* RIGHT: Template detail */}
        <div className={`mm-split-detail${selected ? ' has-item' : ''}`}>
          {!selected ? (
            <div className="mm-split-empty">
              <Terminal size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <p>Select a template to view and edit</p>
            </div>
          ) : (
            <>
              {/* Template header */}
              <div className="mm-split-detail-head">
                <h2 className="mm-split-detail-title">{selected.name}</h2>
                {selected.description && (
                  <p className="mm-split-detail-desc">{selected.description}</p>
                )}
              </div>

              {/* Version list */}
              <div className="mm-ps-versions">
                <div className="mm-ps-versions-head">
                  <span className="mm-ps-versions-label">
                    <GitBranch size={13} /> Versions
                  </span>
                  <button className="mm-btn-icon-sm" onClick={() => setAddVersionOpen(v => !v)} title="Add version">
                    <Plus size={13} />
                  </button>
                </div>

                {selected.versions.map(ver => {
                  const isExpanded = expandedVersions.has(ver.id);
                  return (
                    <div key={ver.id} className={`mm-ps-ver-row${ver.isActive ? ' active' : ''}`}>
                      <button
                        className="mm-ps-ver-toggle"
                        onClick={() => {
                          setExpandedVersions(prev => {
                            const s = new Set(prev);
                            s.has(ver.id) ? s.delete(ver.id) : s.add(ver.id);
                            return s;
                          });
                          setSelectedVersion(ver);
                        }}
                      >
                        <span className="mm-ps-ver-num">v{ver.versionNumber}</span>
                        {ver.isActive && <span className="mm-ps-active-dot" />}
                        <span className="mm-ps-ver-changelog">{ver.changelog}</span>
                        <span className="mm-ps-ver-time">
                          <Clock size={10} /> {relativeTime(ver.createdAt)}
                        </span>
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>

                      {isExpanded && (
                        <div className="mm-ps-ver-body">
                          <div className="mm-ps-prompt-wrap">
                            <pre className="mm-ps-prompt-text">{ver.promptText}</pre>
                            <button
                              className="mm-ps-copy-btn"
                              onClick={() => copyToClipboard(ver.promptText)}
                              title="Copy"
                            >
                              {copied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                          {!ver.isActive && (
                            <div className="mm-ps-ver-actions">
                              <button
                                className="mm-split-action-btn"
                                onClick={() => activateVersion(ver.id)}
                                disabled={!!actionLoading}
                              >
                                {actionLoading === `activate_${ver.id}` ? <Loader2 size={12} className="mm-spin" /> : <Play size={12} />}
                                Activate
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add version form */}
                {addVersionOpen && (
                  <div className="mm-ps-add-version">
                    <div className="mm-ps-add-head">
                      <Sparkles size={13} />
                      <span>New Version</span>
                      <button className="mm-btn-icon-sm" onClick={() => setAddVersionOpen(false)}><X size={12} /></button>
                    </div>
                    <textarea
                      className="mm-ps-textarea"
                      placeholder="Enter the system prompt text…"
                      value={newVersionText}
                      onChange={e => setNewVersionText(e.target.value)}
                      rows={6}
                    />
                    <input
                      className="mm-ps-input"
                      placeholder="Changelog (e.g. 'Added memory context block')"
                      value={newVersionChangelog}
                      onChange={e => setNewVersionChangelog(e.target.value)}
                    />
                    <button
                      className="mm-btn-primary mm-btn-sm"
                      onClick={addVersion}
                      disabled={!newVersionText.trim() || !!actionLoading}
                    >
                      {actionLoading === 'add_version' ? <Loader2 size={12} className="mm-spin" /> : <Plus size={12} />}
                      Add Version
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create template modal */}
      {createOpen && (
        <div className="mm-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="mm-modal mm-ps-modal" onClick={e => e.stopPropagation()}>
            <div className="mm-modal-head">
              <h3>New Prompt Template</h3>
              <button className="mm-btn-icon-sm" onClick={() => setCreateOpen(false)}><X size={15} /></button>
            </div>
            <div className="mm-modal-body">
              <div className="mm-modal-field">
                <label>Template Name</label>
                <input
                  className="mm-modal-input"
                  placeholder="e.g. Default System Prompt"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div className="mm-modal-field">
                <label>Description</label>
                <input
                  className="mm-modal-input"
                  placeholder="Short description (optional)"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>
              <div className="mm-modal-field">
                <label>Initial System Prompt</label>
                <textarea
                  className="mm-ps-textarea"
                  placeholder="Enter the system prompt…"
                  value={newPromptText}
                  onChange={e => setNewPromptText(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
            <div className="mm-modal-footer">
              <button className="mm-btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button
                className="mm-btn-primary"
                disabled={!newName.trim() || !!actionLoading}
                onClick={createTemplate}
              >
                {actionLoading === 'create_template' ? <><Loader2 size={13} className="mm-spin" /> Creating…</> : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
