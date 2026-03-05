'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useUserSync } from '@/lib/hooks/use-user-sync';
import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ThemeMode } from './_components/sidebar';
import {
  Loader2, AlertTriangle,
  Brain, Zap, Gauge, Users, TrendingUp, Clock, BarChart3,
  Activity, FolderPlus, Share2, MessageSquare, Webhook,
  Settings, CreditCard, Bell, CheckCheck, Archive, X,
  Info, Lock, Globe, Palette, Shield, Eye, EyeOff,
  Mail, Sparkles, Rocket,
} from 'lucide-react';
import {
  Sidebar,
  CommandPalette,
  ApiKeysPage,
  ShareBucketModal,
  CreateBucketModal,
} from './_components';
import { DonutChart } from './_components/charts';
import { Topbar } from './_components/topbar';
import type { OrgInfo, UserInfo, ApiKeyInfo } from './_components';
import { useDashboardData } from './_hooks/use-dashboard-data';

/* ── Time filter configs ── */
const TIME_FILTERS = [
  { label: 'Today', range: 'today' },
  { label: '7 days', range: '7d' },
  { label: '30 days', range: '30d' },
  { label: 'Quarter', range: 'quarter' },
  { label: 'Year', range: 'year' },
];

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { isReady } = useUserSync();

  const [organization, setOrganization] = useState<OrgInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [active, setActive] = useState('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('30d');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [usageDismissed, setUsageDismissed] = useState(false);
  const [notifTab, setNotifTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [notifData, setNotifData] = useState<{ id: string; type: string; title: string; body: string | null; isRead: boolean; createdAt: string; archived?: boolean }[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);

  /* ── Theme management ── */
  useEffect(() => {
    const stored = localStorage.getItem('mm-theme') as ThemeMode | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem('mm-theme', theme);
    const root = document.documentElement;

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.setAttribute('data-mm-theme', mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => {
        root.setAttribute('data-mm-theme', e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      root.setAttribute('data-mm-theme', theme);
    }
  }, [theme]);

  const {
    stats, buckets, memoryRows, activityItems, sparkTokens, sparkMemories,
    loading: dataLoading, error: dataError, refresh: refreshData,
  } = useDashboardData(isLoaded && !!user, timeRange);

  /* ── Prevent back ── */
  useEffect(() => {
    window.history.replaceState(null, '', '/dashboard');
    const h = () => window.history.pushState(null, '', '/dashboard');
    window.history.pushState(null, '', '/dashboard');
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  /* ── Fetch onboarding data ── */
  useEffect(() => {
    if (!isLoaded || !user) return;
    (async () => {
      try {
        const r = await fetch('/api/onboarding', { credentials: 'include' });
        if (!r.ok) return;
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const d = await r.json();
        if (d.organization) setOrganization(d.organization);
        if (d.user) setUserInfo(d.user);
        if (d.apiKey) setApiKeyInfo(d.apiKey);
      } catch { /* ignore */ }
    })();
  }, [isLoaded, user]);

  /* ── Ctrl+K ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(p => !p); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ── Notifications fetch ── */
  useEffect(() => {
    if (active !== 'notifications') return;
    (async () => {
      try {
        setNotifLoading(true);
        const res = await fetch('/api/dashboard/notifications', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNotifData((data.notifications || []).map((n: any) => ({ ...n, archived: false })));
        }
      } catch { /* ignore */ } finally { setNotifLoading(false); }
    })();
  }, [active]);

  const doSignOut = useCallback(async () => {
    document.cookie = 'memron_onboarded=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    await signOut();
    router.push('/');
  }, [signOut, router]);

  /* ── Area chart data (24 hours from API) ── */
  const areaChartData = useMemo(() => {
    if (stats.hourlyChart && stats.hourlyChart.length === 24) {
      return stats.hourlyChart;
    }
    // Fallback: evenly spread dailyChart values across 24 hours
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const val = stats.dailyChart[i % stats.dailyChart.length]?.value ?? 0;
      hours.push({ label: `${String(i).padStart(2, '0')}:00`, value: val });
    }
    return hours;
  }, [stats.hourlyChart, stats.dailyChart]);

  /* Generate smooth SVG path using cubic bezier */
  const generateSmoothPath = useCallback((data: number[], width: number, height: number, padding = 5) => {
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - padding - (v / max) * (height - padding * 2),
    }));

    if (points.length < 2) return '';

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 3;
      const cp1y = points[i].y;
      const cp2x = points[i + 1].x - (points[i + 1].x - points[i].x) / 3;
      const cp2y = points[i + 1].y;
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return path;
  }, []);

  /* ── Heatmap data (from API — real per-day counts over 5 months) ── */
  const heatmapData = useMemo(() => {
    if (stats.heatmapData && stats.heatmapData.length > 0) {
      return stats.heatmapData;
    }
    // Fallback: 5 months of empty data
    const now = new Date();
    return Array.from({ length: 5 }, (_, m) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (4 - m), 1);
      return {
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        weeks: Array.from({ length: 5 }, () => Array(7).fill(0)),
      };
    });
  }, [stats.heatmapData]);

  /* ── Distribution data ── */
  const distribution = useMemo(() => {
    if (stats.buckets.length === 0) return [
      { label: 'Main', pct: 100, color: '#f97316' },
    ];
    const total = stats.buckets.reduce((s, b) => s + b.count, 0) || 1;
    const colors = ['#f97316', '#7c3aed', '#6366f1', '#22c55e', '#3b82f6', '#52525b'];
    return stats.buckets.map((b, i) => ({
      label: b.name,
      pct: Math.round((b.count / total) * 100),
      color: colors[i % colors.length],
    }));
  }, [stats.buckets]);

  /* ── Trend line data (driven by the selected time range) ── */
  const trendData = useMemo(() => {
    // When "Today" is selected, show hourly breakdown for the trend
    if (timeRange === 'today' && stats.hourlyChart && stats.hourlyChart.length > 0) {
      const chart = stats.hourlyChart;
      if (chart.length <= 12) return chart;
      const step = Math.max(1, Math.floor(chart.length / 12));
      const sampled = [];
      for (let i = 0; i < chart.length; i += step) {
        sampled.push(chart[i]);
      }
      if (sampled[sampled.length - 1] !== chart[chart.length - 1]) {
        sampled.push(chart[chart.length - 1]);
      }
      return sampled;
    }
    if (stats.dailyChart.length > 0) {
      const chart = stats.dailyChart;
      if (chart.length <= 10) return chart;
      const step = Math.max(1, Math.floor(chart.length / 7));
      const sampled = [];
      for (let i = 0; i < chart.length; i += step) {
        sampled.push(chart[i]);
      }
      if (sampled[sampled.length - 1] !== chart[chart.length - 1]) {
        sampled.push(chart[chart.length - 1]);
      }
      return sampled;
    }
    return [];
  }, [stats.dailyChart, stats.hourlyChart, timeRange]);

  const compressionRatio = stats.originalTokens > 0
    ? `${((1 - stats.totalTokens / stats.originalTokens) * 100).toFixed(0)}%`
    : stats.totalMemories > 0 ? '99%' : '0%';

  const memoryDeltaStr = stats.memoryDelta > 0
    ? `+${stats.memoryDelta.toFixed(1)}%`
    : stats.memoryDelta < 0
      ? `${stats.memoryDelta.toFixed(1)}%`
      : '0%';

  const avgTokensPerMem = stats.totalMemories > 0
    ? Math.round(stats.totalTokens / stats.totalMemories)
    : 0;

  /* ── Loading ── */
  if (!isLoaded || !isReady) {
    return (
      <div className="mm-loading">
        <Loader2 size={28} className="mm-spin" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  /* ══════════ DASHBOARD OVERVIEW ══════════ */
  const renderDashboard = () => (
    <div className="mm-dashboard">
      {/* ── Top Header ── */}
      <Topbar
        org={organization}
        buckets={buckets}
        selectedBucket={selectedBucket}
        onSelectBucket={setSelectedBucket}
        onCreateBucket={() => setCreateBucketOpen(true)}
        activePage={active}
        onSearch={() => setCmdOpen(true)}
        onRefresh={refreshData}
        onSettings={() => setActive('config')}
        isLoading={dataLoading}
        notificationsEnabled={isLoaded && !!user}
      />

      {/* ── Page Title + Time Filters ── */}
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Dashboard</h1>
          <p className="mm-page-subtitle">Your memory performance at a glance.</p>
        </div>
        <div className="mm-time-filters">
          {TIME_FILTERS.map(t => (
            <button
              key={t.range}
              className={`mm-time-btn${timeRange === t.range ? ' active' : ''}`}
              onClick={() => setTimeRange(t.range)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {dataError && (
        <div className="mm-error-bar">
          <AlertTriangle size={13} /> {dataError}
          <button onClick={refreshData}>Retry</button>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <div className="mm-content">

        {/* ── Large Area Chart + Insights ── */}
        <div className="mm-chart-panel">
          <div className="mm-chart-main">
            <h2 className="mm-chart-title">Memory performance</h2>
            <div className="mm-chart-svg-wrap">
              <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="mm-area-chart">
                <defs>
                  <linearGradient id="mmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="mmLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6d28d9" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                {(() => {
                  const values = areaChartData.map(d => d.value);
                  const linePath = generateSmoothPath(values, 800, 190, 10);
                  const max = Math.max(...values, 1);
                  const lastX = 800;
                  const areaPath = `${linePath} L ${lastX},190 L 0,190 Z`;
                  return (
                    <>
                      <path d={areaPath} fill="url(#mmAreaGrad)" />
                      <path d={linePath} fill="none" stroke="url(#mmLineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  );
                })()}
                {/* X-axis labels */}
                {areaChartData.filter((_, i) => i % 4 === 0).map((d, idx) => (
                  <text key={idx} x={((idx * 4) / 23) * 800} y="198" className="mm-chart-label">{d.label}</text>
                ))}
              </svg>
            </div>
          </div>
          <div className="mm-chart-insights">
            <div className="mm-insight">
              <div className="mm-insight-icon-wrap mm-insight-green">
                <TrendingUp size={14} />
              </div>
              <div className="mm-insight-body">
                <span className="mm-insight-label">Memories growing</span>
                <span className="mm-insight-value mm-green">{memoryDeltaStr} MoM</span>
              </div>
            </div>
            <div className="mm-insight">
              <div className="mm-insight-icon-wrap mm-insight-amber">
                <Clock size={14} />
              </div>
              <div className="mm-insight-body">
                <span className="mm-insight-label">Peak activity time</span>
                <span className="mm-insight-value">{stats.peakHour || '—'}</span>
              </div>
            </div>
            <div className="mm-insight">
              <div className="mm-insight-icon-wrap mm-insight-violet">
                <BarChart3 size={14} />
              </div>
              <div className="mm-insight-body">
                <span className="mm-insight-label">Compression ratio</span>
                <span className="mm-insight-value mm-green">+{compressionRatio}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="mm-stats-row">
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Total Memories</span>
              <div className="mm-stat-icon-wrap mm-icon-violet"><Brain size={16} strokeWidth={1.6} /></div>
            </div>
            <span className="mm-stat-value">{stats.totalMemories.toLocaleString()}</span>
            <span className={`mm-stat-delta ${stats.memoryDelta >= 0 ? 'mm-green' : 'mm-red'}`}>
              {memoryDeltaStr} vs prev period
              {stats.memoryDelta >= 0 && <TrendingUp size={11} />}
            </span>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Tokens processed</span>
              <div className="mm-stat-icon-wrap mm-icon-amber"><Zap size={16} strokeWidth={1.6} /></div>
            </div>
            <span className="mm-stat-value">{stats.totalTokens.toLocaleString()}</span>
            <span className="mm-stat-delta mm-muted">avg value: {avgTokensPerMem.toLocaleString()} tok/mem</span>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Compression rate</span>
              <div className="mm-stat-icon-wrap mm-icon-green"><Gauge size={16} strokeWidth={1.6} /></div>
            </div>
            <span className="mm-stat-value">{compressionRatio}</span>
            <span className="mm-stat-delta mm-green">
              optimized <Activity size={11} />
            </span>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Active sessions</span>
              <div className="mm-stat-icon-wrap mm-icon-blue"><Users size={16} strokeWidth={1.6} /></div>
            </div>
            <span className="mm-stat-value">{stats.activeSessions}</span>
            <span className="mm-stat-delta">
              real time <span className="mm-live-dot" />
            </span>
          </div>
        </div>

        {/* ── Bottom Row: Heatmap + Bucket Distribution ── */}
        <div className="mm-bottom-row">
          {/* Memory Heatmap */}
          <div className="mm-panel mm-heatmap-panel">
            <div className="mm-panel-head">
              <h2>Memory Heatmap</h2>
              <div className="mm-legend-row">
                {distribution.map((d, i) => (
                  <span key={i} className="mm-legend-item">
                    <span className="mm-legend-dot" style={{ background: d.color }} />
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="mm-heatmap-wrap">
              {heatmapData.map((month, mi) => (
                <div key={mi} className="mm-heatmap-col">
                  <div className="mm-heatmap-grid">
                    {month.weeks.map((week, wi) => (
                      <div key={wi} className="mm-heatmap-week">
                        {week.map((v, di) => {
                          if (v === -1) return <div key={di} className="mm-hm-cell lv-empty" />;
                          const lv = v === 0 ? 0 : v <= 1 ? 1 : v <= 2 ? 2 : v <= 4 ? 3 : 4;
                          return <div key={di} className={`mm-hm-cell lv-${lv}`} title={`${v} memories`} />;
                        })}
                      </div>
                    ))}
                  </div>
                  <span className="mm-heatmap-month">{month.month}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bucket Distribution Donut */}
          <div className="mm-panel mm-dist-panel">
            <div className="mm-panel-head">
              <h2>Bucket Distribution</h2>
              <span className="mm-panel-count">{stats.buckets.length} buckets</span>
            </div>
            <div className="mm-dist-body">
              {stats.buckets.length > 0 ? (
                <DonutChart
                  segments={distribution.map(d => ({ value: d.pct, color: d.color, label: d.label }))}
                  size={150}
                  thickness={18}
                  centerValue={stats.totalMemories}
                  centerLabel="memories"
                />
              ) : (
                <div className="mm-empty-state" style={{ padding: '32px 0' }}>
                  <Brain size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
                  <p>No bucket data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Memory Trends — Full Width ── */}
        <div className="mm-panel mm-trend-panel mm-trend-full">
          <div className="mm-panel-head">
            <h2>Memory Trends</h2>
            <div className="mm-legend-row">
              {distribution.map((d, i) => (
                <span key={i} className="mm-legend-item">
                  <span className="mm-legend-dot" style={{ background: d.color }} />
                  {d.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mm-trend-chart-wrap">
            <svg viewBox="0 0 800 130" preserveAspectRatio="none" className="mm-trend-svg">
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line key={i} x1="40" y1={10 + i * 25} x2="780" y2={10 + i * 25} stroke="#1c1c1f" strokeWidth="0.5" />
              ))}
              {/* Area fill + line */}
              {(() => {
                const values = trendData.map(d => d.value);
                const linePath = generateSmoothPath(values, 740, 110, 10);
                if (!linePath) return null;
                return (
                  <g transform="translate(40, 0)">
                    <defs>
                      <linearGradient id="mmTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${linePath} L 740,110 L 0,110 Z`} fill="url(#mmTrendFill)" />
                    <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {values.map((v, i) => {
                      const max = Math.max(...values, 1);
                      const x = values.length > 1 ? (i / (values.length - 1)) * 740 : 370;
                      const y = 110 - 10 - (v / max) * 90;
                      return <circle key={i} cx={x} cy={y} r="3.5" fill="#8b5cf6" stroke="#0c0c0e" strokeWidth="1.5" />;
                    })}
                  </g>
                );
              })()}
              {/* X labels */}
              {trendData.map((d, i) => (
                <text key={i} x={40 + (trendData.length > 1 ? (i / (trendData.length - 1)) * 740 : 370)} y="126" className="mm-chart-label" textAnchor="middle">
                  {d.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Memories Page ══════════ */
  const renderMemories = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="memories" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Memories</h1>
          <p className="mm-page-subtitle">All stored memories across your buckets.</p>
        </div>
      </div>
      <div className="mm-content">
        <div className="mm-panel" style={{ flex: 1 }}>
          <div className="mm-panel-head">
            <h2>All Memories</h2>
            <span className="mm-panel-count">{memoryRows.length}</span>
          </div>
          <div className="mm-memory-list">
            {memoryRows.length === 0 ? (
              <div className="mm-empty-state">
                <Brain size={32} strokeWidth={1.2} className="mm-empty-icon-svg" />
                <h3>No memories yet</h3>
                <p>Connect your AI agent and start storing memories via the MCP server.</p>
              </div>
            ) : memoryRows.map((m) => (
              <div key={m.id} className="mm-memory-item">
                <span className="mm-memory-content">{m.content}</span>
                <span className="mm-memory-badge">{m.entity}</span>
                <span className="mm-memory-time">{m.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Playground Page ══════════ */
  const renderPlayground = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="playground" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Playground</h1>
          <p className="mm-page-subtitle">Test memory operations in real-time.</p>
        </div>
      </div>
      <div className="mm-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div className="mm-coming-soon-card">
          <div className="mm-cs-icon-wrap">
            <MessageSquare size={32} strokeWidth={1.4} />
          </div>
          <h3 className="mm-cs-title">Playground</h3>
          <p className="mm-cs-desc">Chat with your memory layer, run queries, and experiment with your AI agents — all in one interactive terminal.</p>
          <div className="mm-cs-badge">
            <Rocket size={12} /> Coming in v2.0
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Settings Page ══════════ */
  const renderConfig = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="config" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Settings</h1>
          <p className="mm-page-subtitle">Manage your workspace and preferences.</p>
        </div>
      </div>
      <div className="mm-content">
        {/* General */}
        <div className="mm-panel">
          <div className="mm-panel-head">
            <h2><Globe size={15} strokeWidth={1.6} /> General</h2>
          </div>
          <div className="mm-config-list">
            {[
              { label: 'Workspace', value: organization?.name || 'Default' },
              { label: 'Slug', value: organization?.slug || '—' },
              { label: 'Plan', value: 'Free (Beta)' },
              { label: 'User ID', value: userInfo?.universalId || '—', mono: true },
              { label: 'Email', value: userInfo?.email || '—' },
            ].map((c, i) => (
              <div key={i} className="mm-config-row">
                <span className="mm-config-label">{c.label}</span>
                <span className={`mm-config-value${c.mono ? ' mono' : ''}`}>{c.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Appearance */}
        <div className="mm-panel">
          <div className="mm-panel-head">
            <h2><Palette size={15} strokeWidth={1.6} /> Appearance</h2>
          </div>
          <div className="mm-config-list">
            <div className="mm-config-row">
              <span className="mm-config-label">Theme</span>
              <span className="mm-config-value">{theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">Language</span>
              <span className="mm-config-value">English (US)</span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="mm-panel">
          <div className="mm-panel-head">
            <h2><Shield size={15} strokeWidth={1.6} /> Security</h2>
          </div>
          <div className="mm-config-list">
            <div className="mm-config-row">
              <span className="mm-config-label">Authentication</span>
              <span className="mm-config-value">Clerk SSO</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">API Keys</span>
              <span className="mm-config-value">{stats.activeSessions || 0} active</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">MCP Server</span>
              <span className="mm-config-value mm-green">Connected</span>
            </div>
          </div>
        </div>

        {/* Danger */}
        <div className="mm-panel mm-panel-danger">
          <div className="mm-panel-head">
            <h2><AlertTriangle size={15} strokeWidth={1.6} /> Danger Zone</h2>
          </div>
          <div className="mm-config-list">
            <div className="mm-config-row">
              <div>
                <span className="mm-config-label">Delete all memories</span>
                <span className="mm-config-hint">This action cannot be undone.</span>
              </div>
              <button className="mm-btn-danger" disabled>Delete All</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Graph Memory (Coming Soon) ══════════ */
  const renderGraphMemory = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="graph-memory" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Graph Memory</h1>
          <p className="mm-page-subtitle">Visualize memory relationships and knowledge graphs.</p>
        </div>
      </div>
      <div className="mm-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div className="mm-coming-soon-card">
          <div className="mm-cs-icon-wrap mm-cs-violet">
            <Brain size={32} strokeWidth={1.4} />
          </div>
          <h3 className="mm-cs-title">Graph Memory</h3>
          <p className="mm-cs-desc">Explore interconnected memory nodes, entity relationships, and knowledge graphs with an interactive visual explorer.</p>
          <div className="mm-cs-badge">
            <Sparkles size={12} /> Coming in v2.0
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Webhooks (UI Only) ══════════ */
  const renderWebhooks = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="webhooks" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Webhooks</h1>
          <p className="mm-page-subtitle">Get notified when memory events occur.</p>
        </div>
      </div>
      <div className="mm-content">
        <div className="mm-blur-overlay">
          <div className="mm-panel">
            <div className="mm-panel-head">
              <h2>Webhook Endpoints</h2>
              <button className="mm-btn-primary" disabled>+ Add Endpoint</button>
            </div>
            <div className="mm-webhook-list">
              <div className="mm-webhook-row">
                <div className="mm-webhook-icon"><Webhook size={15} /></div>
                <div className="mm-webhook-info">
                  <span className="mm-webhook-url">https://api.example.com/webhooks/memron</span>
                  <span className="mm-webhook-meta">memory.created, memory.updated</span>
                </div>
                <span className="mm-webhook-status mm-green">Active</span>
              </div>
              <div className="mm-webhook-row">
                <div className="mm-webhook-icon"><Webhook size={15} /></div>
                <div className="mm-webhook-info">
                  <span className="mm-webhook-url">https://slack.com/hooks/T123/B456</span>
                  <span className="mm-webhook-meta">bucket.shared</span>
                </div>
                <span className="mm-webhook-status mm-muted">Paused</span>
              </div>
            </div>
          </div>
          <div className="mm-blur-cover">
            <div className="mm-coming-soon-card mm-cs-compact">
              <div className="mm-cs-icon-wrap">
                <Webhook size={28} strokeWidth={1.4} />
              </div>
              <h3 className="mm-cs-title">Webhooks</h3>
              <p className="mm-cs-desc">Subscribe to memory events and trigger external workflows.</p>
              <div className="mm-cs-badge">
                <Rocket size={12} /> Coming in v2.0
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Usage & Billing ══════════ */
  const renderUsage = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="usage" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Usage & Billing</h1>
          <p className="mm-page-subtitle">Track your resource consumption and plan.</p>
        </div>
      </div>
      <div className="mm-content">
        {!usageDismissed && (
          <div className="mm-beta-banner">
            <div className="mm-beta-banner-content">
              <Sparkles size={18} />
              <div>
                <h4>Memron is currently in Beta</h4>
                <p>You&apos;re on the <strong>Free Beta</strong> plan. All features are available during the beta period. Usage limits and paid plans will be introduced in v2.0 production release.</p>
              </div>
            </div>
            <button className="mm-beta-dismiss" onClick={() => setUsageDismissed(true)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mm-panel">
          <div className="mm-panel-head"><h2>Current Plan</h2></div>
          <div className="mm-config-list">
            <div className="mm-config-row">
              <span className="mm-config-label">Plan</span>
              <span className="mm-config-value"><span className="mm-badge-beta">Beta</span> Free</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">Version</span>
              <span className="mm-config-value">v1.0 (Beta)</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">Memories</span>
              <span className="mm-config-value">{stats.totalMemories.toLocaleString()} / Unlimited</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">API Keys</span>
              <span className="mm-config-value">{stats.activeSessions || 0} / 5</span>
            </div>
            <div className="mm-config-row">
              <span className="mm-config-label">Tokens Processed</span>
              <span className="mm-config-value">{stats.totalTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Notifications Page ══════════ */
  const markNotifRead = async (id: string) => {
    setNotifData(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch('/api/dashboard/notifications', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* ignore */ }
  };

  const markAllNotifRead = async () => {
    setNotifData(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await fetch('/api/dashboard/notifications', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }
  };

  const archiveNotif = (id: string) => {
    setNotifData(prev => prev.map(n => n.id === id ? { ...n, archived: true } : n));
  };

  const filteredNotifs = notifData.filter(n => {
    if (notifTab === 'unread') return !n.isRead && !n.archived;
    if (notifTab === 'archived') return n.archived;
    return !n.archived;
  });

  const relativeTimeNotif = (isoStr: string) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const renderNotifications = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="notifications" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Notifications</h1>
          <p className="mm-page-subtitle">Stay updated on your workspace activity.</p>
        </div>
        <div className="mm-notif-header-actions">
          {notifData.some(n => !n.isRead) && (
            <button className="mm-btn-secondary" onClick={markAllNotifRead}>
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
        </div>
      </div>
      <div className="mm-content">
        {/* Tabs */}
        <div className="mm-notif-tabs">
          {(['all', 'unread', 'archived'] as const).map(tab => (
            <button
              key={tab}
              className={`mm-notif-tab${notifTab === tab ? ' active' : ''}`}
              onClick={() => setNotifTab(tab)}
            >
              {tab === 'all' && <Bell size={14} />}
              {tab === 'unread' && <Mail size={14} />}
              {tab === 'archived' && <Archive size={14} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'unread' && notifData.filter(n => !n.isRead && !n.archived).length > 0 && (
                <span className="mm-notif-tab-count">{notifData.filter(n => !n.isRead && !n.archived).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mm-panel" style={{ flex: 1 }}>
          <div className="mm-notif-list-full">
            {notifLoading ? (
              <div className="mm-empty-state">
                <Loader2 size={24} className="mm-spin" />
                <p>Loading notifications…</p>
              </div>
            ) : filteredNotifs.length === 0 ? (
              <div className="mm-empty-state">
                <Bell size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
                <h3>{notifTab === 'archived' ? 'No archived notifications' : notifTab === 'unread' ? 'All caught up!' : 'No notifications yet'}</h3>
                <p>{notifTab === 'unread' ? 'You have no unread notifications.' : 'Notifications about shares, activity, and updates will appear here.'}</p>
              </div>
            ) : (
              filteredNotifs.map(n => (
                <div key={n.id} className={`mm-notif-row${n.isRead ? '' : ' unread'}`} onClick={() => !n.isRead && markNotifRead(n.id)}>
                  <div className="mm-notif-row-icon">
                    {n.type === 'bucket_share' ? <Share2 size={15} /> : <Info size={15} />}
                  </div>
                  <div className="mm-notif-row-body">
                    <span className="mm-notif-row-title">{n.title}</span>
                    {n.body && <span className="mm-notif-row-desc">{n.body}</span>}
                    <span className="mm-notif-row-time">{relativeTimeNotif(n.createdAt)}</span>
                  </div>
                  <div className="mm-notif-row-actions">
                    {!n.isRead && (
                      <button className="mm-btn-icon-sm" onClick={(e) => { e.stopPropagation(); markNotifRead(n.id); }} title="Mark read">
                        <Eye size={13} />
                      </button>
                    )}
                    {!n.archived && (
                      <button className="mm-btn-icon-sm" onClick={(e) => { e.stopPropagation(); archiveNotif(n.id); }} title="Archive">
                        <Archive size={13} />
                      </button>
                    )}
                  </div>
                  {!n.isRead && <span className="mm-notif-unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ RENDER ══════════ */
  const renderContent = () => {
    switch (active) {
      case 'api-keys': return <ApiKeysPage />;
      case 'memories': return renderMemories();
      case 'playground': return renderPlayground();
      case 'config': return renderConfig();
      case 'graph-memory': return renderGraphMemory();
      case 'webhooks': return renderWebhooks();
      case 'usage': return renderUsage();
      case 'notifications': return renderNotifications();
      case 'dashboard': default: return renderDashboard();
    }
  };

  return (
    <div className="mm-root">
      <Sidebar
        org={organization}
        active={active}
        onNav={setActive}
        onSignOut={doSignOut}
        onShareBucket={() => setShareOpen(true)}
        onCreateBucket={() => setCreateBucketOpen(true)}
        user={user as any}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main className="mm-main">{renderContent()}</main>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ShareBucketModal open={shareOpen} onClose={() => setShareOpen(false)} buckets={buckets} onShareComplete={refreshData} />
      <CreateBucketModal open={createBucketOpen} onClose={() => setCreateBucketOpen(false)} onCreated={refreshData} />
    </div>
  );
}
