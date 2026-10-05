'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { DOC_CATEGORIES, DOC_ITEMS, DOCS_VERSION } from '@/lib/docs-content';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = { ...prev, [catId]: !prev[catId] };
      try { localStorage.setItem('memron-docs-collapsed', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    try {
      setCollapsedCategories(JSON.parse(localStorage.getItem('memron-docs-collapsed') || '{}'));
    } catch { /* ignore */ }
  }, [pathname]);

  const activeSlug = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1 && parts[0] === 'docs') return 'introduction';
    if (parts.length >= 2 && parts[0] === 'docs') return parts[1];
    return 'introduction';
  }, [pathname]);

  // Auto-expand the category holding the active doc
  useEffect(() => {
    const holder = DOC_CATEGORIES.find((c) => c.items.some((i) => i.slug === activeSlug));
    if (holder) {
      setCollapsedCategories((prev) => (prev[holder.id] ? { ...prev, [holder.id]: false } : prev));
    }
  }, [activeSlug]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setSearchQuery('');
      setHighlightIdx(0);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const scored = Object.values(DOC_ITEMS).map((item) => {
      const title = item.title.toLowerCase();
      const desc = item.description.toLowerCase();
      const inSection = item.content.sections.some(
        (s) => s.heading.toLowerCase().includes(q) || (s.body && s.body.toLowerCase().includes(q))
      );
      let score = -1;
      if (title.startsWith(q)) score = 0;
      else if (title.includes(q)) score = 1;
      else if (desc.includes(q)) score = 2;
      else if (inSection) score = 3;
      return { item, score };
    }).filter((r) => r.score >= 0);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((r) => r.item).slice(0, 8);
  }, [searchQuery]);

  useEffect(() => setHighlightIdx(0), [searchQuery]);

  const handleSelectSearchResult = (slug: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(slug === 'introduction' ? '/docs' : `/docs/${slug}`);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, searchResults.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && searchResults[highlightIdx]) {
      e.preventDefault();
      handleSelectSearchResult(searchResults[highlightIdx].slug);
    }
  };

  const renderNavTree = (onNavigate?: () => void) => (
    <nav className="docs-nav-tree" aria-label="Documentation sections">
      {DOC_CATEGORIES.map((cat) => {
        const isCollapsed = !!collapsedCategories[cat.id];
        return (
          <div key={cat.id} className="docs-category-group">
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className="docs-category-header"
              aria-expanded={!isCollapsed}
              title={`${isCollapsed ? 'Expand' : 'Collapse'} ${cat.title}`}
            >
              <span className="docs-category-title">{cat.title}</span>
              {isCollapsed ? (
                <ChevronRight size={13} className="docs-category-chevron" />
              ) : (
                <ChevronDown size={13} className="docs-category-chevron" />
              )}
            </button>
            {!isCollapsed && (
              <div className="docs-category-items">
                {cat.items.map((item) => {
                  const isActive = activeSlug === item.slug;
                  return (
                    <Link
                      key={item.id}
                      href={item.slug === 'introduction' ? '/docs' : `/docs/${item.slug}`}
                      onClick={onNavigate}
                      className={`docs-nav-item ${isActive ? 'is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="docs-item-title">{item.title}</span>
                      {item.badge && (
                        <span className={`docs-item-badge badge-${item.badgeType || 'default'}`}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="docs-shell">
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <div className="docs-brand-group">
            <button
              type="button"
              className="docs-mobile-menu-btn lg:hidden"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              aria-label="Toggle documentation navigation"
            >
              {mobileDrawerOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link href="/" className="docs-logo">
              <span className="logo-wrapper">
                <Image src="/logo_w.png" alt="Memron" width={24} height={24} className="logo-light" priority style={{ objectFit: 'contain' }} />
                <Image src="/logo_b.png" alt="Memron" width={24} height={24} className="logo-dark" priority style={{ objectFit: 'contain' }} />
              </span>
              <span className="docs-brand-name">Memron</span>
            </Link>
            <div className="docs-badge-group">
              <span className="docs-badge-divider">/</span>
              <Link href="/docs" className="docs-tag">Docs</Link>
              <span className="docs-version-pill hidden sm:inline-flex">{DOCS_VERSION}</span>
            </div>
          </div>

          <div className="docs-search-wrapper hidden md:block">
            <button type="button" onClick={() => setSearchOpen(true)} className="docs-search-trigger">
              <Search size={13} className="search-icon" />
              <span className="search-text">Search documentation…</span>
              <kbd className="search-kbd"><span className="kbd-cmd">⌘</span>K</kbd>
            </button>
          </div>

          <div className="docs-top-actions">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="docs-action-link md:hidden"
              title="Search documentation"
              aria-label="Search documentation"
            >
              <Search size={16} />
            </button>
            <a
              href="https://github.com/Priyank911/Memron.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="docs-action-link hidden sm:flex"
              title="GitHub repository"
              aria-label="GitHub repository"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <ThemeToggle />
            <Link href="/dashboard" className="docs-dashboard-btn">
              <span>Dashboard</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      <div className="docs-body-container">
        <aside className="docs-sidebar hidden lg:flex" aria-label="Documentation navigation">
          <div className="docs-nav-scroll">{renderNavTree()}</div>
          <div className="docs-sidebar-footer">
            <span className="docs-status-dot" aria-hidden="true" />
            <span className="docs-status-text">Engine v2 · 8 tools live</span>
          </div>
        </aside>

        {mobileDrawerOpen && (
          <div className="docs-mobile-drawer-overlay lg:hidden" onClick={() => setMobileDrawerOpen(false)}>
            <div className="docs-mobile-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Documentation navigation">
              <div className="drawer-header">
                <span className="drawer-title">Documentation</span>
                <button type="button" onClick={() => setMobileDrawerOpen(false)} className="drawer-close-btn" aria-label="Close navigation">
                  <X size={18} />
                </button>
              </div>
              <div className="drawer-search">
                <button
                  type="button"
                  onClick={() => { setMobileDrawerOpen(false); setSearchOpen(true); }}
                  className="drawer-search-btn"
                >
                  <Search size={14} />
                  <span>Search documentation…</span>
                  <kbd className="search-kbd">⌘K</kbd>
                </button>
              </div>
              {renderNavTree(() => setMobileDrawerOpen(false))}
            </div>
          </div>
        )}

        <main className="docs-main-viewport">{children}</main>
      </div>

      {searchOpen && (
        <div className="docs-search-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="docs-search-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search documentation">
            <div className="search-input-header">
              <Search size={17} className="modal-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search topics, tools, params, architecture…"
                className="search-modal-input"
                aria-label="Search documentation"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="search-modal-esc">ESC</button>
            </div>
            <div className="search-results-list">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  searchResults.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => handleSelectSearchResult(item.slug)}
                      className={`search-result-row ${idx === highlightIdx ? 'is-highlighted' : ''}`}
                    >
                      <div className="result-top">
                        <span className="result-category">{item.category}</span>
                        {idx === highlightIdx && <CornerDownLeft size={12} className="result-enter" />}
                      </div>
                      <div className="result-title">{item.title}</div>
                      <div className="result-desc">{item.description}</div>
                    </button>
                  ))
                ) : (
                  <div className="search-empty-state">
                    No results for &ldquo;{searchQuery}&rdquo;. Try &ldquo;recall&rdquo;, &ldquo;pin&rdquo;, &ldquo;pgvector&rdquo;, or &ldquo;cursor&rdquo;.
                  </div>
                )
              ) : (
                <div className="search-suggestions">
                  <div className="suggestions-label">Popular right now</div>
                  <div className="suggestions-chips">
                    {['memory_recall', 'memory_store', 'Pinned facts', 'Hybrid RRF', 'Cursor setup', 'API keys'].map((term) => (
                      <button key={term} type="button" onClick={() => setSearchQuery(term)} className="suggestion-chip">
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="search-modal-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
