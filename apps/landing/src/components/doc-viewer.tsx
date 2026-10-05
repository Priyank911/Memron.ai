'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

/* ── Inline markdown: **bold**, *italic*, `code`, [label](url) ── */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // split on code spans first so markers inside code are literal
  const codeSplit = text.split(/(`[^`]+`)/g);
  let key = 0;
  for (const chunk of codeSplit) {
    if (!chunk) continue;
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      const inner = chunk.slice(1, -1);
      // pointer chips get their own treatment
      if (/^ptr_[A-Za-z0-9]+$/.test(inner)) {
        parts.push(
          <code key={`${keyPrefix}-${key++}`} className="md-ptr">{inner}</code>
        );
      } else {
        parts.push(
          <code key={`${keyPrefix}-${key++}`} className="md-code">{inner}</code>
        );
      }
      continue;
    }
    // links, bold, italic within non-code chunks
    const re = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)) !== null) {
      if (m.index > last) parts.push(chunk.slice(last, m.index));
      if (m[1]) {
        const label = m[2];
        const href = m[3];
        const external = /^https?:\/\//.test(href);
        parts.push(
          external ? (
            <a key={`${keyPrefix}-${key++}`} href={href} target="_blank" rel="noopener noreferrer" className="md-link">{label}</a>
          ) : (
            <Link key={`${keyPrefix}-${key++}`} href={href} className="md-link">{label}</Link>
          )
        );
      } else if (m[4]) {
        parts.push(<strong key={`${keyPrefix}-${key++}`} className="md-strong">{m[5]}</strong>);
      } else if (m[6]) {
        parts.push(<em key={`${keyPrefix}-${key++}`} className="md-em">{m[7]}</em>);
      }
      last = m.index + m[0].length;
    }
    if (last < chunk.length) parts.push(chunk.slice(last));
  }
  return parts;
}

function renderBody(body: string): React.ReactNode {
  const blocks = body.split(/\n\n+/);
  return blocks.map((block, bIdx) => {
    const trimmed = block.trim();
    // fenced code block
    if (trimmed.startsWith('```')) {
      const lines = trimmed.split('\n');
      lines.shift();
      if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
      return (
        <pre key={bIdx} className="md-fence"><code>{lines.join('\n')}</code></pre>
      );
    }
    const lines = block.split('\n').map((l) => l.trimEnd());
    const isList = lines.every((l) => /^\s*(?:\d+[.)]\s+|[-*]\s+)/.test(l));
    if (isList) {
      const ordered = /^\s*\d+[.)]\s+/.test(lines[0]);
      return ordered ? (
        <ol key={bIdx} className="md-ol">
          {lines.map((line, lIdx) => {
            const text = line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, '');
            return <li key={lIdx} className="md-li">{renderInline(text, `b${bIdx}l${lIdx}`)}</li>;
          })}
        </ol>
      ) : (
        <ul key={bIdx} className="md-ul">
          {lines.map((line, lIdx) => {
            const text = line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, '');
            return <li key={lIdx} className="md-li">{renderInline(text, `b${bIdx}l${lIdx}`)}</li>;
          })}
        </ul>
      );
    }
    // heading inside body (### ...)
    if (/^#{1,4}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)![0].length;
      const text = trimmed.replace(/^#+\s+/, '');
      const Tag = level <= 2 ? 'h3' : 'h4';
      return <Tag key={bIdx} className="md-subhead">{renderInline(text, `b${bIdx}`)}</Tag>;
    }
    // blockquote
    if (trimmed.startsWith('>')) {
      const text = trimmed.replace(/^>\s?/gm, '');
      return <blockquote key={bIdx} className="md-quote">{renderInline(text, `b${bIdx}`)}</blockquote>;
    }
    return <p key={bIdx} className="doc-paragraph">{renderInline(block, `b${bIdx}`)}</p>;
  });
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function renderMethodCell(cell: string, keyPrefix: string): React.ReactNode {
  const methods = cell.split(',').map((m) => m.trim().replace(/`/g, '').toUpperCase()).filter(Boolean);
  if (methods.length > 0 && methods.every((m) => (HTTP_METHODS as readonly string[]).includes(m))) {
    return (
      <span className="method-cell">
        {methods.map((m) => (
          <span key={`${keyPrefix}-${m}`} className={`method-pill method-${m.toLowerCase()}`}>{m}</span>
        ))}
      </span>
    );
  }
  return <code className="table-code-cell">{cell.replace(/`/g, '')}</code>;
}

