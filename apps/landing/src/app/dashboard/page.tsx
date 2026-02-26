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
} from './_components';
import type { OrgInfo, UserInfo, ApiKeyInfo } from './_components';
import {
  SPARK_TOKENS, SPARK_QUERIES, SPARK_MEMORIES, SPARK_CONNECTIONS,
  TOKEN_USAGE_DAYS, CONTAINER_TAGS, REQUEST_TYPES,
  MEMORIES, ACTIVITY,
} from './_components/data';

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
          tokens: 127,
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

          {/* KPI Stats */}
          <StatsRow
            stats={[
              { label: 'Tokens Processed', value: '236', delta: 100, deltaSuffix: '%', sparkData: SPARK_TOKENS, sparkColor: '#3b82f6', quota: '127 / 1.0M' },
              { label: 'Search Queries', value: '0', delta: 0, deltaSuffix: '%', sparkData: SPARK_QUERIES, sparkColor: '#3b82f6' },
              { label: 'Memories Created', value: '4', delta: 100, deltaSuffix: '%', sparkData: SPARK_MEMORIES, sparkColor: '#3b82f6' },
              { label: 'Connections Active', value: '0', delta: 0, deltaSuffix: '%', sparkData: SPARK_CONNECTIONS, sparkColor: '#3b82f6' },
            ]}
          />

          {/* Charts row */}
          <OverviewCharts
            containerTags={CONTAINER_TAGS}
            tokenUsage={TOKEN_USAGE_DAYS}
            requestTypes={REQUEST_TYPES}
            totalTags={1}
            totalDocs={2}
            dateRange="Last 7 days"
          />

          {/* Recent Documents */}
          <RecentDocuments documents={MEMORIES} />

          {/* Memories Table */}
          <MemoriesTable
            memories={MEMORIES}
            dateRange={dateRange}
            categoryFilters={['Professional Details', 'Technology', 'User Preferences']}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          {/* Activity */}
          <ActivityFeed items={ACTIVITY} />
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
