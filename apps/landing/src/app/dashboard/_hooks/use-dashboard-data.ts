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
  dailyChart: { label: string; value: number }[];
  hourlyChart: { label: string; value: number }[];
  heatmapData: { month: string; weeks: number[][] }[];
  peakHour: string;
  memoryDelta: number;
  previousMemories: number;
  range: string;
  /** Daily token sums — proxy for MCP fetch/read query volume */
  mcpFetchChart: { label: string; value: number }[];
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
};

export function useDashboardData(enabled = true, timeRange = '30d', orgId: string | null = null) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [memories, setMemories] = useState<DashboardMemory[]>([]);
  const [buckets, setBuckets] = useState<DashboardBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable fetch — receives all params as arguments so it never needs to be recreated.
  // Empty deps [] means this callback reference is the same for the component lifetime.
  const doFetch = useCallback(async (
    currentOrgId: string | null,
    currentTimeRange: string,
    signal: AbortSignal,
    statsOnly: boolean,
  ) => {
    const opts: RequestInit = { credentials: 'include', signal };
    const orgParam = currentOrgId ? `&orgId=${encodeURIComponent(currentOrgId)}` : '';
    const orgQuery = currentOrgId ? `?orgId=${encodeURIComponent(currentOrgId)}` : '';

    try {
      setLoading(true);
      setError(null);

      if (statsOnly) {
        const sRes = await fetch(`/api/dashboard/stats?range=${currentTimeRange}${orgParam}`, opts);
        if (!signal.aborted) {
          if (sRes.ok) setStats(await sRes.json());
          else {
            const e = await sRes.json().catch(() => ({}));
            setError(`Stats ${sRes.status}: ${e.error || 'unknown'}`);
          }
        }
      } else {
        const [sRes, mRes, bRes] = await Promise.all([
          fetch(`/api/dashboard/stats?range=${currentTimeRange}${orgParam}`, opts),
          fetch(`/api/dashboard/memories${orgQuery}`, opts),
          fetch(`/api/dashboard/buckets${orgQuery}`, opts),
        ]);
        if (!signal.aborted) {
          if (sRes.ok) setStats(await sRes.json());
          else {
            const e = await sRes.json().catch(() => ({}));
            setError(`Stats ${sRes.status}: ${e.error || 'unknown'}`);
          }
          if (mRes.ok) setMemories((await mRes.json()).memories || []);
          if (bRes.ok) setBuckets((await bRes.json()).buckets || []);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !signal.aborted) setError(err.message);
    } finally {
      // Only clear loading if this fetch was not superseded by another one.
      // Checking signal.aborted prevents an aborted fetch from clearing the loading
      // state that the next (active) fetch has already set.
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

  // Manual refresh exposed to the Topbar button — always does a full refresh.
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const opts: RequestInit = { credentials: 'include' };
    if (signal instanceof AbortSignal) opts.signal = signal;
    const orgParam = orgId ? `&orgId=${encodeURIComponent(orgId)}` : '';
    const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
    try {
      setLoading(true);
      setError(null);
      const [sRes, mRes, bRes] = await Promise.all([
        fetch(`/api/dashboard/stats?range=${timeRange}${orgParam}`, opts),
        fetch(`/api/dashboard/memories${orgQuery}`, opts),
        fetch(`/api/dashboard/buckets${orgQuery}`, opts),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (mRes.ok) setMemories((await mRes.json()).memories || []);
      if (bRes.ok) setBuckets((await bRes.json()).buckets || []);
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