export function DocViewer({ doc }: { doc: DocItem }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [activeTabMap, setActiveTabMap] = useState<Record<number, number>>({});
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async (codeText: string, index: number) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  const allDocsFlat = useMemo(() => DOC_CATEGORIES.flatMap((c) => c.items), []);
  const currentIndex = allDocsFlat.findIndex((item) => item.slug === doc.slug);
  const prevDoc = currentIndex > 0 ? allDocsFlat[currentIndex - 1] : null;
  const nextDoc = currentIndex < allDocsFlat.length - 1 ? allDocsFlat[currentIndex + 1] : null;
  const prevCategory = prevDoc ? DOC_CATEGORIES.find((c) => c.items.some((i) => i.slug === prevDoc.slug))?.title : null;
  const nextCategory = nextDoc ? DOC_CATEGORIES.find((c) => c.items.some((i) => i.slug === nextDoc.slug))?.title : null;

  // Scroll spy for the right TOC + restore feedback vote
  useEffect(() => {
    setActiveTabMap({});
    setActiveHeadingId(doc.content.sections[0]?.id ?? '');
    try {
      setFeedback((localStorage.getItem(`memron-docs-feedback:${doc.slug}`) as 'up' | 'down' | null) ?? null);
    } catch { /* ignore */ }

    const onScroll = () => {
      const headings = doc.content.sections
        .map((s) => document.getElementById(s.id))
        .filter((el): el is HTMLElement => !!el);
      const pos = window.scrollY + 140;
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].offsetTop <= pos) {
          setActiveHeadingId(doc.content.sections[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [doc]);

  const castVote = (vote: 'up' | 'down') => {
    setFeedback(vote);
    try { localStorage.setItem(`memron-docs-feedback:${doc.slug}`, vote); } catch { /* ignore */ }
  };

  return (
    <div className="doc-page-layout">
      <article className="doc-article-content">
        <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/docs" className="breadcrumb-link">Docs</Link>
          <ChevronRight size={12} className="breadcrumb-separator" />
          <span className="breadcrumb-category">{doc.category}</span>
          <ChevronRight size={12} className="breadcrumb-separator" />
          <span className="breadcrumb-current">{doc.title}</span>
        </nav>

        <header className="doc-header">
          <div className="doc-header-meta">
            {doc.badge && <span className="doc-badge-pill">{doc.badge}</span>}
            <span className="doc-read-time">{doc.readTime}</span>
            {doc.updated && (
              <>
                <span className="doc-meta-dot" aria-hidden="true" />
                <span className="doc-updated">{doc.updated}</span>
              </>
            )}
          </div>
          <h1 className="doc-title">{doc.title}</h1>
          <p className="doc-lead">{renderInline(doc.content.lead, 'lead')}</p>
        </header>

        <div className="doc-divider" />

        <div className="doc-sections-body">
          {doc.content.sections.map((section, sIdx) => {
            const activeTab = activeTabMap[sIdx] || 0;
            return (
              <section key={section.id} id={section.id} className="doc-section-block">
                <h2 className="doc-section-heading">
                  <a href={`#${section.id}`} className="heading-anchor-link">
                    <span>{section.heading}</span>
                    <Hash size={14} className="heading-anchor-icon" />
                  </a>
                </h2>

                {section.body && (
                  <div className="doc-section-text">{renderBody(section.body)}</div>
                )}

                {section.alert && (
                  <div className={`doc-callout callout-${section.alert.type}`} role="note">
                    <div className="callout-icon-col">
                      {section.alert.type === 'note' && <Info size={16} />}
                      {section.alert.type === 'tip' && <Lightbulb size={16} />}
                      {section.alert.type === 'important' && <Flame size={16} />}
                      {section.alert.type === 'warning' && <AlertTriangle size={16} />}
                    </div>
                    <div className="callout-body">
                      <div className="callout-title">{section.alert.title}</div>
                      <div className="callout-message">{renderInline(section.alert.message, `alert-${sIdx}`)}</div>
                    </div>
                  </div>
                )}

                {section.codeExample && (
                  <div className="doc-codeblock-wrapper">
                    <div className="codeblock-tabs-bar">
                      <div className="codeblock-tabs" role="tablist">
                        {section.codeExample.tabs.map((tab, tIdx) => (
                          <button
                            key={tab.label}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tIdx}
                            onClick={() => setActiveTabMap((prev) => ({ ...prev, [sIdx]: tIdx }))}
                            className={`codeblock-tab ${activeTab === tIdx ? 'is-active' : ''}`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(section.codeExample!.tabs[activeTab].code, sIdx)}
                        className="codeblock-copy-btn"
                        aria-label="Copy code to clipboard"
                        title="Copy code"
                      >
                        {copiedCodeIndex === sIdx ? (
                          <>
                            <Check size={12} className="copy-ok" />
                            <span className="copy-text copy-ok">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span className="copy-text">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="codeblock-pre">
                      <code className={`codeblock-code lang-${section.codeExample.tabs[activeTab].lang}`}>
                        {section.codeExample.tabs[activeTab].code}
                      </code>
                    </pre>
                  </div>
                )}

                {section.table && (
                  <div className="doc-table-container">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          {section.table.headers.map((h, hIdx) => (
                            <th key={hIdx}>{renderInline(h, `th-${sIdx}-${hIdx}`)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>
                                {cIdx === 0 ? (
                                  renderMethodCell(cell, `td-${sIdx}-${rIdx}`)
                                ) : (
                                  renderInline(cell, `td-${sIdx}-${rIdx}-${cIdx}`)
                                )}
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

        <div className="doc-feedback-row">
          <span className="doc-feedback-label">Was this page helpful?</span>
          {feedback ? (
            <span className="doc-feedback-thanks">Thanks for the feedback.</span>
          ) : (
            <div className="doc-feedback-actions">
              <button type="button" onClick={() => castVote('up')} className="doc-feedback-btn" aria-label="Yes, this page was helpful">
                <ThumbsUp size={13} />
                <span>Yes</span>
              </button>
              <button type="button" onClick={() => castVote('down')} className="doc-feedback-btn" aria-label="No, this page was not helpful">
                <ThumbsDown size={13} />
                <span>No</span>
              </button>
            </div>
          )}
        </div>

        <div className="doc-pagination-bar">
          {prevDoc ? (
            <Link href={`/docs/${prevDoc.slug}`} className="doc-pagination-link prev-link">
              <span className="pagination-direction">
                <ArrowLeft size={12} />
                <span>Previous{prevCategory ? ` · ${prevCategory}` : ''}</span>
              </span>
              <span className="pagination-title">{prevDoc.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {nextDoc ? (
            <Link href={`/docs/${nextDoc.slug}`} className="doc-pagination-link next-link">
              <span className="pagination-direction">
                <span>Next{nextCategory ? ` · ${nextCategory}` : ''}</span>
                <ArrowRight size={12} />
              </span>
              <span className="pagination-title">{nextDoc.title}</span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </article>

      <aside className="doc-toc-sidebar hidden xl:block" aria-label="Table of contents">
        <div className="doc-toc-inner">
          <div className="toc-title">On this page</div>
          <nav className="toc-list">
            {doc.content.sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`toc-link ${activeHeadingId === s.id ? 'is-active' : ''}`}
              >
                {s.heading}
              </a>
            ))}
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
