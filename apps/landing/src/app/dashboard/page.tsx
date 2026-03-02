'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useUserSync } from '@/lib/hooks/use-user-sync';
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sidebar,
  Topbar,
  StatsRow,
  OverviewCharts,
  MemoriesTable,
  ActivityFeed,
  CommandPalette,
  RecentDocuments,
  ApiKeysPage,
} from './_components';
import type { OrgInfo, UserInfo, ApiKeyInfo } from './_components';
import { useDashboardData } from './_hooks/use-dashboard-data';

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
  const [dateRange] = useState('All Time');
  const [activeCategory, setActiveCategory] = useState('Overview');

  /* ── Real dashboard data ── */
  const {
    stats,
    memoryRows,
    activityItems,
    sparkTokens,
    sparkMemories,
    loading: dataLoading,
  } = useDashboardData();

  /* ── Prevent back navigation ── */
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const doSignOut = useCallback(async () => {
    document.cookie = 'memron_onboarded=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    await signOut();
    router.push('/');
  }, [signOut, router]);

  /* ── Loading ── */
  if (!isLoaded || !isReady) {
    return (
      <div className="db-loading">
        <Loader2 size={32} className="db-spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  /* ── Derived values from real data ── */
  const tokenQuota = `${stats.totalTokens.toLocaleString()} / 1.0M`;
  const bucketTags = stats.buckets.length > 0
    ? stats.buckets.map((b, i) => ({
        value: b.count,
        color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][i % 6],
        label: b.name,
      }))
    : [{ value: 0, color: '#3b82f6', label: 'No data' }];

  const tokenUsageDays = stats.dailyChart.length > 0
    ? stats.dailyChart.slice(-7)
    : [
        { label: 'Mon', value: 0 }, { label: 'Tue', value: 0 },
        { label: 'Wed', value: 0 }, { label: 'Thu', value: 0 },
        { label: 'Fri', value: 0 }, { label: 'Sat', value: 0 },
        { label: 'Sun', value: 0 },
      ];

  const requestTypes = bucketTags;

  const uniqueCategories = Array.from(new Set(memoryRows.flatMap((m) => m.categories)));

  /* ── Render page content based on active nav ── */
  const renderContent = () => {
    switch (active) {
      case 'api-keys':
        return <ApiKeysPage />;

      case 'memories':
        return (
          <div className="db-content">
            <div className="db-section-header">
              <h1 className="db-page-title">Memories</h1>
            </div>
            <MemoriesTable
              memories={memoryRows}
              dateRange={dateRange}
              categoryFilters={uniqueCategories}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />
          </div>
        );

      case 'dashboard':
      default:
        return (
          <div className="db-content">
            {/* Overview tabs */}
            <div className="db-overview-tabs">
              {['Overview', 'Requests', 'Memory Graph', 'Connectors'].map((tab) => (
                <button
                  key={tab}
                  className={`db-overview-tab${tab === 'Overview' ? ' active' : ''}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Section title */}
            <div className="db-section-header">
              <h1 className="db-page-title">Overview</h1>
              <div className="db-date-filter">
                <span>Last 30 days</span>
                <span className="db-date-chevron">▾</span>
              </div>
            </div>

            {dataLoading ? (
              <div className="db-loading-inline">
                <Loader2 size={20} className="db-spinner" />
                <span>Loading stats…</span>
              </div>
            ) : (
              <>
                {/* KPI Stats */}
                <StatsRow
                  stats={[
                    { label: 'Tokens Processed', value: stats.totalTokens.toLocaleString(), delta: stats.totalTokens > 0 ? 100 : 0, deltaSuffix: '%', sparkData: sparkTokens, sparkColor: '#3b82f6', quota: tokenQuota },
                    { label: 'Search Queries', value: '0', delta: 0, deltaSuffix: '%', sparkData: [0,0,0,0,0,0,0,0,0,0], sparkColor: '#3b82f6' },
                    { label: 'Memories Created', value: String(stats.totalMemories), delta: stats.totalMemories > 0 ? 100 : 0, deltaSuffix: '%', sparkData: sparkMemories, sparkColor: '#3b82f6' },
                    { label: 'Active Sessions', value: String(stats.activeSessions), delta: 0, deltaSuffix: '%', sparkData: [0,0,0,0,0,0,0,0,0,stats.activeSessions], sparkColor: '#3b82f6' },
                  ]}
                />

                {/* Charts row */}
                <OverviewCharts
                  containerTags={bucketTags}
                  tokenUsage={tokenUsageDays}
                  requestTypes={requestTypes}
                  totalTags={stats.buckets.length}
                  totalDocs={stats.totalMemories}
                  dateRange="Last 7 days"
                />

                {/* Recent Documents */}
                <RecentDocuments documents={memoryRows} />

                {/* Memories Table */}
                <MemoriesTable
                  memories={memoryRows}
                  dateRange={dateRange}
                  categoryFilters={uniqueCategories.length > 0 ? uniqueCategories : ['All']}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                />

                {/* Activity */}
                <ActivityFeed items={activityItems} />
              </>
            )}
          </div>
        );
    }
  };

  /* ═════════════ RENDER ═════════════ */
  return (
    <div className="db-root">
      {/* Sidebar */}
      <Sidebar
        org={organization}
        active={active}
        onNav={setActive}
        onSignOut={doSignOut}
        user={user as any}
        usage={{
          tokens: stats.totalTokens,
          tokenLimit: 1_000_000,
          searches: 0,
          searchLimit: 10_000,
          resetDate: 'Tue Mar 03 2026',
        }}
      />

      {/* Main content area */}
      <div className="db-main">
        {/* Top bar */}
        <Topbar
          orgName={organization?.name || 'default-org'}
          projectName="default-project"
          onCommandPalette={() => setCmdOpen(true)}
        />

        {/* Page content */}
        {renderContent()}
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
