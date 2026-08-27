'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { DOC_CATEGORIES, DOC_ITEMS } from '@/lib/docs-content';
import {
  Search,
  BookOpen,
  Layers,
  Terminal,
  Cpu,
  Webhook,
  Rocket,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  Command,
  ArrowRight,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Layers,
  Terminal,
  Cpu,
  Webhook,
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Determine active doc slug
  const activeSlug = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1 && parts[0] === 'docs') return 'introduction';
    if (parts.length >= 2 && parts[0] === 'docs') return parts[1];
    return 'introduction';
  }, [pathname]);

  // Handle Ctrl+K / Cmd+K search shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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

  // Filter search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return Object.values(DOC_ITEMS).filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.content.sections.some(
          (s) => s.heading.toLowerCase().includes(q) || (s.body && s.body.toLowerCase().includes(q))
        )
    ).slice(0, 8);
  }, [searchQuery]);

  const handleSelectSearchResult = (slug: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(`/docs/${slug}`);
  };

  return (
    <div className="docs-shell">
      {/* ── Top Mintlify-Style Sticky Header ── */}
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <div className="docs-brand-group">
            <button
              type="button"
              className="docs-mobile-menu-btn lg:hidden"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              aria-label="Toggle Documentation Navigation"
            >
              {mobileDrawerOpen ? <X size={19} /> : <Menu size={19} />}
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
              <span className="docs-version-pill hidden sm:inline-flex">v2.4 Sovereign</span>
            </div>
          </div>

          {/* Quicksearch trigger (Desktop) */}
          <div className="docs-search-wrapper hidden md:block">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="docs-search-trigger"
            >
              <Search size={13} className="search-icon" />
              <span className="search-text">Search docs, 41 MCP tools, models…</span>
              <kbd className="search-kbd">
                <span className="kbd-cmd">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Right Header Actions */}
          <div className="docs-top-actions">
            {/* Mobile search button */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="docs-action-link md:hidden"
              title="Search documentation"
            >
              <Search size={16} />
            </button>

            <a
              href="https://github.com/Priyank911/Memron.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="docs-action-link hidden sm:flex"
              title="GitHub repository"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
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

      {/* ── Main Layout: Sidebar + Content ── */}
      <div className="docs-body-container">
        {/* Left Sidebar (Desktop) */}
        <aside className="docs-sidebar hidden lg:block">
          <nav className="docs-nav-tree">
            {DOC_CATEGORIES.map((cat) => {
              const IconComponent = ICON_MAP[cat.icon] || BookOpen;
              const isCollapsed = !!collapsedCategories[cat.id];

              return (
                <div key={cat.id} className="docs-category-group">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className="docs-category-header"
                    title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${cat.title}`}
                  >
                    <div className="docs-category-header-left">
                      <IconComponent size={13} className="docs-category-icon" />
                      <span>{cat.title}</span>
                    </div>
                    <div className="docs-category-header-right">
                      <span className="docs-category-count">{cat.items.length}</span>
                      {isCollapsed ? (
                        <ChevronRight size={12} className="docs-category-chevron" />
                      ) : (
                        <ChevronDown size={12} className="docs-category-chevron" />
                      )}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="docs-category-items">
                      {cat.items.map((item) => {
                        const isActive = activeSlug === item.slug;
                        return (
                          <Link
                            key={item.id}
                            href={`/docs/${item.slug}`}
                            className={`docs-nav-item ${isActive ? 'is-active' : ''}`}
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
        </aside>

        {/* Mobile Slide-Out Drawer */}
        {mobileDrawerOpen && (
          <div className="docs-mobile-drawer-overlay lg:hidden" onClick={() => setMobileDrawerOpen(false)}>
            <div className="docs-mobile-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <span className="drawer-title">Documentation</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="drawer-close-btn"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="drawer-search">
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setSearchOpen(true);
                  }}
                  className="drawer-search-btn"
                >
                  <Search size={14} />
                  <span>Search documentation…</span>
                </button>
              </div>
              <nav className="docs-nav-tree">
                {DOC_CATEGORIES.map((cat) => {
                  const isCollapsed = !!collapsedCategories[cat.id];
                  return (
                    <div key={cat.id} className="docs-category-group">
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className="docs-category-header"
                      >
                        <div className="docs-category-header-left">
                          <span>{cat.title}</span>
                        </div>
                        <div className="docs-category-header-right">
                          <span className="docs-category-count">{cat.items.length}</span>
                          {isCollapsed ? (
                            <ChevronRight size={12} className="docs-category-chevron" />
                          ) : (
                            <ChevronDown size={12} className="docs-category-chevron" />
                          )}
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="docs-category-items">
                          {cat.items.map((item) => {
                            const isActive = activeSlug === item.slug;
                            return (
                              <Link
                                key={item.id}
                                href={`/docs/${item.slug}`}
                                onClick={() => setMobileDrawerOpen(false)}
                                className={`docs-nav-item ${isActive ? 'is-active' : ''}`}
                              >
                                <span>{item.title}</span>
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
            </div>
          </div>
        )}

        {/* Center Content Slot */}
        <main className="docs-main-viewport">
          {children}
        </main>
      </div>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <div className="docs-search-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="docs-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-header">
              <Search size={18} className="modal-search-icon" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics, 41 MCP tools, parameters, architecture…"
                className="search-modal-input"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="search-modal-esc"
              >
                ESC
              </button>
            </div>

            <div className="search-results-list">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSearchResult(item.slug)}
                      className="search-result-row"
                    >
                      <div className="result-category">{item.category}</div>
                      <div className="result-title">{item.title}</div>
                      <div className="result-desc">{item.description}</div>
                    </button>
                  ))
                ) : (
                  <div className="search-empty-state">
                    No results found for &ldquo;{searchQuery}&rdquo;. Try searching for &ldquo;MCP&rdquo;, &ldquo;database&rdquo;, &ldquo;OpenAI&rdquo;, or &ldquo;tools&rdquo;.
                  </div>
                )
              ) : (
                <div className="search-suggestions">
                  <div className="suggestions-label">Popular Searches</div>
                  <div className="suggestions-chips">
                    {['3-Minute Quickstart', 'Memory CRUD', 'Pinned Facts', 'Dual-Database', 'OpenAI Models', 'Cursor Setup'].map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setSearchQuery(term)}
                        className="suggestion-chip"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
