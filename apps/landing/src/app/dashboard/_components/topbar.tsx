'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Building2, ChevronDown, Copy, FolderOpen, Search, Check,
  RefreshCw, Settings, ExternalLink,
} from 'lucide-react';
import { NotificationBell } from './notification-bell';
import type { OrgInfo } from './types';

interface TopbarProps {
  org: OrgInfo | null;
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
  org, buckets, selectedBucket, onSelectBucket,
  onCreateBucket, activePage, onSearch, onRefresh, onSettings,
  isLoading, notificationsEnabled,
}: TopbarProps) {
  const [orgOpen, setOrgOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [projSearch, setProjSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const orgRef = useRef<HTMLDivElement>(null);
  const projRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgOpen(false);
      if (projRef.current && !projRef.current.contains(e.target as Node)) setProjOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const orgName = org?.name || 'Memron Workspace';
  const orgSlug = org?.slug || 'default';

  const handleCopyOrgId = () => {
    navigator.clipboard.writeText(org?.id || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
        <div className="mm-org-selector" ref={orgRef}>
          <button className="mm-org-trigger" onClick={() => setOrgOpen(p => !p)}>
            <div className="mm-org-icon-box">
              <Building2 size={14} strokeWidth={1.8} />
            </div>
            <div className="mm-org-info">
              <span className="mm-org-name">{orgName}</span>
              <span className="mm-org-label">Organization</span>
            </div>
            <ChevronDown size={13} className={`mm-org-chevron${orgOpen ? ' open' : ''}`} />
          </button>

          <button className="mm-org-copy" onClick={handleCopyOrgId} title="Copy org ID">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>

          {/* Org dropdown */}
          {orgOpen && (
            <div className="mm-dropdown mm-org-dropdown">
              <div className="mm-dropdown-search">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search for organization"
                  value={orgSearch}
                  onChange={e => setOrgSearch(e.target.value)}
                  autoFocus
                />
                <button className="mm-dropdown-create" onClick={() => { setOrgOpen(false); }}>
                  Create New
                </button>
              </div>
              <div className="mm-dropdown-list">
                <button className="mm-dropdown-item selected" onClick={() => setOrgOpen(false)}>
                  <div className="mm-dropdown-item-icon">
                    <Building2 size={14} />
                  </div>
                  <div className="mm-dropdown-item-info">
                    <span className="mm-dropdown-item-name">{orgName}</span>
                    <span className="mm-dropdown-item-sub">Free Plan</span>
                  </div>
                  <Check size={14} className="mm-dropdown-check" />
                </button>
              </div>
            </div>
          )}
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
        <a href="https://docs.memron.ai" target="_blank" rel="noopener noreferrer" className="mm-topbar-link">
          DOCS <ExternalLink size={11} />
        </a>
        <a href="mailto:support@memron.ai" className="mm-topbar-link">
          SUPPORT
        </a>
      </div>
    </header>
  );
}
