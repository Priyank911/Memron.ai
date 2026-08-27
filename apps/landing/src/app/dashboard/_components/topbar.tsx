'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Building2, ChevronDown, Copy, FolderOpen, Search, Check,
  RefreshCw, Settings, ExternalLink,
} from 'lucide-react';
import { NotificationBell } from './notification-bell';
import type { OrgInfo } from './types';

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isOwner: boolean;
}

interface TopbarProps {
  org: OrgInfo | null;
  workspaces: WorkspaceItem[];
  onSelectWorkspace: (ws: WorkspaceItem) => void;
  onCreateWorkspace: (name: string, description?: string) => Promise<void>;
  buckets: { id: string; name: string; slug: string; memoryCount: number }[];
  selectedBucket: string | null;
  onSelectBucket: (slug: string | null) => void;
  onCreateBucket: () => void;
  activePage: string;
  onSearch: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  isLoading?: boolean;
  notificationsEnabled?: boolean;
}

export function Topbar({
  org, workspaces, onSelectWorkspace, onCreateWorkspace,
  buckets, selectedBucket, onSelectBucket,
  onCreateBucket, activePage, onSearch, onRefresh, onSettings,
  isLoading, notificationsEnabled,
}: TopbarProps) {
  // const [orgOpen, setOrgOpen] = useState(false); // workspace switching disabled
  const [projOpen, setProjOpen] = useState(false);
  // const [orgSearch, setOrgSearch] = useState(''); // workspace search disabled
  const [projSearch, setProjSearch] = useState('');
  const [copied, setCopied] = useState(false);
  // const [creating, setCreating] = useState(false); // workspace creation disabled
  // const [newWsName, setNewWsName] = useState(''); // workspace creation disabled
  // const [createError, setCreateError] = useState(''); // workspace creation disabled
  // const orgRef = useRef<HTMLDivElement>(null); // workspace dropdown disabled
  const projRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Workspace org dropdown disabled
      if (projRef.current && !projRef.current.contains(e.target as Node)) setProjOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const orgName = org?.name || 'Memron Workspace';

  const handleCopyOrgId = () => {
    navigator.clipboard.writeText(org?.id || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Workspace creation/switching disabled — show only current org name
  // const filteredWorkspaces = ...
  // const handleCreateWorkspace = ...

  const selectedBucketName = selectedBucket
    ? buckets.find(b => b.slug === selectedBucket)?.name || selectedBucket
    : 'All Projects';

  const filteredBuckets = projSearch
    ? buckets.filter(b => b.name.toLowerCase().includes(projSearch.toLowerCase()))
    : buckets;

  return (
    <header className="mm-topbar">
      {/* ── Left: Org selector ── */}
      <div className="mm-topbar-left">
        {/* Org display — workspace creation/switching disabled; shows active org name only */}
        <div className="mm-org-selector">
          <div className="mm-org-trigger" style={{ cursor: 'default' }}>
            <div className="mm-org-icon-box">
              <Building2 size={14} strokeWidth={1.8} />
            </div>
            <div className="mm-org-info">
              <span className="mm-org-name">{orgName}</span>
              <span className="mm-org-label">Organization</span>
            </div>
          </div>

          <button className="mm-org-copy" onClick={handleCopyOrgId} title="Copy org ID">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>

        {/* Divider */}
        <div className="mm-topbar-divider" />

        {/* ── Project/bucket selector ── */}
        <div className="mm-proj-selector" ref={projRef}>
          <button className="mm-proj-trigger" onClick={() => setProjOpen(p => !p)}>
            <FolderOpen size={14} strokeWidth={1.8} />
            <span className="mm-proj-name">{selectedBucketName}</span>
            <ChevronDown size={13} className={`mm-org-chevron${projOpen ? ' open' : ''}`} />
          </button>

          {/* Project dropdown */}
          {projOpen && (
            <div className="mm-dropdown mm-proj-dropdown">
              <div className="mm-dropdown-search">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search for project"
                  value={projSearch}
                  onChange={e => setProjSearch(e.target.value)}
                  autoFocus
                />
                <button className="mm-dropdown-create" onClick={() => { setProjOpen(false); onCreateBucket(); }}>
                  Create New
                </button>
              </div>
              <div className="mm-dropdown-list">
                <button
                  className={`mm-dropdown-item${!selectedBucket ? ' selected' : ''}`}
                  onClick={() => { onSelectBucket(null); setProjOpen(false); }}
                >
                  <div className="mm-dropdown-item-icon"><FolderOpen size={14} /></div>
                  <div className="mm-dropdown-item-info">
                    <span className="mm-dropdown-item-name">All Projects</span>
                  </div>
                  {!selectedBucket && <Check size={14} className="mm-dropdown-check" />}
                </button>
                {filteredBuckets.map(b => (
                  <button
                    key={b.id}
                    className={`mm-dropdown-item${selectedBucket === b.slug ? ' selected' : ''}`}
                    onClick={() => { onSelectBucket(b.slug); setProjOpen(false); }}
                  >
                    <div className="mm-dropdown-item-icon"><FolderOpen size={14} /></div>
                    <div className="mm-dropdown-item-info">
                      <span className="mm-dropdown-item-name">{b.name}</span>
                    </div>
                    {selectedBucket === b.slug && <Check size={14} className="mm-dropdown-check" />}
                  </button>
                ))}
                {filteredBuckets.length === 0 && (
                  <div className="mm-dropdown-empty">No projects found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Search bar ── */}
      <div className="mm-topbar-center">
        <button className="mm-search-bar" onClick={onSearch}>
          <Search size={14} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      {/* ── Right: actions + docs/support ── */}
      <div className="mm-topbar-right">
        <NotificationBell enabled={!!notificationsEnabled} />
        <button className="mm-topbar-icon" onClick={onRefresh} title="Refresh">
          <RefreshCw size={15} className={isLoading ? 'mm-spin' : ''} />
        </button>
        <button className="mm-topbar-icon" onClick={onSettings}>
          <Settings size={15} />
        </button>
        <div className="mm-topbar-divider" />
        <Link href="/docs" className="mm-topbar-link">
          DOCS <ExternalLink size={11} />
        </Link>
        <a href="mailto:support@memron.ai" className="mm-topbar-link">
          SUPPORT
        </a>
      </div>
    </header>
  );
}
