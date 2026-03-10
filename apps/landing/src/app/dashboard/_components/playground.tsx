'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Search, MessageSquare,
  Plus, Loader2, X, FolderClosed, FolderOpen, ChevronRight,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ThemeToggle } from '@/components/theme-toggle';

/* ── Custom SVG Icons ── */
const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12l7-7 7 7" />
  </svg>
);

const IconMemory = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </svg>
);

const IconFile = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

/* ── Typewriter subtitle ── */
const TYPEWRITER_SENTENCES = [
  'Retrieve memories with semantic precision.',
  'Navigate your knowledge graph effortlessly.',
  'Surface insights from structured buckets.',
  'Query context-rich memories in real time.',
  'Bridge thought and data, instantly.',
  'Explore patterns across memory layers.',
];

function TypewriterSubtitle() {
  const [text, setText] = useState('');
  const idxRef = useRef(0);

  useEffect(() => {
    let animId: number;
    let charI = 0;
    let erasing = false;
    let waitUntil = 0;
    const TYPE_SPEED = 38;
    const ERASE_SPEED = 18;
    const PAUSE_AFTER_TYPE = 2400;
    const PAUSE_AFTER_ERASE = 500;

    const tick = (now: number) => {
      if (now < waitUntil) { animId = requestAnimationFrame(tick); return; }
      const sentence = TYPEWRITER_SENTENCES[idxRef.current];
      if (!erasing) {
        if (charI < sentence.length) {
          charI++;
          setText(sentence.slice(0, charI));
          waitUntil = now + TYPE_SPEED;
        } else {
          erasing = true;
          waitUntil = now + PAUSE_AFTER_TYPE;
        }
      } else {
        if (charI > 0) {
          charI--;
          setText(sentence.slice(0, charI));
          waitUntil = now + ERASE_SPEED;
        } else {
          erasing = false;
          idxRef.current = (idxRef.current + 1) % TYPEWRITER_SENTENCES.length;
          waitUntil = now + PAUSE_AFTER_ERASE;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <p className="pg-typewriter">
      {text}<span className="pg-typewriter-cursor">|</span>
    </p>
  );
}

/* ── Suggestion chips shown on empty chat ── */
const SUGGESTIONS = [
  'Show recent memories',
  'What do I know about this project?',
  'List all tags',
  'Summarize my knowledge base',
];

/* ── Types ── */
interface MemoryPreview {
  id: string;
  title: string;
  tags: string[];
  tokenCount: number;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  bucket?: string | null;
  memoryCount?: number;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: number;
  messages: ChatMessage[];
}

interface PlaygroundProps {
  buckets: { id: string; name: string; slug: string; memoryCount: number }[];
  totalMemories: number;
  totalTokens: number;
  userName: string;
  onBack: () => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function Playground({ buckets, totalMemories, totalTokens, userName, onBack }: PlaygroundProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderMemories, setFolderMemories] = useState<Record<string, MemoryPreview[]>>({});
  const [folderLoading, setFolderLoading] = useState<Set<string>>(new Set());

  // Prompt history (up-arrow navigation)
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const savedInputRef = useRef('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const activeBucketName = buckets.find(b => b.slug === selectedBucket)?.name ?? selectedBucket;

  /* ── Fetch memories for a bucket folder ── */
  const fetchFolderMemories = useCallback(async (bucketSlug: string) => {
    if (folderMemories[bucketSlug] || folderLoading.has(bucketSlug)) return;
    setFolderLoading(prev => new Set(prev).add(bucketSlug));
    try {
      const res = await fetch('/api/dashboard/memories', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const all: MemoryPreview[] = (data.memories || [])
          .filter((m: any) => m.bucket === bucketSlug)
          .slice(0, 20)
          .map((m: any) => ({
            id: m.id,
            title: m.title || '(untitled)',
            tags: m.tags || [],
            tokenCount: m.tokenCount || 0,
            createdAt: m.createdAt,
          }));
        setFolderMemories(prev => ({ ...prev, [bucketSlug]: all }));
      }
    } catch { /* silent */ }
    setFolderLoading(prev => { const n = new Set(prev); n.delete(bucketSlug); return n; });
  }, [folderMemories, folderLoading]);

  /* ── Toggle folder expand/collapse ── */
  const toggleFolder = useCallback((slug: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        fetchFolderMemories(slug);
      }
      return next;
    });
  }, [fetchFolderMemories]);

  /* ── Select bucket for chat filter (double-click or dedicated button) ── */
  const selectBucketFilter = useCallback((slug: string) => {
    setSelectedBucket(prev => prev === slug ? null : slug);
  }, []);

  const createSession = useCallback(() => {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session: ChatSession = {
      id, title: 'New Chat', lastMessage: '', timestamp: Date.now(), messages: [],
    };
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(id);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) createSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = messagesEndRef.current;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeSession?.messages.length, loading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading || !activeSessionId) return;

    // Add to prompt history
    setPromptHistory(prev => {
      const filtered = prev.filter(p => p !== text);
      return [...filtered, text];
    });
    setHistoryIdx(-1);
    savedInputRef.current = '';

    const userMsg: ChatMessage = { id: `m_${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };

    // Get current session messages for chat history
    const currentSession = sessions.find(s => s.id === activeSessionId);
    const currentMessages = currentSession?.messages || [];

    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      return {
        ...s,
        title: s.messages.length === 0 ? text.slice(0, 50) : s.title,
        lastMessage: text, timestamp: Date.now(),
        messages: [...s.messages, userMsg],
      };
    }));

    setInput('');
    setLoading(true);

    try {
      // Build chat history from session messages (exclude current message)
      const chatHistory = currentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/dashboard/playground', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, bucket: selectedBucket, chatHistory }),
      });

      let assistantMsg: ChatMessage;
      let matchedMemoryCount = 0;

      if (res.ok) {
        const data = await res.json();
        const llmAnswer: string = data.answer || '';
        matchedMemoryCount = data.memories?.length || 0;

        assistantMsg = {
          id: `m_${Date.now()}`, role: 'assistant',
          content: llmAnswer || 'No response generated. Please try again.',
          timestamp: Date.now(),
        };
      } else if (res.status === 400) {
        const data = await res.json().catch(() => null);
        assistantMsg = {
          id: `m_${Date.now()}`, role: 'assistant',
          content: data?.rejection || 'Invalid query. Please try a different question.',
          timestamp: Date.now(),
        };
      } else {
        assistantMsg = {
          id: `m_${Date.now()}`, role: 'assistant',
          content: 'Failed to query memories. Please try again.',
          timestamp: Date.now(),
        };
      }

      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        const updatedMessages = s.messages.map(m =>
          m.id === userMsg.id ? { ...m, bucket: selectedBucket, memoryCount: matchedMemoryCount } : m
        );
        return {
          ...s,
          lastMessage: assistantMsg.content.slice(0, 60),
          messages: [...updatedMessages, assistantMsg],
        };
      }));
    } catch {
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? { ...s, messages: [...s.messages, { id: `m_${Date.now()}`, role: 'assistant' as const, content: 'Connection error. Check your network.', timestamp: Date.now() }] }
          : s
      ));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, activeSessionId, selectedBucket, sessions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }

    // Up arrow: cycle through prompt history
    if (e.key === 'ArrowUp' && promptHistory.length > 0) {
      e.preventDefault();
      if (historyIdx === -1) {
        // Save current input before navigating history
        savedInputRef.current = input;
        const newIdx = promptHistory.length - 1;
        setHistoryIdx(newIdx);
        setInput(promptHistory[newIdx]);
      } else if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setInput(promptHistory[newIdx]);
      }
      return;
    }

    // Down arrow: navigate forward in history or restore saved input
    if (e.key === 'ArrowDown' && historyIdx !== -1) {
      e.preventDefault();
      if (historyIdx < promptHistory.length - 1) {
        const newIdx = historyIdx + 1;
        setHistoryIdx(newIdx);
        setInput(promptHistory[newIdx]);
      } else {
        setHistoryIdx(-1);
        setInput(savedInputRef.current);
      }
      return;
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (id === activeSessionId) setActiveSessionId(next[0]?.id ?? null);
      return next;
    });
  }, [activeSessionId]);

  const clearChat = useCallback(() => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId ? { ...s, messages: [], title: 'New Chat', lastMessage: '' } : s
    ));
  }, [activeSessionId]);

  const filteredSessions = sidebarSearch
    ? sessions.filter(s => s.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : sessions;

  const greetingBlock = (
    <div className="pg-greeting">
      <h2 className="pg-greeting-text">Hi {userName}</h2>
      <TypewriterSubtitle />
      <div className="pg-suggestions">
        {SUGGESTIONS.map(s => (
          <button key={s} className="pg-suggestion-chip" onClick={() => { setInput(s); sendMessage(s); }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pg-overlay">
      {/* ── Sidebar ── */}
      <aside className="pg-sidebar">
        <div className="pg-sidebar-top">
          <button className="pg-back" onClick={onBack} title="Back to Dashboard">
            <ArrowLeft size={16} />
          </button>
          <span className="pg-logo">Playground</span>
          <div className="pg-theme-toggle"><ThemeToggle /></div>
        </div>

        <div className="pg-search-box">
          <Search size={13} className="pg-search-icon" />
          <input className="pg-search-input" placeholder="Search chats..." value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        </div>

        <div className="pg-section pg-section-grow pg-history-section">
          <div className="pg-section-label">History</div>
          <div className="pg-session-list">
            {filteredSessions.map(s => (
              <div
                key={s.id}
                className={`pg-session-item${s.id === activeSessionId ? ' pg-session-active' : ''}`}
                onClick={() => setActiveSessionId(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') setActiveSessionId(s.id); }}
              >
                <MessageSquare size={12} />
                <div className="pg-session-info">
                  <span className="pg-session-title">{s.title}</span>
                  <span className="pg-session-time">{formatTime(s.timestamp)}</span>
                </div>
                <button className="pg-session-del" onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                  <X size={11} />
                </button>
              </div>
            ))}
            {filteredSessions.length === 0 && <div className="pg-empty-hint">No chats yet</div>}
          </div>
        </div>

        <div className="pg-sidebar-footer">
          <button className="pg-new-chat-box" onClick={createSession}>
            <Plus size={14} />
            <span>New Chat</span>
          </button>
          <div className="pg-foot-stat"><IconMemory size={12} /> {totalMemories.toLocaleString()} memories</div>
        </div>
      </aside>

      {/* ── Main Chat ── */}
      <section className="pg-main">
        {activeSession ? (
          <>
            {/* Chat header bar */}
            {activeSession.messages.length > 0 && (
              <div className="pg-chat-header">
                <span className="pg-chat-header-title">{activeSession.title}</span>
                <button className="pg-chat-clear" onClick={clearChat} title="Clear conversation">
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            <div className="pg-messages">
              {activeSession.messages.length === 0 && greetingBlock}

              {activeSession.messages.map(msg => (
                <div key={msg.id} className={`pg-msg pg-msg-${msg.role}`}>
                  {msg.role === 'user' ? (
                    <>
                      <div className="pg-user-bubble">{msg.content}</div>
                      {(msg.bucket || (msg.memoryCount != null && msg.memoryCount > 0)) && (
                        <div className="pg-user-context-tag">
                          {msg.bucket && (
                            <span className="pg-ctx-pill">
                              <FolderOpen size={10} />
                              {buckets.find(b => b.slug === msg.bucket)?.name || msg.bucket}
                            </span>
                          )}
                          {msg.memoryCount != null && msg.memoryCount > 0 && (
                            <span className="pg-ctx-pill">
                              <IconMemory size={10} />
                              Used {msg.memoryCount} {msg.memoryCount === 1 ? 'memory' : 'memories'}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="pg-assistant-block">
                      <div className="pg-llm-answer">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="pg-msg pg-msg-assistant">
                  <div className="pg-assistant-block">
                    <div className="pg-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="pg-input-area">
              {selectedBucket && (
                <div className="pg-bucket-tag">
                  <FolderOpen size={11} />
                  <span>{activeBucketName}</span>
                  <button className="pg-bucket-tag-x" onClick={() => setSelectedBucket(null)} aria-label="Clear bucket filter">
                    <X size={10} />
                  </button>
                </div>
              )}
              <div className="pg-input-box">
                <textarea
                  ref={inputRef}
                  className="pg-textarea"
                  placeholder={selectedBucket ? `Ask within ${activeBucketName}...` : 'Search your memories...'}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={loading}
                />
                <button className="pg-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
                  {loading ? <Loader2 size={16} className="pg-spin" /> : <IconSend />}
                </button>
              </div>
            </div>
          </>
        ) : (
          greetingBlock
        )}

        {/* Watermark */}
        <div className="pg-watermark">memron</div>
      </section>

      {/* ── Bucket Panel (Right) — Expandable Folders ── */}
      <aside className="pg-bucket-panel">
        <div className="pg-bucket-panel-head">
          <FolderClosed size={13} />
          <span>Buckets</span>
          <span className="pg-bucket-panel-count">{buckets.length}</span>
        </div>
        <div className="pg-folder-list">
          {buckets.map(b => {
            const isExpanded = expandedFolders.has(b.slug);
            const isSelected = selectedBucket === b.slug;
            const memories = folderMemories[b.slug] || [];
            const isLoading = folderLoading.has(b.slug);

            return (
              <div key={b.id} className={`pg-folder-group${isExpanded ? ' pg-folder-expanded' : ''}${isSelected ? ' pg-folder-selected' : ''}`}>
                {/* Folder header row */}
                <div className="pg-folder-header">
                  <button
                    className="pg-folder-toggle"
                    onClick={() => toggleFolder(b.slug)}
                    aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                  >
                    <ChevronRight size={12} className={`pg-folder-chevron${isExpanded ? ' pg-chevron-open' : ''}`} />
                  </button>
                  <button
                    className="pg-folder-row"
                    onClick={() => selectBucketFilter(b.slug)}
                    title={isSelected ? 'Remove filter' : `Filter to ${b.name}`}
                  >
                    {isExpanded ? <FolderOpen size={14} className="pg-folder-icon" /> : <FolderClosed size={14} className="pg-folder-icon" />}
                    <div className="pg-folder-info">
                      <span className="pg-folder-name">{b.name}</span>
                      <span className="pg-folder-count">{b.memoryCount} {b.memoryCount === 1 ? 'memory' : 'memories'}</span>
                    </div>
                  </button>
                </div>

                {/* Expanded folder contents */}
                {isExpanded && (
                  <div className="pg-folder-contents">
                    {isLoading && (
                      <div className="pg-folder-loading">
                        <Loader2 size={12} className="pg-spin" />
                      </div>
                    )}
                    {!isLoading && memories.length === 0 && (
                      <div className="pg-folder-empty">No memories yet</div>
                    )}
                    {memories.map(m => (
                      <div key={m.id} className="pg-file-item">
                        <IconFile size={11} />
                        <span className="pg-file-name" title={m.title}>{m.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {buckets.length === 0 && (
            <div className="pg-empty-hint">
              No buckets yet.<br />
              <span style={{ fontSize: '0.64rem', opacity: 0.6 }}>Create one from the dashboard.</span>
            </div>
          )}
        </div>
        <div className="pg-bucket-panel-foot">
          <span className="pg-foot-stat"><IconMemory size={11} /> {totalTokens.toLocaleString()} tokens</span>
        </div>
      </aside>
    </div>
  );
}
