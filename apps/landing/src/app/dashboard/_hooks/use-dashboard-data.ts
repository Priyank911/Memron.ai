'use client';

import { useState, useEffect, useCallback } from 'react';
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
};

export function useDashboardData(enabled = true, timeRange = '30d') {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [memories, setMemories] = useState<DashboardMemory[]>([]);
  const [buckets, setBuckets] = useState<DashboardBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const opts: RequestInit = { credentials: 'include', signal };
      const [statsRes, memoriesRes, bucketsRes] = await Promise.all([
        fetch(`/api/dashboard/stats?range=${timeRange}`, opts),
        fetch('/api/dashboard/memories', opts),
        fetch('/api/dashboard/buckets', opts),
      ]);

      // Stats
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      } else {
        const errBody = await statsRes.json().catch(() => ({}));
        const msg = `Stats API ${statsRes.status}: ${errBody.details || errBody.error || 'unknown'}`;
        console.error('[useDashboardData]', msg);
        setError(msg);
      }

      // Memories
      if (memoriesRes.ok) {
        const data = await memoriesRes.json();
        setMemories(data.memories || []);
      } else {
        const errBody = await memoriesRes.json().catch(() => ({}));
        console.error('[useDashboardData] Memories API error:', errBody);
      }

      // Buckets
      if (bucketsRes.ok) {
        const data = await bucketsRes.json();
        setBuckets(data.buckets || []);
      } else {
        console.warn('[useDashboardData] Buckets API error:', bucketsRes.status);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[useDashboardData] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    refresh(ac.signal).catch(() => {});
    return () => ac.abort();
  }, [enabled, refresh, timeRange]);

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
