'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, ThumbsUp, ThumbsDown, Minus,
  Loader2, RefreshCw, AlertTriangle, Check,
  X, ChevronRight, Clock, Cpu, Zap,
} from 'lucide-react';

/* ── Types ── */
interface RunRecord {
  id: number;
  runId: string;
  sessionId: string;
  agentId: string | null;
  workspaceId: string | null;
  taskId: string | null;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number | null;
  hallucinationFlag: boolean;
  successScore: number;
  userFeedback: string | null;
  finalAcceptance: boolean;
  failureReason: string | null;
  createdAt: string;
}

interface RunMetrics {
  totalRuns: number;
  hallucinationRate: number;
  avgLatencyMs: number;
  avgTokens: number;
  successRate: number;
}

interface RunAnalyticsViewProps {
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

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="mm-run-score-wrap">
      <div className="mm-run-score-bar">
        <div className="mm-run-score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mm-run-score-label" style={{ color }}>{pct}%</span>
    </div>
  );
}

export function RunAnalyticsView({ orgId }: RunAnalyticsViewProps) {
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RunRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'hallucination' | 'failed'>('all');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const orgParam = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
      const res = await fetch(`/api/dashboard/runs${orgParam}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setMetrics(data.metrics || null);
      setRuns(data.runs || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const submitFeedback = async (feedback: 'positive' | 'negative' | 'neutral') => {
    if (!selected) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/dashboard/runs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: selected.runId, feedback }),
      });
      if (res.ok) {
        showToast('Feedback recorded ✓');
        await fetchRuns();
        setSelected(prev => prev ? { ...prev, userFeedback: feedback } : prev);
      }
    } catch { /* ignore */ } finally {
      setFeedbackLoading(false);
    }
  };

  const filteredRuns = runs.filter(r => {
    if (filter === 'hallucination') return r.hallucinationFlag;
    if (filter === 'failed') return r.successScore < 0.4;
    return true;
  });

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
          <h1 className="mm-page-title">Run Analytics</h1>
          <p className="mm-page-subtitle">Monitor agent execution runs, hallucinations, and performance.</p>
        </div>
        <button className="mm-btn-icon-sm" onClick={fetchRuns} title="Refresh">
          <RefreshCw size={14} className={loading ? 'mm-spin' : ''} />
        </button>
      </div>

      {/* Metric cards */}
      {metrics && (
        <div className="mm-run-metrics">
          <div className="mm-run-metric-card">
            <div className="mm-run-metric-icon" style={{ background: 'rgba(124,58,237,0.12)' }}>
              <Activity size={16} style={{ color: '#a78bfa' }} />
            </div>
            <div className="mm-run-metric-body">
              <span className="mm-run-metric-val">{metrics.totalRuns.toLocaleString()}</span>
              <span className="mm-run-metric-label">Total Runs</span>
            </div>
          </div>
          <div className="mm-run-metric-card">
            <div className="mm-run-metric-icon" style={{ background: metrics.hallucinationRate > 10 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)' }}>
              <AlertTriangle size={16} style={{ color: metrics.hallucinationRate > 10 ? '#ef4444' : '#22c55e' }} />
            </div>
            <div className="mm-run-metric-body">
              <span className="mm-run-metric-val" style={{ color: metrics.hallucinationRate > 10 ? '#ef4444' : undefined }}>
                {metrics.hallucinationRate}%
              </span>
              <span className="mm-run-metric-label">Hallucination Rate</span>
            </div>
          </div>
          <div className="mm-run-metric-card">
            <div className="mm-run-metric-icon" style={{ background: 'rgba(249,115,22,0.12)' }}>
              <Clock size={16} style={{ color: '#f97316' }} />
            </div>
            <div className="mm-run-metric-body">
              <span className="mm-run-metric-val">{formatMs(metrics.avgLatencyMs)}</span>
              <span className="mm-run-metric-label">Avg Latency</span>
            </div>
          </div>
          <div className="mm-run-metric-card">
            <div className="mm-run-metric-icon" style={{ background: 'rgba(34,211,238,0.12)' }}>
              <Zap size={16} style={{ color: '#22d3ee' }} />
            </div>
            <div className="mm-run-metric-body">
              <span className="mm-run-metric-val">{metrics.avgTokens.toLocaleString()}</span>
              <span className="mm-run-metric-label">Avg Tokens / Run</span>
            </div>
          </div>
          <div className="mm-run-metric-card">
            <div className="mm-run-metric-icon" style={{ background: 'rgba(34,197,94,0.12)' }}>
              <Check size={16} style={{ color: '#22c55e' }} />
            </div>
            <div className="mm-run-metric-body">
              <span className="mm-run-metric-val">{metrics.successRate}%</span>
              <span className="mm-run-metric-label">Success Rate</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mm-split-tabs-row" style={{ marginTop: 0 }}>
        <div className="mm-split-tabs">
          {(['all', 'hallucination', 'failed'] as const).map(f => (
            <button
              key={f}
              className={`mm-split-tab${filter === f ? ' active' : ''}`}
              onClick={() => { setFilter(f); setSelected(null); }}
            >
              {f === 'all' && <Activity size={13} />}
              {f === 'hallucination' && <AlertTriangle size={13} />}
              {f === 'failed' && <X size={13} />}
              <span>{f === 'all' ? 'All Runs' : f === 'hallucination' ? 'Hallucinations' : 'Failed'}</span>
              {f === 'hallucination' && metrics && metrics.hallucinationRate > 0 && (
                <span className="mm-split-tab-badge" style={{ background: '#ef444420', color: '#ef4444' }}>
                  {runs.filter(r => r.hallucinationFlag).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Split body */}
      <div className="mm-split-body">
        {/* LEFT: Runs list */}
        <div className="mm-split-list">
          {loading ? (
            <div className="mm-split-empty">
              <Loader2 size={22} className="mm-spin" />
              <p>Loading runs…</p>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="mm-split-empty">
              <Activity size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <p>No {filter !== 'all' ? filter : ''} runs recorded yet</p>
            </div>
          ) : (
            filteredRuns.map(run => (
              <button
                key={run.runId}
                className={`mm-split-list-item${selected?.runId === run.runId ? ' active' : ''}${run.hallucinationFlag ? ' mm-run-halluc' : ''}`}
                onClick={() => setSelected(run)}
              >
                <div className="mm-split-list-top">
                  <span className="mm-split-list-title mm-mono-sm">
                    {run.runId.slice(0, 12)}…
                  </span>
                  {run.hallucinationFlag && (
                    <AlertTriangle size={11} style={{ color: '#ef4444', flexShrink: 0 }} />
                  )}
                </div>
                <div className="mm-split-list-meta">
                  <span className="mm-run-model-badge">{run.modelName}</span>
                  <span className="mm-split-list-time">{relativeTime(run.createdAt)}</span>
                </div>
                <ScoreBar score={run.successScore} />
              </button>
            ))
          )}
        </div>

        {/* RIGHT: Run detail */}
        <div className={`mm-split-detail${selected ? ' has-item' : ''}`}>
          {!selected ? (
            <div className="mm-split-empty">
              <Activity size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <p>Select a run to inspect</p>
            </div>
          ) : (
            <>
              <div className="mm-split-detail-head">
                <div className="mm-split-detail-badges">
                  {selected.hallucinationFlag && (
                    <span className="mm-split-cat-badge" style={{ background: '#ef444418', color: '#ef4444', borderColor: '#ef444430' }}>
                      <AlertTriangle size={10} /> Hallucination
                    </span>
                  )}
                  <span className={`mm-split-status-badge mm-split-status-${selected.finalAcceptance ? 'knowledge' : selected.successScore >= 0.5 ? 'context' : 'untriaged'}`}>
                    {selected.finalAcceptance ? 'accepted' : selected.successScore >= 0.5 ? 'partial' : 'failed'}
                  </span>
                </div>
                <h2 className="mm-split-detail-title mm-mono-sm">{selected.runId}</h2>
              </div>

              {/* Stats grid */}
              <div className="mm-run-detail-grid">
                <div className="mm-run-detail-stat">
                  <Cpu size={12} />
                  <span className="mm-run-detail-label">Model</span>
                  <span className="mm-run-detail-val">{selected.modelName}</span>
                </div>
                <div className="mm-run-detail-stat">
                  <Clock size={12} />
                  <span className="mm-run-detail-label">Latency</span>
                  <span className="mm-run-detail-val">{formatMs(selected.latencyMs)}</span>
                </div>
                <div className="mm-run-detail-stat">
                  <Zap size={12} />
                  <span className="mm-run-detail-label">Tokens In</span>
                  <span className="mm-run-detail-val">{selected.inputTokens.toLocaleString()}</span>
                </div>
                <div className="mm-run-detail-stat">
                  <Zap size={12} />
                  <span className="mm-run-detail-label">Tokens Out</span>
                  <span className="mm-run-detail-val">{selected.outputTokens.toLocaleString()}</span>
                </div>
                <div className="mm-run-detail-stat">
                  <Activity size={12} />
                  <span className="mm-run-detail-label">Session</span>
                  <span className="mm-run-detail-val mm-mono-sm">{selected.sessionId?.slice(0, 10) || '—'}…</span>
                </div>
                <div className="mm-run-detail-stat">
                  <Check size={12} />
                  <span className="mm-run-detail-label">Success Score</span>
                  <span className="mm-run-detail-val">{Math.round(selected.successScore * 100)}%</span>
                </div>
              </div>

              {selected.failureReason && (
                <div className="mm-run-failure">
                  <AlertTriangle size={13} />
                  <span>{selected.failureReason}</span>
                </div>
              )}

              {/* Feedback */}
              <div className="mm-run-feedback">
                <span className="mm-run-feedback-label">Rate this run:</span>
                <div className="mm-run-feedback-btns">
                  <button
                    className={`mm-run-fb-btn${selected.userFeedback === 'positive' ? ' active-green' : ''}`}
                    onClick={() => submitFeedback('positive')}
                    disabled={feedbackLoading}
                    title="Positive"
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    className={`mm-run-fb-btn${selected.userFeedback === 'neutral' ? ' active-amber' : ''}`}
                    onClick={() => submitFeedback('neutral')}
                    disabled={feedbackLoading}
                    title="Neutral"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    className={`mm-run-fb-btn${selected.userFeedback === 'negative' ? ' active-red' : ''}`}
                    onClick={() => submitFeedback('negative')}
                    disabled={feedbackLoading}
                    title="Negative"
                  >
                    <ThumbsDown size={14} />
                  </button>
                </div>
                {selected.userFeedback && (
                  <span className="mm-run-feedback-current">
                    Current: {selected.userFeedback}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
