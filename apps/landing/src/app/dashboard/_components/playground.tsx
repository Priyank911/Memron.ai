'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Search, Hash, MessageSquare,
  Plus, Loader2, X, Clock,
} from 'lucide-react';

/* ── Custom SVG Icons (no background, no emoji) ── */
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

/* ── Typewriter subtitle: types sentence, pauses, erases, next ── */
const TYPEWRITER_SENTENCES = [
  'Search through your memory buckets instantly.',
  'Ask anything about your stored memories.',
  'Your AI-powered memory companion.',
  'Query, recall, and explore your data.',
  'Talk to your knowledge base naturally.',
  'Find context across all your buckets.',
];

function TypewriterSubtitle() {
  const [text, setText] = useState('');
  const idxRef = useRef(0);

  useEffect(() => {
    let animId: number;
    let charI = 0;
    let erasing = false;
    let waitUntil = 0;
    const TYPE_SPEED = 45;
    const ERASE_SPEED = 25;
    const PAUSE_AFTER_TYPE = 2000;
    const PAUSE_AFTER_ERASE = 400;

    const tick = (now: number) => {
      if (now < waitUntil) {
        animId = requestAnimationFrame(tick);
        return;
      }

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

/* ── Types ── */
interface MemoryResult {
  id: string;
  bucket: string;
  title: string;
  tags: string[];
  tokenCount: number;
  score: number;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  memories?: MemoryResult[];
  reasoning?: string;
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

/** Score level class for theme-adaptive colors */
function scoreLevel(score: number): string {
  if (score >= 0.85) return 'pg-score-high';
  if (score >= 0.7)  return 'pg-score-good';
  if (score >= 0.5)  return 'pg-score-mid';
  return 'pg-score-low';
}

function buildReasoning(memories: MemoryResult[], query: string): string {
  if (memories.length === 0) return '';
  const top = memories[0];
  const avgScore = memories.reduce((a, m) => a + m.score, 0) / memories.length;
  const bucketSet = [...new Set(memories.map(m => m.bucket))];
  let text = `Based on your query "${query}", I retrieved ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}`;
  if (bucketSet.length === 1) text += ` from the "${bucketSet[0]}" bucket`;
  else text += ` across ${bucketSet.length} buckets`;
  text += `. The highest relevance score is ${top.score.toFixed(2)} for "${top.title}".`;
  if (avgScore >= 0.8) text += ' These results are highly relevant to your query.';
  else if (avgScore >= 0.6) text += ' These results show moderate relevance.';
  else text += ' These results have low confidence — try refining your query.';
  return text;
}

export function Playground({ buckets, totalMemories, totalTokens, userName, onBack }: PlaygroundProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

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
    // Scroll to bottom when new messages arrive
    const el = messagesEndRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [activeSession?.messages.length, loading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !activeSessionId) return;

    const userMsg: ChatMessage = { id: `m_${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };

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
      const res = await fetch('/api/dashboard/playground', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, bucket: selectedBucket, limit: 10 }),
      });

      let assistantMsg: ChatMessage;

      if (res.ok) {
        const data = await res.json();
        const memories: MemoryResult[] = data.memories || [];

        if (memories.length > 0) {
          assistantMsg = {
            id: `m_${Date.now()}`, role: 'assistant',
            content: 'Retrieved',
            timestamp: Date.now(),
            memories,
            reasoning: buildReasoning(memories, text),
          };
        } else {
          assistantMsg = {
            id: `m_${Date.now()}`, role: 'assistant',
            content: 'No Memories Added',
            timestamp: Date.now(),
          };
        }
      } else {
        assistantMsg = {
          id: `m_${Date.now()}`, role: 'assistant',
          content: 'Failed to query memories. Please try again.',
          timestamp: Date.now(),
        };
      }

      setSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? { ...s, lastMessage: assistantMsg.content.slice(0, 60), messages: [...s.messages, assistantMsg] }
          : s
      ));
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
  }, [input, loading, activeSessionId, selectedBucket]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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

  const filteredSessions = sidebarSearch
    ? sessions.filter(s => s.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : sessions;

  return (
    <div className="pg-overlay">
      {/* ── Sidebar ── */}
      <aside className="pg-sidebar">
        <div className="pg-sidebar-top">
          <button className="pg-back" onClick={onBack} title="Back to Dashboard">
            <ArrowLeft size={16} />
          </button>
          <span className="pg-logo">Playground</span>
        </div>

        <div className="pg-search-box">
          <Search size={13} className="pg-search-icon" />
          <input className="pg-search-input" placeholder="Search chats..." value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        </div>

        <div className="pg-section">
          <div className="pg-section-label">Context Filter</div>
          <select className="pg-select" value={selectedBucket ?? ''} onChange={e => setSelectedBucket(e.target.value || null)}>
            <option value="">All Buckets</option>
            {buckets.map(b => (
              <option key={b.id} value={b.slug}>{b.name} ({b.memoryCount})</option>
            ))}
          </select>
        </div>

        <div className="pg-section pg-section-grow">
          <div className="pg-section-label">Buckets</div>
          <div className="pg-bucket-list">
            {buckets.map(b => (
              <button key={b.id} className={`pg-bucket-item${selectedBucket === b.slug ? ' pg-bucket-active' : ''}`} onClick={() => setSelectedBucket(prev => prev === b.slug ? null : b.slug)}>
                <Hash size={12} />
                <span className="pg-bucket-name">{b.name}</span>
                <span className="pg-bucket-count">{b.memoryCount}</span>
              </button>
            ))}
            {buckets.length === 0 && <div className="pg-empty-hint">No buckets yet</div>}
          </div>
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
            <div className="pg-messages">
              {/* Greeting with animated subtitle */}
              {activeSession.messages.length === 0 && (
                <div className="pg-greeting">
                  <h2 className="pg-greeting-text text-3xl font-semibold text-center mb-1">Hi {userName}</h2>
                  <TypewriterSubtitle />
                </div>
              )}

              {activeSession.messages.map(msg => (
                <div key={msg.id} className={`pg-msg pg-msg-${msg.role}`}>
                  {msg.role === 'user' ? (
                    <div className="pg-user-bubble">{msg.content}</div>
                  ) : (
                    <div className="pg-assistant-block">
                      {msg.content === 'No Memories Added' ? (
                        <div className="pg-no-mem">{msg.content}</div>
                      ) : (
                        <>
                          {msg.memories && msg.memories.length > 0 && (
                            <>
                              <div className="pg-retrieved-label">{msg.content}</div>
                              <div className="pg-score-row">
                                {msg.memories.map(m => (
                                  <div key={m.id} className="pg-score-card">
                                    <span className={`pg-score-badge ${scoreLevel(m.score)}`}>
                                      Score: {m.score.toFixed(2)}
                                    </span>
                                    <span className="pg-score-title">{m.title}</span>
                                  </div>
                                ))}
                              </div>
                              {msg.reasoning && (
                                <div className="pg-reasoning">{msg.reasoning}</div>
                              )}
                            </>
                          )}
                          {!msg.memories && <div className="pg-assistant-text">{msg.content}</div>}
                        </>
                      )}
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
              <div className="pg-input-box">
                <textarea
                  ref={inputRef}
                  className="pg-textarea"
                  placeholder="Type a message..."
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={loading}
                />
                <button className="pg-send" onClick={sendMessage} disabled={loading || !input.trim()}>
                  {loading ? <Loader2 size={16} className="pg-spin" /> : <IconSend />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="pg-greeting">
            <h2 className="pg-greeting-text text-3xl font-semibold text-center mb-1">Hi {userName}</h2>
            <TypewriterSubtitle />
          </div>
        )}
      </section>
    </div>
  );
}
