'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoryRow, ActivityItem } from '../_components/types';

/* ── Types ── */
export interface DashboardStats {
  totalMemories: number;
  totalTokens: number;
  originalTokens: number;
  activeSessions: number;
  buckets: { name: string; count: number }[];
  sparkMemories: number[];
  dailyChart: { label: string; value: number; date?: string }[];
  hourlyChart: { label: string; value: number }[];
  heatmapData: { month: string; weeks: (number | { date: string | null; value: number })[][] }[];
  peakHour: string;
  memoryDelta: number;
  previousMemories: number;
  range: string;
  /** Daily token sums — proxy for MCP fetch/read query volume */
  mcpFetchChart: { label: string; value: number; date?: string }[];
  generatedAt?: string;
  observedHours?: number;
}

export interface DashboardMemory {
  id: string;
  bucket: string;
  title: string;
  tags: string[];
  tokenCount: number;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardBucket {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  memoryCount: number;
  createdAt: string;
}

const EMPTY_STATS: DashboardStats = {
  totalMemories: 0,
  totalTokens: 0,
  originalTokens: 0,
  activeSessions: 0,
  buckets: [],
  sparkMemories: [],
  dailyChart: [],
  hourlyChart: [],
  heatmapData: [],
  peakHour: '—',
  memoryDelta: 0,
  previousMemories: 0,
  range: '30d',
  mcpFetchChart: [],
  generatedAt: undefined,
  observedHours: 24,
};

/* ── Module-level SWR cache ──
 * First paint reads from here (no null flash), every mount revalidates in
 * the background. Survives route changes because it lives outside React.
 * 401s are never cached — a 401 right after login is a session race, not data.
 */
interface CacheEntry {
  stats: DashboardStats;
  memories: DashboardMemory[];
  buckets: DashboardBucket[];
  at: number;
}
const DATA_CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<CacheEntry | null>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const dashboardCacheKey = (orgId: string | null, range: string) =>
  `${orgId ?? 'default'}|${range}`;

function readCache(orgId: string | null, range: string): CacheEntry | null {
  const entry = DATA_CACHE.get(dashboardCacheKey(orgId, range));
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry;
}

/** fetch with session-race retry: a 401 immediately after login usually means
 *  the auth cookie isn't usable server-side yet — wait and try again. */
async function fetchJsonWithRetry(
  url: string,
  signal: AbortSignal,
  retries = 2,
): Promise<{ ok: boolean; status: number; data: any }> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, { credentials: 'include', signal });
    if (res.status !== 401 || attempt >= retries || signal.aborted) {
      const data = res.ok ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, data };
    }
    attempt += 1;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1200 * attempt);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}

