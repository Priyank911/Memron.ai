'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DocItem, DOC_CATEGORIES } from '@/lib/docs-content';
import {
  Check,
  Copy,
  ChevronRight,
  Info,
  Lightbulb,
  AlertTriangle,
  Flame,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Hash,
} from 'lucide-react';

export function DocViewer({ doc }: { doc: DocItem }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [activeTabMap, setActiveTabMap] = useState<Record<number, number>>({});
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');

  // Handle Copy to Clipboard
  const handleCopy = async (codeText: string, index: number) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } catch {
      // ignore
    }
  };

  // Compute Prev & Next Navigation links across categories
  const allDocsFlat = React.useMemo(() => {
    return DOC_CATEGORIES.flatMap((c) => c.items);
  }, []);

  const currentIndex = allDocsFlat.findIndex((item) => item.slug === doc.slug);
  const prevDoc = currentIndex > 0 ? allDocsFlat[currentIndex - 1] : null;
  const nextDoc = currentIndex < allDocsFlat.length - 1 ? allDocsFlat[currentIndex + 1] : null;

  // Scroll spy to highlight active heading on right TOC
  useEffect(() => {
    const handleScroll = () => {
      const headings = doc.content.sections.map((s) => document.getElementById(s.id));
      const scrollPos = window.scrollY + 120;

      for (let i = headings.length - 1; i >= 0; i--) {
        const el = headings[i];
        if (el && el.offsetTop <= scrollPos) {
          setActiveHeadingId(doc.content.sections[i].id);
          return;
        }
      }
      if (doc.content.sections.length > 0) {
        setActiveHeadingId(doc.content.sections[0].id);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [doc]);

  return (
    <div className="doc-page-layout">
      {/* ── Center Content Column ── */}
      <article className="doc-article-content">
        {/* Breadcrumb */}
        <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/docs" className="breadcrumb-link">Docs</Link>
          <ChevronRight size={13} className="breadcrumb-separator" />
          <span className="breadcrumb-category">{doc.category}</span>
          <ChevronRight size={13} className="breadcrumb-separator" />
          <span className="breadcrumb-current">{doc.title}</span>
        </nav>

        {/* Page Header */}
        <header className="doc-header">
          <div className="doc-header-meta">
            {doc.badge && <span className="doc-badge-pill">{doc.badge}</span>}
            <span className="doc-read-time">{doc.readTime}</span>
          </div>

          <h1 className="doc-title">{doc.title}</h1>
          <p className="doc-lead">{doc.content.lead}</p>
        </header>

        <div className="doc-divider" />

        {/* Sections */}
        <div className="doc-sections-body">
          {doc.content.sections.map((section, sIdx) => {
            const activeTab = activeTabMap[sIdx] || 0;

            return (
              <section key={section.id} id={section.id} className="doc-section-block">
                <h2 className="doc-section-heading">
                  <a href={`#${section.id}`} className="heading-anchor-link">
                    <span>{section.heading}</span>
                    <Hash size={16} className="heading-anchor-icon" />
                  </a>
                </h2>

                {/* Section Body Text */}
                {section.body && (
                  <div className="doc-section-text">
                    {section.body.split('\n\n').map((paragraph, pIdx) => {
                      // Render simple list lines if starting with - or 1.
                      if (paragraph.startsWith('1. ') || paragraph.startsWith('- ')) {
                        const lines = paragraph.split('\n');
                        return (
                          <ul key={pIdx} className="doc-list">
                            {lines.map((line, lIdx) => (
                              <li key={lIdx} className="doc-list-item">
                                {line.replace(/^[0-9]+\.\s+|^-\s+/, '')}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      return <p key={pIdx} className="doc-paragraph">{paragraph}</p>;
                    })}
                  </div>
                )}

                {/* Callout Alert */}
                {section.alert && (
                  <div className={`doc-callout callout-${section.alert.type}`}>
                    <div className="callout-icon-col">
                      {section.alert.type === 'note' && <Info size={18} />}
                      {section.alert.type === 'tip' && <Lightbulb size={18} />}
                      {section.alert.type === 'important' && <Flame size={18} />}
                      {section.alert.type === 'warning' && <AlertTriangle size={18} />}
                    </div>
                    <div className="callout-body">
                      <div className="callout-title">{section.alert.title}</div>
                      <div className="callout-message">{section.alert.message}</div>
                    </div>
                  </div>
                )}

                {/* Multi-Tab Code Snippet */}
                {section.codeExample && (
                  <div className="doc-codeblock-wrapper">
                    <div className="codeblock-tabs-bar">
                      <div className="codeblock-tabs">
                        {section.codeExample.tabs.map((tab, tIdx) => (
                          <button
                            key={tab.label}
                            type="button"
                            onClick={() =>
                              setActiveTabMap((prev) => ({ ...prev, [sIdx]: tIdx }))
                            }
                            className={`codeblock-tab ${activeTab === tIdx ? 'is-active' : ''}`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            section.codeExample!.tabs[activeTab].code,
                            sIdx
                          )
                        }
                        className="codeblock-copy-btn"
                        aria-label="Copy code to clipboard"
                        title="Copy code"
                      >
                        {copiedCodeIndex === sIdx ? (
                          <>
                            <Check size={13} className="text-emerald-400" />
                            <span className="copy-text text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span className="copy-text">Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="codeblock-pre">
                      <code className="codeblock-code">
                        {section.codeExample.tabs[activeTab].code}
                      </code>
                    </pre>
                  </div>
                )}

                {/* Parameter Table */}
                {section.table && (
                  <div className="doc-table-container">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          {section.table.headers.map((h, hIdx) => (
                            <th key={hIdx}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>
                                {cIdx === 0 ? <code className="table-code-cell">{cell}</code> : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Previous & Next Article Pagination */}
        <div className="doc-pagination-bar">
          {prevDoc ? (
            <Link href={`/docs/${prevDoc.slug}`} className="doc-pagination-link prev-link">
              <span className="pagination-direction">
                <ArrowLeft size={13} />
                <span>Previous</span>
              </span>
              <span className="pagination-title">{prevDoc.title}</span>
            </Link>
          ) : (
            <div />
          )}

          {nextDoc ? (
            <Link href={`/docs/${nextDoc.slug}`} className="doc-pagination-link next-link">
              <span className="pagination-direction">
                <span>Next</span>
                <ArrowRight size={13} />
              </span>
              <span className="pagination-title">{nextDoc.title}</span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </article>

      {/* ── Right Column: Table of Contents (Desktop Only) ── */}
      <aside className="doc-toc-sidebar hidden xl:block">
        <div className="doc-toc-inner">
          <div className="toc-title">On this page</div>
          <nav className="toc-list">
            {doc.content.sections.map((s) => {
              const isActive = activeHeadingId === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`toc-link ${isActive ? 'is-active' : ''}`}
                >
                  {s.heading}
                </a>
              );
            })}
          </nav>

          <div className="toc-divider" />

          <div className="toc-actions">
            <a
              href="https://github.com/Priyank911/Memron.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="toc-action-link"
            >
              <span>Edit on GitHub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
