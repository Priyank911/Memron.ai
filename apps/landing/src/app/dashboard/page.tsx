'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useUserSync } from '@/lib/hooks/use-user-sync';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { ThemeMode } from './_components/sidebar';
import {
  Loader2, AlertTriangle,
  Brain, Zap, Gauge, Users, Clock, BarChart3,
  FolderPlus, Share2, MessageSquare, Webhook,
  Settings, CreditCard, Bell, CheckCheck, Archive, X,
  Info, Lock, Globe, Palette, Shield, Eye, EyeOff,
  Mail, Sparkles, Rocket,
  Pencil, Copy, Plus, Trash2, Send, Play, ExternalLink,
  Terminal, Activity, Circle, ChevronRight, Check,
  ToggleLeft, ToggleRight, Search, GitBranch,
  Sun, Moon, Monitor, User, Hash, Calendar,
} from 'lucide-react';
import {
  Sidebar,
  CommandPalette,
  ApiKeysPage,
  ShareBucketModal,
  CreateBucketModal,
  Playground,
} from './_components';
import { DonutChart, Sparkline } from './_components/charts';
import { Topbar } from './_components/topbar';
import type { OrgInfo, UserInfo, ApiKeyInfo } from './_components';
import type { WorkspaceItem } from './_components/topbar';
import { useDashboardData } from './_hooks/use-dashboard-data';
import { useNotifications } from './_hooks/use-notifications';

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
  const [orgResolved, setOrgResolved] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
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
  const [chartHover, setChartHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [trendHover, setTrendHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const [notifTab, setNotifTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const { notifications: globalNotifs, unreadCount: _notifUnread, loading: notifLoading, markAllRead: globalMarkAllRead, refetch: refetchNotifs } = useNotifications();

  /* ── Settings page state ── */
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'security' | 'integrations'>('general');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  /* ── Playground state ── */
  const [pgMessages, setPgMessages] = useState<{ role: 'user' | 'system'; content: string; ts: number }[]>([]);
  const [pgInput, setPgInput] = useState('');
  const [pgLoading, setPgLoading] = useState(false);

  /* ── Webhooks state ── */
  const [webhooksData, setWebhooksData] = useState<{ id: string; url: string; events: string[]; isActive: boolean; secret?: string; createdAt: string; lastTriggeredAt?: string }[]>([]);
  const [whLoading, setWhLoading] = useState(false);
  const [whAddOpen, setWhAddOpen] = useState(false);
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<string[]>([]);
  const [whCreating, setWhCreating] = useState(false);
  const [whNewSecret, setWhNewSecret] = useState<string | null>(null);

  /* ── Graph Memory state ── */
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphSelectedNode, setGraphSelectedNode] = useState<string | null>(null);

  /* ── Playground ref ── */
  const pgRef = useRef<HTMLDivElement>(null);

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
    stats, memories, buckets, memoryRows, activityItems, sparkTokens, sparkMemories,
    loading: dataLoading, error: dataError, refresh: refreshData,
  } = useDashboardData(isLoaded && !!user && orgResolved, timeRange, organization?.id || null);

  /* ── Prevent back ── */
  useEffect(() => {
    window.history.replaceState(null, '', '/dashboard');
    const h = () => window.history.pushState(null, '', '/dashboard');
    window.history.pushState(null, '', '/dashboard');
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  /* ── Fetch onboarding data + workspaces ── */
  useEffect(() => {
    if (!isLoaded || !user) return;
    (async () => {
      try {
        // Fetch both endpoints and parse their bodies in one Promise.all so that
        // all resulting state updates happen in a single React batch (one render).
        const [onboardRes, wsRes] = await Promise.all([
          fetch('/api/onboarding', { credentials: 'include' }),
          fetch('/api/workspaces', { credentials: 'include' }),
        ]);

        const [onboardData, wsData] = await Promise.all([
          onboardRes.ok ? onboardRes.json().catch(() => null) : Promise.resolve(null),
          wsRes.ok     ? wsRes.json().catch(() => null)     : Promise.resolve(null),
        ]);

        const wsList: WorkspaceItem[] = wsData?.workspaces || [];
        const savedWsId = localStorage.getItem('mm-selected-workspace');

        // Resolve which workspace to activate — prefer saved, then first, then onboarding default
        let resolvedOrg: OrgInfo | null = null;
        if (savedWsId) {
          const saved = wsList.find(w => w.id === savedWsId);
          if (saved) {
            resolvedOrg = { id: saved.id, name: saved.name, slug: saved.slug, description: saved.description || undefined };
          } else if (wsList.length > 0) {
            const first = wsList[0];
            resolvedOrg = { id: first.id, name: first.name, slug: first.slug, description: first.description || undefined };
            localStorage.setItem('mm-selected-workspace', first.id);
          }
        } else if (wsList.length > 0) {
          const first = wsList[0];
          resolvedOrg = { id: first.id, name: first.name, slug: first.slug, description: first.description || undefined };
        } else if (onboardData?.organization) {
          resolvedOrg = onboardData.organization;
        }

        // All state updates in one sync block → single React batch → single render
        if (onboardData?.user) setUserInfo(onboardData.user);
        if (onboardData?.apiKey) setApiKeyInfo(onboardData.apiKey);
        if (wsList.length > 0) setWorkspaces(wsList);
        if (resolvedOrg) setOrganization(resolvedOrg);
      } catch { /* ignore */ } finally {
        setOrgResolved(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user]);

  /* ── Ctrl+K ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(p => !p); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ── Webhooks fetch ── */
  const fetchWebhooks = useCallback(async () => {
    setWhLoading(true);
    try {
      const res = await fetch('/api/dashboard/webhooks', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWebhooksData(data.webhooks || []);
      }
    } catch { /* ignore */ } finally { setWhLoading(false); }
  }, []);

  useEffect(() => {
    if (active === 'webhooks') fetchWebhooks();
  }, [active, fetchWebhooks]);

  const createWebhook = async () => {
    if (!whUrl || whEvents.length === 0) return;
    setWhCreating(true);
    try {
      const res = await fetch('/api/dashboard/webhooks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: whUrl, events: whEvents }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhNewSecret(data.webhook.secret);
        setWebhooksData(prev => [data.webhook, ...prev]);
        setWhUrl('');
        setWhEvents([]);
      }
    } catch { /* ignore */ } finally { setWhCreating(false); }
  };

  const deleteWebhook = async (id: string) => {
    setWebhooksData(prev => prev.filter(w => w.id !== id));
    try {
      await fetch('/api/dashboard/webhooks', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookId: id }),
      });
    } catch { /* ignore */ }
  };

  const toggleWebhook = async (id: string, isActive: boolean) => {
    setWebhooksData(prev => prev.map(w => w.id === id ? { ...w, isActive } : w));
    try {
      await fetch('/api/dashboard/webhooks', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookId: id, isActive }),
      });
    } catch { /* ignore */ }
  };

  /* ── Playground send ── */
  const pgSend = async () => {
    const msg = pgInput.trim();
    if (!msg || pgLoading) return;
    setPgMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setPgInput('');
    setPgLoading(true);
    try {
      const res = await fetch('/api/dashboard/memories', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const memories = data.memories || [];
        const q = msg.toLowerCase();
        const matched = memories.filter((m: any) =>
          (m.content || '').toLowerCase().includes(q) ||
          (m.bucket_name || '').toLowerCase().includes(q)
        ).slice(0, 5);
        if (matched.length > 0) {
          const lines = matched.map((m: any, i: number) =>
            `${i + 1}. [${m.bucket_name || 'default'}] ${(m.content || '').slice(0, 120)}${(m.content || '').length > 120 ? '...' : ''}`
          ).join('\n');
          setPgMessages(prev => [...prev, { role: 'system', content: `Found ${matched.length} matching memories:\n${lines}`, ts: Date.now() }]);
        } else {
          setPgMessages(prev => [...prev, { role: 'system', content: `No memories found matching "${msg}". Try a different query or check your buckets.`, ts: Date.now() }]);
        }
      } else {
        setPgMessages(prev => [...prev, { role: 'system', content: 'Failed to query memories. Please try again.', ts: Date.now() }]);
      }
    } catch {
      setPgMessages(prev => [...prev, { role: 'system', content: 'Connection error. Check your network.', ts: Date.now() }]);
    } finally { setPgLoading(false); }
  };

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
    for (let i = 0; i < 24; i++)  {
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

  /* ── Chart hover handler ── */
  const handleChartMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = chartRef.current;
    if (!wrap || areaChartData.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (areaChartData.length - 1));
    const clampedIdx = Math.max(0, Math.min(idx, areaChartData.length - 1));
    setChartHover({ idx: clampedIdx, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [areaChartData]);

  /* ── Trend hover handler ── */
  const handleTrendMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = trendRef.current;
    if (!wrap || trendData.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    const padLeft = 50;
    const padRight = 20;
    const chartWidth = rect.width - padLeft - padRight;
    const xPos = e.clientX - rect.left - padLeft;
    const xRatio = xPos / chartWidth;
    const idx = Math.round(xRatio * (trendData.length - 1));
    const clampedIdx = Math.max(0, Math.min(idx, trendData.length - 1));
    setTrendHover({ idx: clampedIdx, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [trendData]);

  /* ── Trend stats ── */
  const trendStats = useMemo(() => {
    if (trendData.length === 0) return { peak: 0, peakLabel: '—', avg: 0, total: 0, growth: '0%' };
    const values = trendData.map(d => d.value);
    const peak = Math.max(...values);
    const peakIdx = values.indexOf(peak);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const total = values.reduce((s, v) => s + v, 0);
    const first = values[0] || 1;
    const last = values[values.length - 1] || 0;
    const growth = first > 0 ? `${last >= first ? '+' : ''}${(((last - first) / first) * 100).toFixed(0)}%` : '0%';
    return { peak, peakLabel: trendData[peakIdx]?.label || '—', avg, total, growth };
  }, [trendData]);

  /* ── Playground scroll-to-bottom ── */
  useEffect(() => { pgRef.current?.scrollTo(0, pgRef.current.scrollHeight); }, [pgMessages]);

  /* ── Graph memory nodes ── */
  const graphNodes = useMemo(() => {
    if (!buckets.length) return [];
    const nodes: { id: string; label: string; type: 'bucket' | 'memory'; count?: number; bucket?: string; content?: string }[] = [];
    buckets.forEach(b => {
      nodes.push({ id: `b-${b.id}`, label: b.name, type: 'bucket', count: b.memoryCount });
    });
    memoryRows.slice(0, 30).forEach((m: any) => {
      nodes.push({
        id: `m-${m.id}`,
        label: (m.content || '').slice(0, 40) + ((m.content || '').length > 40 ? '...' : ''),
        type: 'memory',
        bucket: m.bucket_name || 'default',
        content: m.content,
      });
    });
    return nodes;
  }, [buckets, memoryRows]);

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

  /* ── Workspace switching ── */
  const handleSelectWorkspace = useCallback((ws: WorkspaceItem) => {
    setOrganization({ id: ws.id, name: ws.name, slug: ws.slug, description: ws.description || undefined });
    localStorage.setItem('mm-selected-workspace', ws.id);
    setSelectedBucket(null);
  }, []);

  /* ── Workspace creation ── */
  const handleCreateWorkspace = useCallback(async (name: string, description?: string) => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create workspace');
    }
    const data = await res.json();
    const newWs: WorkspaceItem = data.workspace;
    setWorkspaces(prev => [...prev, newWs]);
    // Auto-switch to new workspace
    handleSelectWorkspace(newWs);
  }, [handleSelectWorkspace]);

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
        workspaces={workspaces}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
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
          <button onClick={() => refreshData()}>Retry</button>
        </div>
      )}

      {/* ══ EMPTY STATE for zero-memory workspaces ══ */}
      {!dataLoading && stats.totalMemories === 0 && !dataError && (
        <div className="mm-empty-workspace">
          <Brain size={36} strokeWidth={1.2} className="mm-empty-icon-svg" />
          <h3 className="mm-empty-workspace-title">No memories in this workspace</h3>
          <p className="mm-empty-workspace-desc">Start by connecting your AI agent and sending memories via the MCP server or API.</p>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <div className="mm-content">

        {/* ── Large Area Chart + Insights ── */}
        <div className="mm-chart-panel">
          <div className="mm-chart-main">
            <div className="mm-chart-header">
              <h2 className="mm-chart-title">Memory Activity</h2>
            </div>
            <div
              ref={chartRef}
              className="mm-chart-svg-wrap"
              onMouseMove={handleChartMouse}
              onMouseLeave={() => setChartHover(null)}
            >
              <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="mm-area-chart">
                <defs>
                  <linearGradient id="mmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.55" />
                    <stop offset="50%" stopColor="#6d28d9" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="mmLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6d28d9" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                {/* Vertical grid lines */}
                {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h, i) => (
                  <line key={i} x1={(h / 23) * 800} y1="0" x2={(h / 23) * 800} y2="170" stroke="var(--mm-border)" strokeWidth="0.5" strokeDasharray="3 6" opacity="0.35" />
                ))}
                {/* Base line */}
                <line x1="0" y1="170" x2="800" y2="170" stroke="var(--mm-border)" strokeWidth="0.6" opacity="0.4" />
                {(() => {
                  const values = areaChartData.map(d => d.value);
                  const linePath = generateSmoothPath(values, 800, 170, 10);
                  const areaPath = `${linePath} L 800,170 L 0,170 Z`;
                  return (
                    <>
                      <path d={areaPath} fill="url(#mmAreaGrad)" className="mm-chart-area-path" />
                      <path d={linePath} fill="none" stroke="url(#mmLineGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mm-chart-line-path" />
                      <path d={linePath} fill="none" stroke="url(#mmLineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  );
                })()}
                {/* Hover vertical dashed line */}
                {chartHover && (() => {
                  const hx = (chartHover.idx / (areaChartData.length - 1)) * 800;
                  return (
                    <line x1={hx} y1="0" x2={hx} y2="170" stroke="#a0a0a0" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
                  );
                })()}
                {/* X-axis labels */}
                {areaChartData.filter((_, i) => i % 2 === 0).map((d, idx) => (
                  <text key={idx} x={((idx * 2) / 23) * 800} y="190" className="mm-chart-label">{d.label}</text>
                ))}
              </svg>
              {/* Hover Tooltip */}
              {chartHover && (() => {
                const d = areaChartData[chartHover.idx];
                const totalMem = areaChartData.reduce((s, v) => s + v.value, 0);
                const rate = totalMem > 0 ? ((d.value / totalMem) * 100).toFixed(1) : '0';
                const tokVal = stats.totalTokens > 0 ? Math.round((d.value / (stats.totalMemories || 1)) * stats.totalTokens) : 0;
                return (
                  <div
                    className="mm-chart-tooltip"
                    style={{
                      left: Math.min(Math.max(chartHover.x + 16, 10), (chartRef.current?.offsetWidth || 600) - 220),
                      top: Math.max(chartHover.y - 80, 10),
                    }}
                  >
                    <div className="mm-tooltip-header">
                      <span className="mm-tooltip-time">{d.label}</span>
                    </div>
                    <div className="mm-tooltip-body">
                      <div className="mm-tooltip-row">
                        <span className="mm-tooltip-label">Memories</span>
                        <span className="mm-tooltip-val">{d.value.toLocaleString()}</span>
                      </div>
                      <div className="mm-tooltip-row">
                        <span className="mm-tooltip-label">Tokens</span>
                        <span className="mm-tooltip-val">{tokVal.toLocaleString()}</span>
                      </div>
                      <div className="mm-tooltip-row">
                        <span className="mm-tooltip-label">Conversation rate</span>
                        <span className="mm-tooltip-val">{rate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="mm-chart-insights">
            {/* Memory Velocity — unique: rate of memory creation */}
            <div className="mm-insight-card">
              <div className="mm-insight-row">
                <div className="mm-insight-info">
                  <span className="mm-insight-label">Memory Velocity</span>
                  <span className="mm-insight-value">{stats.totalMemories > 0 && trendData.length > 0 ? (stats.totalMemories / trendData.length).toFixed(1) : '0'}<small className="mm-insight-unit">/day</small></span>
                </div>
                <div className="mm-insight-spark-mini">
                  <Sparkline data={stats.sparkMemories.length > 2 ? stats.sparkMemories : [0, 1, 0]} width={48} height={18} color="#a78bfa" strokeWidth={1.5} />
                </div>
              </div>
              <div className="mm-insight-bar-track">
                <div className="mm-insight-bar-fill fill-violet" style={{ width: `${Math.min((stats.totalMemories / Math.max(trendData.length, 1)) * 20, 100)}%` }} />
              </div>
              <span className="mm-insight-hint">creation rate this period</span>
            </div>

            {/* Peak Window — unique: peak hour range not shown in stat cards */}
            <div className="mm-insight-card">
              <div className="mm-insight-row">
                <div className="mm-insight-info">
                  <span className="mm-insight-label">Peak Window</span>
                  <span className="mm-insight-value">{stats.peakHour || '\u2014'}</span>
                </div>
                <svg className="mm-insight-ring" width="28" height="28" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="var(--mm-bg-3)" strokeWidth="2.5" />
                  <circle cx="14" cy="14" r="11" fill="none" stroke="var(--mm-violet-3)" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${(parseInt(stats.peakHour || '0') / 24) * 69.1} 69.1`}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                </svg>
              </div>
              <span className="mm-insight-hint">highest activity window</span>
            </div>

            {/* Data Freshness — unique: how recent is the latest data */}
            <div className="mm-insight-card">
              <div className="mm-insight-row">
                <div className="mm-insight-info">
                  <span className="mm-insight-label">Data Freshness</span>
                  <span className="mm-insight-value">{stats.sparkMemories.length > 0 && stats.sparkMemories[stats.sparkMemories.length - 1] > 0 ? 'Active' : 'Idle'}</span>
                </div>
                <span className={`mm-insight-status-dot ${stats.sparkMemories.length > 0 && stats.sparkMemories[stats.sparkMemories.length - 1] > 0 ? 'dot-active' : 'dot-idle'}`} />
              </div>
              <span className="mm-insight-hint">{stats.range === 'today' ? 'today' : stats.range === '7d' ? 'last 7 days' : stats.range === '30d' ? 'last 30 days' : stats.range} &middot; {stats.activeSessions} session{stats.activeSessions !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="mm-stats-row">
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Total Memories</span>
              <Brain size={15} strokeWidth={1.5} className="mm-stat-icon" />
            </div>
            <div className="mm-stat-body">
              <span className="mm-stat-value">{stats.totalMemories.toLocaleString()}</span>
              <div className="mm-stat-spark">
                <Sparkline data={stats.sparkMemories.length > 1 ? stats.sparkMemories : [0, 0]} width={64} height={20} color="#7c3aed" strokeWidth={1.5} />
              </div>
            </div>
            <div className="mm-stat-footer">
              <span className={`mm-stat-delta ${stats.memoryDelta >= 0 ? 'mm-green' : 'mm-red'}`}>
                {memoryDeltaStr}
              </span>
              <span className="mm-stat-sub">vs prev period</span>
            </div>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Tokens Processed</span>
              <Zap size={15} strokeWidth={1.5} className="mm-stat-icon" />
            </div>
            <div className="mm-stat-body">
              <span className="mm-stat-value">{stats.totalTokens.toLocaleString()}</span>
              <div className="mm-stat-ring">
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="var(--mm-bg-3)" strokeWidth="3" />
                  <circle cx="14" cy="14" r="11" fill="none" stroke="var(--mm-violet-3)" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${Math.min(avgTokensPerMem / 100, 1) * 69.1} 69.1`}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                </svg>
              </div>
            </div>
            <div className="mm-stat-footer">
              <span className="mm-stat-delta mm-muted">{avgTokensPerMem.toLocaleString()}</span>
              <span className="mm-stat-sub">avg tok/mem</span>
            </div>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Compression Rate</span>
              <Gauge size={15} strokeWidth={1.5} className="mm-stat-icon" />
            </div>
            <div className="mm-stat-body">
              <span className="mm-stat-value">{compressionRatio}</span>
              <div className="mm-stat-bar-wrap">
                <div className="mm-stat-bar-track">
                  <div className="mm-stat-bar-fill" style={{ width: compressionRatio }} />
                </div>
              </div>
            </div>
            <div className="mm-stat-footer">
              <span className="mm-stat-delta mm-green">optimized</span>
              <span className="mm-stat-sub">{stats.originalTokens > 0 ? `${stats.originalTokens.toLocaleString()} original` : 'efficient'}</span>
            </div>
          </div>
          <div className="mm-stat-card">
            <div className="mm-stat-top">
              <span className="mm-stat-label">Active Sessions</span>
              <Users size={15} strokeWidth={1.5} className="mm-stat-icon" />
            </div>
            <div className="mm-stat-body">
              <span className="mm-stat-value">{stats.activeSessions}</span>
              <span className="mm-stat-live">
                <span className="mm-live-dot" />
                <span className="mm-stat-live-text">LIVE</span>
              </span>
            </div>
            <div className="mm-stat-footer">
              <span className="mm-stat-delta mm-muted">{stats.buckets.length}</span>
              <span className="mm-stat-sub">active buckets</span>
            </div>
          </div>
        </div>

        {/* ── Bottom Row: Heatmap + Bucket Distribution ── */}
        <div className="mm-bottom-row">
          {/* Memory Heatmap */}
          <div className="mm-panel mm-heatmap-panel">
            <div className="mm-panel-head">
              <h2>Memory Heatmap</h2>
              <div className="mm-heatmap-meta">
                <span className="mm-heatmap-total">{stats.totalMemories} total</span>
                <div className="mm-heatmap-scale">
                  <span className="mm-heatmap-scale-label">Less</span>
                  <span className="mm-hm-cell lv-0" style={{ width: 10, height: 10 }} />
                  <span className="mm-hm-cell lv-1" style={{ width: 10, height: 10 }} />
                  <span className="mm-hm-cell lv-2" style={{ width: 10, height: 10 }} />
                  <span className="mm-hm-cell lv-3" style={{ width: 10, height: 10 }} />
                  <span className="mm-hm-cell lv-4" style={{ width: 10, height: 10 }} />
                  <span className="mm-heatmap-scale-label">More</span>
                </div>
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

          {/* Bucket Distribution — Compact Horizontal */}
          <div className="mm-panel mm-dist-panel">
            <div className="mm-panel-head">
              <h2>Bucket Distribution</h2>
              <span className="mm-panel-count">{stats.buckets.length} buckets</span>
            </div>
            <div className="mm-dist-body">
              {stats.buckets.length > 0 ? (
                <div className="mm-dist-compact">
                  <div className="mm-dist-chart-col">
                    <DonutChart
                      segments={distribution.map(d => ({ value: d.pct, color: d.color, label: d.label }))}
                      size={110}
                      thickness={14}
                      centerValue={stats.totalMemories}
                      centerLabel="memories"
                    />
                  </div>
                  <div className="mm-dist-list-col">
                    {distribution.map((d, i) => {
                      const count = stats.buckets[i]?.count ?? 0;
                      return (
                        <div key={i} className="mm-dist-row">
                          <span className="mm-dist-color" style={{ background: d.color }} />
                          <span className="mm-dist-name" title={d.label}>{d.label}</span>
                          <span className="mm-dist-count">{count.toLocaleString()}</span>
                          <span className="mm-dist-pct">{d.pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
            <div className="mm-trend-head-right">
              <span className="mm-trend-range-badge">{timeRange === 'today' ? 'Today' : timeRange === '7d' ? 'Last 7 days' : timeRange === '30d' ? 'Last 30 days' : timeRange === 'quarter' ? 'Quarter' : 'Year'}</span>
              <div className="mm-legend-row">
                {distribution.slice(0, 4).map((d, i) => (
                  <span key={i} className="mm-legend-item">
                    <span className="mm-legend-dot" style={{ background: d.color }} />
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Trend stats bar — compact grid */}
          <div className="mm-trend-stats-bar">
            <div className="mm-trend-stat">
              <span className="mm-trend-stat-label">Peak</span>
              <div className="mm-trend-stat-main">
                <span className="mm-trend-stat-value">{trendStats.peak.toLocaleString()}</span>
              </div>
              <span className="mm-trend-stat-sub">{trendStats.peakLabel}</span>
            </div>
            <div className="mm-trend-stat">
              <span className="mm-trend-stat-label">Average</span>
              <div className="mm-trend-stat-main">
                <span className="mm-trend-stat-value">{trendStats.avg.toLocaleString()}</span>
              </div>
              <span className="mm-trend-stat-sub">per period</span>
            </div>
            <div className="mm-trend-stat">
              <span className="mm-trend-stat-label">Total</span>
              <div className="mm-trend-stat-main">
                <span className="mm-trend-stat-value">{trendStats.total.toLocaleString()}</span>
              </div>
              <span className="mm-trend-stat-sub">memories</span>
            </div>
            <div className="mm-trend-stat">
              <span className="mm-trend-stat-label">Density</span>
              <div className="mm-trend-stat-main">
                <span className="mm-trend-stat-value">{trendData.length > 0 ? (trendStats.total / trendData.length).toFixed(1) : '0'}</span>
              </div>
              <span className="mm-trend-stat-sub">mem/period</span>
            </div>
          </div>

          {/* Chart with hover */}
          <div
            ref={trendRef}
            className="mm-trend-chart-wrap"
            onMouseMove={handleTrendMouse}
            onMouseLeave={() => setTrendHover(null)}
          >
            {(() => {
              const values = trendData.map(d => d.value);
              const max = Math.max(...values, 1);
              const vbW = 900;
              const chartW = 820;
              const chartH = 200;
              const padTop = 16;
              const padBottom = 28;
              const padLeft = 55;
              const plotH = chartH - padTop - padBottom;

              // Smart Y-axis ticks — avoid duplicates for small values
              const tickCount = 5;
              const yTicks: string[] = [];
              for (let i = 0; i < tickCount; i++) {
                const val = max - (max / (tickCount - 1)) * i;
                yTicks.push(max <= 5 ? val.toFixed(1) : Math.round(val).toLocaleString());
              }
              // Deduplicate: if all ticks are the same, show simpler scale
              const uniqueTicks = [...new Set(yTicks)];
              const finalTicks = uniqueTicks.length < 3 && max <= 5
                ? Array.from({ length: tickCount }, (_, i) => ((max / (tickCount - 1)) * (tickCount - 1 - i)).toFixed(1))
                : yTicks;

              return (
                <svg viewBox={`0 0 ${vbW} ${chartH}`} preserveAspectRatio="none" className="mm-trend-svg">
                  <defs>
                    <linearGradient id="mmTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                      <stop offset="40%" stopColor="#7c3aed" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="mmTrendLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6d28d9" />
                      <stop offset="50%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines — subtle dashed */}
                  {finalTicks.map((tick, i) => {
                    const y = padTop + (i / (finalTicks.length - 1)) * plotH;
                    return (
                      <g key={i}>
                        <line x1={padLeft - 4} y1={y} x2={vbW - 10} y2={y} stroke="var(--mm-border)" strokeWidth="0.5" strokeDasharray="4 6" opacity="0.3" vectorEffect="non-scaling-stroke" />
                        <text x={padLeft - 8} y={y + 3.5} textAnchor="end" className="mm-chart-label" style={{ fontSize: 11 }}>{tick}</text>
                      </g>
                    );
                  })}
                  {/* Base line */}
                  <line x1={padLeft - 4} y1={padTop + plotH} x2={vbW - 10} y2={padTop + plotH} stroke="var(--mm-border)" strokeWidth="0.6" opacity="0.35" vectorEffect="non-scaling-stroke" />

                  {/* Area fill + line */}
                  {(() => {
                    const linePath = generateSmoothPath(values, chartW, plotH, 0);
                    if (!linePath) return null;
                    return (
                      <g transform={`translate(${padLeft + 5}, ${padTop})`}>
                        <path d={`${linePath} L ${chartW},${plotH} L 0,${plotH} Z`} fill="url(#mmTrendGrad)" className="mm-trend-area-path" />
                        <path d={linePath} fill="none" stroke="url(#mmTrendLineGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mm-trend-line-path" />
                        {/* Data dots */}
                        {values.map((v, i) => {
                          const x = values.length > 1 ? (i / (values.length - 1)) * chartW : chartW / 2;
                          const y = plotH - (v / max) * plotH;
                          const isHovered = trendHover?.idx === i;
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r={isHovered ? 4 : 2.5}
                              fill={isHovered ? '#a78bfa' : '#8b5cf6'}
                              stroke="var(--mm-bg-card)"
                              strokeWidth={isHovered ? 2 : 1.2}
                              vectorEffect="non-scaling-stroke"
                              style={{ transition: 'r 0.15s, fill 0.15s' }}
                            />
                          );
                        })}
                      </g>
                    );
                  })()}

                  {/* Hover vertical line */}
                  {trendHover && values.length > 1 && (() => {
                    const hx = padLeft + 5 + (trendHover.idx / (values.length - 1)) * chartW;
                    return (
                      <line x1={hx} y1={padTop} x2={hx} y2={padTop + plotH} stroke="#a0a0a0" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" vectorEffect="non-scaling-stroke" />
                    );
                  })()}

                  {/* X labels */}
                  {trendData.map((d, i) => {
                    const x = padLeft + 5 + (trendData.length > 1 ? (i / (trendData.length - 1)) * chartW : chartW / 2);
                    return (
                      <text key={i} x={x} y={chartH - 4} className="mm-chart-label" textAnchor="middle" style={{ fontSize: 11 }}>{d.label}</text>
                    );
                  })}
                </svg>
              );
            })()}

            {/* Hover tooltip */}
            {trendHover && trendData[trendHover.idx] && (() => {
              const d = trendData[trendHover.idx];
              const values = trendData.map(t => t.value);
              const max = Math.max(...values, 1);
              const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
              const pctOfPeak = max > 0 ? ((d.value / max) * 100).toFixed(0) : '0';
              const prevIdx = trendHover.idx > 0 ? trendHover.idx - 1 : null;
              const prevVal = prevIdx !== null ? values[prevIdx] : null;
              const changePct = prevVal !== null && prevVal > 0 ? (((d.value - prevVal) / prevVal) * 100).toFixed(1) : null;
              return (
                <div
                  className="mm-chart-tooltip"
                  style={{
                    left: Math.min(Math.max(trendHover.x + 16, 10), (trendRef.current?.offsetWidth || 600) - 220),
                    top: Math.max(trendHover.y - 110, 10),
                  }}
                >
                  <div className="mm-tooltip-header">
                    <span className="mm-tooltip-time">{d.label}</span>
                  </div>
                  <div className="mm-tooltip-body">
                    <div className="mm-tooltip-row">
                      <span className="mm-tooltip-label">Memories</span>
                      <span className="mm-tooltip-val">{d.value.toLocaleString()}</span>
                    </div>
                    <div className="mm-tooltip-row">
                      <span className="mm-tooltip-label">% of peak</span>
                      <span className="mm-tooltip-val">{pctOfPeak}%</span>
                    </div>
                    <div className="mm-tooltip-row">
                      <span className="mm-tooltip-label">vs average</span>
                      <span className={`mm-tooltip-val ${d.value >= avg ? 'mm-positive' : 'mm-negative'}`}>
                        {d.value >= avg ? '+' : ''}{d.value - avg}
                      </span>
                    </div>
                    {changePct !== null && (
                      <div className="mm-tooltip-row">
                        <span className="mm-tooltip-label">vs prev period</span>
                        <span className={`mm-tooltip-val ${parseFloat(changePct) >= 0 ? 'mm-positive' : 'mm-negative'}`}>
                          {parseFloat(changePct) >= 0 ? '+' : ''}{changePct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════ Memories Page ══════════ */
  const renderMemories = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="memories" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
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
    <Playground
      buckets={buckets}
      totalMemories={stats.totalMemories}
      totalTokens={stats.totalTokens}
      userName={user?.firstName || 'there'}
      onBack={() => setActive('dashboard')}
    />
  );

  /* ══════════ Settings Page ══════════ */
  const settingsCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderConfig = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="config" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Settings</h1>
          <p className="mm-page-subtitle">Manage your workspace, preferences, and security.</p>
        </div>
      </div>
      <div className="mm-content">
        {/* Tabs */}
        <div className="mm-settings-tabs">
          {([
            { key: 'general', label: 'General', icon: <Globe size={14} /> },
            { key: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
            { key: 'security', label: 'Security', icon: <Shield size={14} /> },
            { key: 'integrations', label: 'Integrations', icon: <GitBranch size={14} /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              className={`mm-settings-tab${settingsTab === tab.key ? ' active' : ''}`}
              onClick={() => setSettingsTab(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* General Tab */}
        {settingsTab === 'general' && (
          <>
            {/* Organization Details */}
            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Organization Details</h2>
                <button className="mm-btn-icon-sm" title="Edit" onClick={() => { setEditingField('org-name'); setEditValue(organization?.name || ''); }}>
                  <Pencil size={13} />
                </button>
              </div>
              <div className="mm-settings-grid">
                <div className="mm-settings-field">
                  <label>Workspace Name</label>
                  {editingField === 'org-name' ? (
                    <div className="mm-settings-edit-row">
                      <input className="mm-settings-input" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus />
                      <button className="mm-btn-icon-sm mm-green" onClick={() => setEditingField(null)}><Check size={13} /></button>
                      <button className="mm-btn-icon-sm" onClick={() => setEditingField(null)}><X size={13} /></button>
                    </div>
                  ) : (
                    <span className="mm-settings-val">{organization?.name || 'Default Workspace'}</span>
                  )}
                </div>
                <div className="mm-settings-field">
                  <label>Slug</label>
                  <span className="mm-settings-val mono">{organization?.slug || '—'}</span>
                </div>
                <div className="mm-settings-field">
                  <label>Plan</label>
                  <span className="mm-settings-val"><span className="mm-badge-beta">Beta</span> Free</span>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Personal Information</h2>
              </div>
              <div className="mm-settings-grid mm-settings-grid-3">
                <div className="mm-settings-field">
                  <label>Email</label>
                  <span className="mm-settings-val">{userInfo?.email || '—'}</span>
                </div>
                <div className="mm-settings-field">
                  <label>User ID</label>
                  <div className="mm-settings-copy-row">
                    <span className="mm-settings-val mono">{(userInfo?.universalId || '—').slice(0, 16)}...</span>
                    <button className="mm-btn-icon-sm" onClick={() => settingsCopyToClipboard(userInfo?.universalId || '')} title="Copy"><Copy size={11} /></button>
                  </div>
                </div>
                <div className="mm-settings-field">
                  <label>Role</label>
                  <span className="mm-settings-val">Owner</span>
                </div>
                <div className="mm-settings-field">
                  <label>Total Memories</label>
                  <span className="mm-settings-val">{stats.totalMemories.toLocaleString()}</span>
                </div>
                <div className="mm-settings-field">
                  <label>Buckets</label>
                  <span className="mm-settings-val">{buckets.length}</span>
                </div>
                <div className="mm-settings-field">
                  <label>Tokens Processed</label>
                  <span className="mm-settings-val">{stats.totalTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="mm-panel mm-panel-danger">
              <div className="mm-panel-head">
                <h2><AlertTriangle size={14} strokeWidth={1.6} /> Danger Zone</h2>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <div>
                    <span className="mm-config-label">Delete all memories</span>
                    <span className="mm-config-hint">This action cannot be undone. All memories across all buckets will be permanently removed.</span>
                  </div>
                  <button className="mm-btn-danger" disabled>Delete All</button>
                </div>
                <div className="mm-config-row">
                  <div>
                    <span className="mm-config-label">Delete workspace</span>
                    <span className="mm-config-hint">Permanently delete this workspace and all associated data.</span>
                  </div>
                  <button className="mm-btn-danger" disabled>Delete</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Appearance Tab */}
        {settingsTab === 'appearance' && (
          <>
            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Theme</h2>
              </div>
              <div className="mm-settings-theme-grid">
                {([
                  { key: 'dark', label: 'Dark', icon: <Moon size={18} />, desc: 'Easy on the eyes' },
                  { key: 'light', label: 'Light', icon: <Sun size={18} />, desc: 'Classic bright mode' },
                  { key: 'system', label: 'System', icon: <Monitor size={18} />, desc: 'Match OS preference' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    className={`mm-settings-theme-card${theme === t.key ? ' active' : ''}`}
                    onClick={() => setTheme(t.key)}
                  >
                    <div className="mm-settings-theme-icon">{t.icon}</div>
                    <span className="mm-settings-theme-label">{t.label}</span>
                    <span className="mm-settings-theme-desc">{t.desc}</span>
                    {theme === t.key && <div className="mm-settings-theme-check"><Check size={14} /></div>}
                  </button>
                ))}
              </div>
            </div>

            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Display</h2>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <span className="mm-config-label">Language</span>
                  <span className="mm-config-value">English (US)</span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Font</span>
                  <span className="mm-config-value" style={{ fontFamily: 'var(--mm-mono)', fontSize: '0.78rem' }}>JetBrains Mono</span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Density</span>
                  <span className="mm-config-value">Comfortable</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Security Tab */}
        {settingsTab === 'security' && (
          <>
            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Authentication</h2>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <div>
                    <span className="mm-config-label">Provider</span>
                    <span className="mm-config-hint">Managed by Clerk</span>
                  </div>
                  <span className="mm-config-value">
                    <span className="mm-settings-status-badge mm-green-bg"><Lock size={10} /> SSO Active</span>
                  </span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Two-Factor Authentication</span>
                  <span className="mm-config-value mm-text-muted">Managed via Clerk</span>
                </div>
              </div>
            </div>

            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>API Keys</h2>
                <button className="mm-btn-secondary" onClick={() => setActive('api-keys')}>
                  Manage Keys <ExternalLink size={11} />
                </button>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <span className="mm-config-label">Active Keys</span>
                  <span className="mm-config-value">{stats.activeSessions || 0} / 5</span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Key Prefix</span>
                  <span className="mm-config-value mono">mm_live_*</span>
                </div>
              </div>
            </div>

            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Sessions</h2>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <span className="mm-config-label">Current Session</span>
                  <span className="mm-config-value"><span className="mm-settings-status-badge mm-green-bg"><Circle size={8} /> Active</span></span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Integrations Tab */}
        {settingsTab === 'integrations' && (
          <>
            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>MCP Server</h2>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <div>
                    <span className="mm-config-label">Status</span>
                    <span className="mm-config-hint">Model Context Protocol server for AI agent integration</span>
                  </div>
                  <span className="mm-config-value"><span className="mm-settings-status-badge mm-green-bg"><Activity size={10} /> Connected</span></span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Endpoint</span>
                  <span className="mm-config-value mono" style={{ fontSize: '0.72rem' }}>mcp.memron.ai</span>
                </div>
              </div>
            </div>

            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Webhooks</h2>
                <button className="mm-btn-secondary" onClick={() => setActive('webhooks')}>
                  Manage <ExternalLink size={11} />
                </button>
              </div>
              <div className="mm-config-list">
                <div className="mm-config-row">
                  <span className="mm-config-label">Active Endpoints</span>
                  <span className="mm-config-value">{webhooksData.filter(w => w.isActive).length}</span>
                </div>
                <div className="mm-config-row">
                  <span className="mm-config-label">Available Events</span>
                  <span className="mm-config-value">5 event types</span>
                </div>
              </div>
            </div>

            <div className="mm-panel">
              <div className="mm-panel-head">
                <h2>Connected Services</h2>
              </div>
              <div className="mm-settings-integrations-list">
                <div className="mm-settings-integration-row">
                  <div className="mm-settings-integration-icon"><Brain size={16} /></div>
                  <div className="mm-settings-integration-info">
                    <span className="mm-settings-integration-name">Cursor IDE</span>
                    <span className="mm-settings-integration-desc">MCP memory layer for Cursor</span>
                  </div>
                  <span className="mm-settings-status-badge mm-green-bg">Connected</span>
                </div>
                <div className="mm-settings-integration-row">
                  <div className="mm-settings-integration-icon"><Terminal size={16} /></div>
                  <div className="mm-settings-integration-info">
                    <span className="mm-settings-integration-name">Windsurf</span>
                    <span className="mm-settings-integration-desc">MCP memory layer for Windsurf</span>
                  </div>
                  <span className="mm-settings-status-badge">Available</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ══════════ Graph Memory ══════════ */
  const renderGraphMemory = () => {
    const bucketNodes = graphNodes.filter(n => n.type === 'bucket');
    const memNodes = graphNodes.filter(n => n.type === 'memory');
    const selectedNode = graphNodes.find(n => n.id === graphSelectedNode);

    // SVG layout: buckets in center ring, memories orbit around their bucket
    const cx = 400, cy = 300;
    const bucketRadius = 140;
    const memoryRadius = 60;

    return (
      <div className="mm-dashboard">
        <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="graph-memory" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
        <div className="mm-page-header">
          <div className="mm-page-header-left">
            <h1 className="mm-page-title">Graph Memory</h1>
            <p className="mm-page-subtitle">Visualize memory relationships across buckets.</p>
          </div>
          <div className="mm-page-header-right">
            <span className="mm-graph-legend"><span className="mm-graph-dot mm-graph-dot-bucket" /> Buckets</span>
            <span className="mm-graph-legend"><span className="mm-graph-dot mm-graph-dot-memory" /> Memories</span>
          </div>
        </div>
        <div className="mm-content mm-graph-wrap">
          <div className="mm-panel mm-graph-canvas-panel">
            {graphNodes.length === 0 ? (
              <div className="mm-empty-state">
                <Brain size={32} strokeWidth={1.2} className="mm-empty-icon-svg" />
                <h3>No data to visualize</h3>
                <p>Create some memories to see the graph visualization.</p>
              </div>
            ) : (
              <svg viewBox="0 0 800 600" className="mm-graph-svg">
                {/* Connections: memory → bucket */}
                {bucketNodes.map((bn, bi) => {
                  const bx = cx + bucketRadius * Math.cos((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const by = cy + bucketRadius * Math.sin((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const related = memNodes.filter(m => m.bucket === bn.label);
                  return related.map((mn, mi) => {
                    const angle = (2 * Math.PI * mi) / Math.max(related.length, 1);
                    const mx = bx + memoryRadius * Math.cos(angle);
                    const my = by + memoryRadius * Math.sin(angle);
                    return (
                      <line key={`${bn.id}-${mn.id}`} x1={bx} y1={by} x2={mx} y2={my} className="mm-graph-edge" />
                    );
                  });
                })}
                {/* Center node */}
                <circle cx={cx} cy={cy} r={18} className="mm-graph-center" />
                <text x={cx} y={cy + 4} textAnchor="middle" className="mm-graph-center-text">M</text>
                {/* Bucket → center lines */}
                {bucketNodes.map((bn, bi) => {
                  const bx = cx + bucketRadius * Math.cos((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const by = cy + bucketRadius * Math.sin((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  return <line key={`c-${bn.id}`} x1={cx} y1={cy} x2={bx} y2={by} className="mm-graph-edge mm-graph-edge-primary" />;
                })}
                {/* Bucket nodes */}
                {bucketNodes.map((bn, bi) => {
                  const bx = cx + bucketRadius * Math.cos((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const by = cy + bucketRadius * Math.sin((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const isSelected = graphSelectedNode === bn.id;
                  return (
                    <g key={bn.id} onClick={() => setGraphSelectedNode(isSelected ? null : bn.id)} style={{ cursor: 'pointer' }}>
                      <circle cx={bx} cy={by} r={isSelected ? 26 : 22} className={`mm-graph-node-bucket${isSelected ? ' selected' : ''}`} />
                      <text x={bx} y={by - 28} textAnchor="middle" className="mm-graph-node-label">{bn.label}</text>
                      <text x={bx} y={by + 4} textAnchor="middle" className="mm-graph-node-count">{bn.count}</text>
                    </g>
                  );
                })}
                {/* Memory nodes */}
                {bucketNodes.map((bn, bi) => {
                  const bx = cx + bucketRadius * Math.cos((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const by = cy + bucketRadius * Math.sin((2 * Math.PI * bi) / Math.max(bucketNodes.length, 1));
                  const related = memNodes.filter(m => m.bucket === bn.label);
                  return related.map((mn, mi) => {
                    const angle = (2 * Math.PI * mi) / Math.max(related.length, 1);
                    const mx = bx + memoryRadius * Math.cos(angle);
                    const my = by + memoryRadius * Math.sin(angle);
                    const isSelected = graphSelectedNode === mn.id;
                    return (
                      <g key={mn.id} onClick={() => setGraphSelectedNode(isSelected ? null : mn.id)} style={{ cursor: 'pointer' }}>
                        <circle cx={mx} cy={my} r={isSelected ? 10 : 7} className={`mm-graph-node-memory${isSelected ? ' selected' : ''}`} />
                      </g>
                    );
                  });
                })}
              </svg>
            )}
          </div>

          {/* Detail sidebar */}
          <div className="mm-graph-detail">
            <div className="mm-panel">
              <div className="mm-panel-head"><h2>Details</h2></div>
              {selectedNode ? (
                <div className="mm-graph-detail-content">
                  <div className="mm-graph-detail-row">
                    <span className="mm-graph-detail-label">Type</span>
                    <span className={`mm-graph-detail-badge mm-graph-detail-${selectedNode.type}`}>
                      {selectedNode.type === 'bucket' ? 'Bucket' : 'Memory'}
                    </span>
                  </div>
                  <div className="mm-graph-detail-row">
                    <span className="mm-graph-detail-label">Name</span>
                    <span className="mm-graph-detail-val">{selectedNode.label}</span>
                  </div>
                  {selectedNode.type === 'bucket' && (
                    <div className="mm-graph-detail-row">
                      <span className="mm-graph-detail-label">Memories</span>
                      <span className="mm-graph-detail-val">{selectedNode.count}</span>
                    </div>
                  )}
                  {selectedNode.type === 'memory' && selectedNode.bucket && (
                    <div className="mm-graph-detail-row">
                      <span className="mm-graph-detail-label">Bucket</span>
                      <span className="mm-graph-detail-val">{selectedNode.bucket}</span>
                    </div>
                  )}
                  {selectedNode.content && (
                    <div className="mm-graph-detail-row mm-graph-detail-row-full">
                      <span className="mm-graph-detail-label">Content</span>
                      <p className="mm-graph-detail-text">{selectedNode.content}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mm-graph-detail-empty">
                  <Info size={16} />
                  <p>Click a node to see details</p>
                </div>
              )}
            </div>
            <div className="mm-panel">
              <div className="mm-panel-head"><h2>Summary</h2></div>
              <div className="mm-pg-stat-rows">
                <div className="mm-pg-stat-row">
                  <span className="mm-pg-stat-label">Buckets</span>
                  <span className="mm-pg-stat-val">{bucketNodes.length}</span>
                </div>
                <div className="mm-pg-stat-row">
                  <span className="mm-pg-stat-label">Visible Nodes</span>
                  <span className="mm-pg-stat-val">{memNodes.length}</span>
                </div>
                <div className="mm-pg-stat-row">
                  <span className="mm-pg-stat-label">Total Memories</span>
                  <span className="mm-pg-stat-val">{stats.totalMemories.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════ Webhooks ══════════ */
  const WEBHOOK_EVENTS = ['memory.created', 'memory.updated', 'memory.deleted', 'bucket.created', 'bucket.shared'];

  const toggleWhEvent = (ev: string) => {
    setWhEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  const renderWebhooks = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="webhooks" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
      <div className="mm-page-header">
        <div className="mm-page-header-left">
          <h1 className="mm-page-title">Webhooks</h1>
          <p className="mm-page-subtitle">Subscribe to memory events and trigger workflows.</p>
        </div>
        <div className="mm-page-header-right">
          <button className="mm-btn-primary" onClick={() => { setWhAddOpen(true); setWhNewSecret(null); }}>
            <Plus size={14} /> Add Endpoint
          </button>
        </div>
      </div>
      <div className="mm-content">
        {/* New webhook secret banner */}
        {whNewSecret && (
          <div className="mm-wh-secret-banner">
            <div className="mm-wh-secret-banner-content">
              <Shield size={16} />
              <div>
                <h4>Signing Secret Created</h4>
                <p>Save this secret now. It won&apos;t be shown again.</p>
                <code className="mm-wh-secret-code">{whNewSecret}</code>
              </div>
            </div>
            <div className="mm-wh-secret-actions">
              <button className="mm-btn-secondary" onClick={() => { navigator.clipboard.writeText(whNewSecret); }}>
                <Copy size={12} /> Copy
              </button>
              <button className="mm-btn-icon-sm" onClick={() => setWhNewSecret(null)}><X size={14} /></button>
            </div>
          </div>
        )}

        {/* Endpoints list */}
        <div className="mm-panel">
          <div className="mm-panel-head">
            <h2>Endpoints</h2>
            <span className="mm-text-muted" style={{ fontSize: '0.72rem' }}>{webhooksData.length} total</span>
          </div>
          {whLoading ? (
            <div className="mm-empty-state" style={{ padding: '40px' }}>
              <Loader2 size={24} className="mm-spin" />
              <p>Loading webhooks...</p>
            </div>
          ) : webhooksData.length === 0 ? (
            <div className="mm-empty-state" style={{ padding: '40px' }}>
              <Webhook size={28} strokeWidth={1.2} className="mm-empty-icon-svg" />
              <h3>No webhooks configured</h3>
              <p>Add an endpoint to receive event notifications.</p>
            </div>
          ) : (
            <div className="mm-webhook-list">
              {webhooksData.map(w => (
                <div key={w.id} className="mm-webhook-row">
                  <div className="mm-webhook-icon"><Webhook size={15} /></div>
                  <div className="mm-webhook-info">
                    <span className="mm-webhook-url">{w.url}</span>
                    <span className="mm-webhook-meta">{(w.events || []).join(', ')}</span>
                  </div>
                  <div className="mm-wh-row-actions">
                    <button
                      className="mm-btn-icon-sm"
                      onClick={() => toggleWebhook(w.id, !w.isActive)}
                      title={w.isActive ? 'Pause' : 'Activate'}
                    >
                      {w.isActive ? <ToggleRight size={16} className="mm-green" /> : <ToggleLeft size={16} />}
                    </button>
                    <span className={`mm-webhook-status ${w.isActive ? 'mm-green' : 'mm-text-muted'}`}>
                      {w.isActive ? 'Active' : 'Paused'}
                    </span>
                    <button className="mm-btn-icon-sm mm-hover-red" onClick={() => deleteWebhook(w.id)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event Types Reference */}
        <div className="mm-panel">
          <div className="mm-panel-head"><h2>Available Events</h2></div>
          <div className="mm-wh-events-ref">
            {WEBHOOK_EVENTS.map(ev => (
              <div key={ev} className="mm-wh-event-ref-row">
                <code className="mm-wh-event-code">{ev}</code>
                <span className="mm-wh-event-desc">
                  {ev === 'memory.created' && 'Triggered when a new memory is stored'}
                  {ev === 'memory.updated' && 'Triggered when an existing memory is modified'}
                  {ev === 'memory.deleted' && 'Triggered when a memory is removed'}
                  {ev === 'bucket.created' && 'Triggered when a new bucket is created'}
                  {ev === 'bucket.shared' && 'Triggered when a bucket is shared'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Webhook Modal */}
      {whAddOpen && (
        <div className="mm-modal-overlay" onClick={() => setWhAddOpen(false)}>
          <div className="mm-modal mm-wh-modal" onClick={e => e.stopPropagation()}>
            <div className="mm-modal-head">
              <h3>Add Webhook Endpoint</h3>
              <button className="mm-btn-icon-sm" onClick={() => setWhAddOpen(false)}><X size={15} /></button>
            </div>
            <div className="mm-modal-body">
              <div className="mm-modal-field">
                <label>Endpoint URL</label>
                <input
                  className="mm-modal-input"
                  placeholder="https://your-server.com/webhook"
                  value={whUrl}
                  onChange={e => setWhUrl(e.target.value)}
                />
                <span className="mm-modal-hint">Must use HTTPS</span>
              </div>
              <div className="mm-modal-field">
                <label>Events</label>
                <div className="mm-wh-event-picker">
                  {WEBHOOK_EVENTS.map(ev => (
                    <button
                      key={ev}
                      className={`mm-wh-event-chip${whEvents.includes(ev) ? ' active' : ''}`}
                      onClick={() => toggleWhEvent(ev)}
                    >
                      {whEvents.includes(ev) ? <Check size={11} /> : <Plus size={11} />}
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mm-modal-footer">
              <button className="mm-btn-secondary" onClick={() => setWhAddOpen(false)}>Cancel</button>
              <button
                className="mm-btn-primary"
                disabled={!whUrl.startsWith('https://') || whEvents.length === 0 || whCreating}
                onClick={async () => { await createWebhook(); setWhAddOpen(false); }}
              >
                {whCreating ? <><Loader2 size={13} className="mm-spin" /> Creating...</> : 'Create Endpoint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ══════════ Usage & Billing ══════════ */
  const renderUsage = () => (
    <div className="mm-dashboard">
      <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="usage" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
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
  const notifData = globalNotifs.map(n => ({ ...n, archived: archivedIds.has(n.id) }));

  const markNotifRead = async (id: string) => {
    try {
      await fetch('/api/dashboard/notifications', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifIds: [id] }),
      });
      refetchNotifs();
    } catch { /* ignore */ }
  };

  const markAllNotifRead = async () => {
    await globalMarkAllRead();
  };

  const archiveNotif = (id: string) => {
    setArchivedIds(prev => new Set(prev).add(id));
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
      <Topbar org={organization} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} onCreateWorkspace={handleCreateWorkspace} buckets={buckets} selectedBucket={selectedBucket} onSelectBucket={setSelectedBucket} onCreateBucket={() => setCreateBucketOpen(true)} activePage="notifications" onSearch={() => setCmdOpen(true)} onRefresh={refreshData} onSettings={() => setActive('config')} notificationsEnabled={isLoaded && !!user} />
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
      case 'playground': { router.push('/playground'); return null; }
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

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={setActive}
        onRefresh={() => refreshData()}
        onCreateBucket={() => setCreateBucketOpen(true)}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        onSignOut={doSignOut}
        memories={memories.slice(0, 20).map(m => ({ id: m.id, title: m.title, bucket: m.bucket }))}
        buckets={buckets}
        stats={stats}
      />
      <ShareBucketModal open={shareOpen} onClose={() => setShareOpen(false)} buckets={buckets} onShareComplete={refreshData} />
      <CreateBucketModal open={createBucketOpen} onClose={() => setCreateBucketOpen(false)} onCreated={refreshData} />
    </div>
  );
}