export function useDashboardData(
  enabled = true,
  timeRange = '30d',
  orgId: string | null = null,
  memoriesEnabled = true,  // when false, skip the /memories fetch (e.g. on settings page)
) {
  // Seed from the module cache so the first paint already shows data —
  // no null/empty flash while the background revalidation runs.
  const [stats, setStats] = useState<DashboardStats>(() => readCache(orgId, timeRange)?.stats ?? EMPTY_STATS);
  const [memories, setMemories] = useState<DashboardMemory[]>(() => readCache(orgId, timeRange)?.memories ?? []);
  const [buckets, setBuckets] = useState<DashboardBucket[]>(() => readCache(orgId, timeRange)?.buckets ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  // Keep a stable ref so doFetch ([] deps) always reads the latest value.
  const memoriesEnabledRef = useRef(memoriesEnabled);
  memoriesEnabledRef.current = memoriesEnabled;

  // Stable fetch — receives all params as arguments so it never needs to be recreated.
  // Empty deps [] means this callback reference is the same for the component lifetime.
  // Successful full fetches are written to the module cache; concurrent mounts
  // share one in-flight request instead of firing duplicates.
  const doFetch = useCallback(async (
    currentOrgId: string | null,
    currentTimeRange: string,
    signal: AbortSignal,
    statsOnly: boolean,
  ) => {
    const orgParam = currentOrgId ? `&orgId=${encodeURIComponent(currentOrgId)}` : '';
    const orgQuery = currentOrgId ? `?orgId=${encodeURIComponent(currentOrgId)}` : '';
    const withMemories = memoriesEnabledRef.current;
    const key = dashboardCacheKey(currentOrgId, currentTimeRange);

    const finish = (entry: CacheEntry | null) => {
      if (signal.aborted) return;
      if (entry) {
        DATA_CACHE.set(key, entry);
        setStats(entry.stats);
        if (withMemories && !statsOnly) setMemories(entry.memories);
        if (!statsOnly) setBuckets(entry.buckets);
      }
    };

    // Dedupe: if another mount already has this exact fetch in flight, await it.
    const shared = !statsOnly ? INFLIGHT.get(key) : undefined;
    if (shared) {
      setLoading(true);
      try {
        finish(await shared);
      } catch { /* ignore */ }
      finally {
        if (!signal.aborted) setLoading(false);
      }
      return;
    }

    const run = (async (): Promise<CacheEntry | null> => {
      const statsUrl = `/api/dashboard/stats?range=${currentTimeRange}&timezone=${encodeURIComponent(timezone)}${orgParam}`;
      if (statsOnly) {
        const sRes = await fetchJsonWithRetry(statsUrl, signal);
        if (signal.aborted) return null;
        if (!sRes.ok || !sRes.data) throw new Error(`Stats ${sRes.status}`);
        const prev = DATA_CACHE.get(key);
        return {
          stats: sRes.data,
          memories: prev?.memories ?? [],
          buckets: prev?.buckets ?? [],
          at: Date.now(),
        };
      }
      const [sRes, mRes, bRes] = await Promise.all([
        fetchJsonWithRetry(statsUrl, signal),
        withMemories
          ? fetchJsonWithRetry(`/api/dashboard/memories${orgQuery}`, signal)
          : Promise.resolve({ ok: true, status: 200, data: { memories: [] } }),
        fetchJsonWithRetry(`/api/dashboard/buckets${orgQuery}`, signal),
      ]);
      if (signal.aborted) return null;
      if (!sRes.ok || !sRes.data) throw new Error(`Stats ${sRes.status}`);
      return {
        stats: sRes.data,
        memories: withMemories ? (mRes.data?.memories || []) : [],
        buckets: bRes.data?.buckets || [],
        at: Date.now(),
      };
    })();

    if (!statsOnly) INFLIGHT.set(key, run);
    try {
      setLoading(true);
      setError(null);
      finish(await run);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !signal.aborted) {
        setError(err?.message || 'Failed to load dashboard data');
      }
    } finally {
      if (!statsOnly) INFLIGHT.delete(key);
      // Only clear loading if this fetch was not superseded by another one.
      if (!signal.aborted) setLoading(false);
    }
  }, []); // stable — intentionally no deps

  // undefined = not yet run (sentinel distinct from null orgId)
  const prevOrgRef  = useRef<string | null | undefined>(undefined);
  const prevRangeRef = useRef<string | undefined>(undefined);
  // Track whether the component is still mounted to decide if refs should be reset.
  const isMountedRef = useRef(false);

  // Set/unset isMounted only on true mount/unmount (no deps).
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // True unmount — reset tracking refs so the next mount starts fresh.
      prevOrgRef.current   = undefined;
      prevRangeRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const prevOrg   = prevOrgRef.current;
    const isInitial = prevOrg === undefined;
    const orgChanged       = !isInitial && prevOrg !== orgId;
    const onlyRangeChanged = !isInitial && !orgChanged && prevRangeRef.current !== timeRange;

    prevOrgRef.current   = orgId;
    prevRangeRef.current = timeRange;

    // Clear stale data immediately when workspace changes so the UI shows loading
    // instead of the previous org's memories while the new fetch is in flight.
    if (orgChanged) {
      setStats(EMPTY_STATS);
      setMemories([]);
      setBuckets([]);
    }

    const ac = new AbortController();
    doFetch(orgId, timeRange, ac.signal, onlyRangeChanged).catch(() => {});

    return () => {
      // Abort any in-flight fetch so it doesn't update state for old params.
      // Do NOT reset the tracking refs here — they are only reset on true unmount
      // (handled by the isMountedRef effect above). Resetting here would cause every
      // range-click to be treated as an initial load, doubling API calls.
      ac.abort();
    };
  // doFetch is stable ([] deps), so effect only re-runs when enabled/orgId/timeRange change.
  }, [enabled, orgId, timeRange, doFetch]);

  // Keep the current-day ledger live without refetching the heavier memories and
  // bucket lists. The API uses the viewer's calendar day and a short today-only
  // cache, so the chart resets at local midnight and reflects new memories quickly.
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const ac = new AbortController();
      doFetch(orgId, timeRange, ac.signal, true).catch(() => {});
    }, timeRange === 'today' ? 10_000 : 60_000);
    return () => window.clearInterval(interval);
  }, [enabled, orgId, timeRange, doFetch]);

  // Lazy memories load — fires ONLY when memoriesEnabled transitions false → true and
  // memories haven't been loaded yet (e.g. user navigates from settings → dashboard).
  const prevMemoriesEnabledRef = useRef(memoriesEnabled);
  useEffect(() => {
    const wasDisabled = prevMemoriesEnabledRef.current === false;
    prevMemoriesEnabledRef.current = memoriesEnabled;

    if (!enabled || !memoriesEnabled || !wasDisabled) return;
    // memories might already be in state from a prior full fetch — skip if so
    // (state reads inside an effect are always current at execution time)
    const ac = new AbortController();
    const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
    fetchJsonWithRetry(`/api/dashboard/memories${orgQuery}`, ac.signal)
      .then(r => { if (r.ok && r.data) setMemories(r.data.memories || []); })
      .catch(() => {});
    return () => ac.abort();
  }, [enabled, memoriesEnabled, orgId]);

  // Manual refresh exposed to the Topbar button — always does a full refresh
  // and overwrites the module cache so revisits start from fresh data.
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const fallback = signal instanceof AbortSignal ? null : new AbortController();
    const activeSignal = signal instanceof AbortSignal ? signal : fallback!.signal;
    const orgParam = orgId ? `&orgId=${encodeURIComponent(orgId)}` : '';
    const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
    try {
      setLoading(true);
      setError(null);
      const refreshParam = `&refresh=1&refreshAt=${Date.now()}`;
      const refreshQuery = `?refresh=1&refreshAt=${Date.now()}`;
      const [sRes, mRes, bRes] = await Promise.all([
        fetchJsonWithRetry(`/api/dashboard/stats?range=${timeRange}&timezone=${encodeURIComponent(timezone)}${orgParam}${refreshParam}`, activeSignal),
        fetchJsonWithRetry(`/api/dashboard/memories${orgQuery ? `${orgQuery}&refresh=1&refreshAt=${Date.now()}` : refreshQuery}`, activeSignal),
        fetchJsonWithRetry(`/api/dashboard/buckets${orgQuery ? `${orgQuery}&refresh=1&refreshAt=${Date.now()}` : refreshQuery}`, activeSignal),
      ]);
      if (sRes.ok && sRes.data) {
        const entry: CacheEntry = {
          stats: sRes.data,
          memories: mRes.data?.memories || [],
          buckets: bRes.data?.buckets || [],
          at: Date.now(),
        };
        DATA_CACHE.set(dashboardCacheKey(orgId, timeRange), entry);
        INFLIGHT.delete(dashboardCacheKey(orgId, timeRange));
        setStats(entry.stats);
        setMemories(entry.memories);
        setBuckets(entry.buckets);
      } else if (!sRes.ok) {
        setError(`Stats ${sRes.status}`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange, orgId]);

  /* ── Transform for components ── */
  const memoryRows: MemoryRow[] = memories.map((m) => ({
    id: m.id,
    time: relativeTime(m.createdAt),
    entity: m.bucket,
    content: m.title || '(untitled)',
    categories: m.tags.length > 0 ? m.tags : [m.bucket],
  }));

  const activityItems: ActivityItem[] = memories.slice(0, 8).map((m, i) => ({
    id: String(i),
    type: 'memory' as const,
    title: i === 0 ? 'Latest memory' : 'Memory stored',
    desc: m.title || m.bucket,
    time: relativeTime(m.createdAt),
    status: 'success' as const,
  }));

  // Fill sparklines with at least 10 data points
  const sparkTokens = padArray(stats.sparkMemories.map((v) => v * 50), 10);
  const sparkMemories = padArray(stats.sparkMemories, 10);

  return {
    stats,
    memories,
    buckets,
    memoryRows,
    activityItems,
    sparkTokens,
    sparkMemories,
    loading,
    error,
    refresh,
  };
}

/* ── Helpers ── */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `about ${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

function padArray(arr: number[], length: number): number[] {
  if (arr.length >= length) return arr.slice(-length);
  return [...Array(length - arr.length).fill(0), ...arr];
}
