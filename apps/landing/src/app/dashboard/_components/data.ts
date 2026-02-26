/* ═══════════════════════════════════════════════
   Dashboard mock data — swap for real API later
   ═══════════════════════════════════════════════ */

import type { MemoryRow, ActivityItem } from './types';

/* ── Sparkline data ── */
export const SPARK_TOKENS = [80, 120, 95, 200, 160, 236, 190, 220, 180, 236];
export const SPARK_QUERIES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export const SPARK_MEMORIES = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
export const SPARK_CONNECTIONS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/* ── Bar chart - token usage last 7 days ── */
export const TOKEN_USAGE_DAYS = [
  { label: 'Fri', value: 40 },
  { label: 'Sat', value: 0 },
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 60 },
  { label: 'Tue', value: 80 },
  { label: 'Wed', value: 30 },
  { label: 'Thu', value: 26 },
];

/* ── Donut chart - container tags ── */
export const CONTAINER_TAGS = [
  { value: 2, color: '#3b82f6', label: 'Documents' },
];

/* ── Donut chart - request types ── */
export const REQUEST_TYPES = [
  { value: 3, color: '#3b82f6', label: 'profile_v4' },
  { value: 1, color: '#22c55e', label: 'add' },
];

/* ── Memories table ── */
export const MEMORIES: MemoryRow[] = [
  { id: '1', time: 'about 24 hours ago', entity: 'playground', content: 'I am a technical user', categories: ['technology'] },
  { id: '2', time: 'about 24 hours ago', entity: 'playground', content: 'My industry is Coding agents.', categories: ['professional details'] },
  { id: '3', time: 'about 24 hours ago', entity: 'playground', content: 'I work at student', categories: ['professional details'] },
];

/* ── Activity feed ── */
export const ACTIVITY: ActivityItem[] = [
  { id: '1', type: 'memory', title: 'New memory indexed', desc: 'Conversation context from Playground', time: '24 hr ago', status: 'success' },
  { id: '2', type: 'api', title: 'API profile request', desc: 'profile_v4 — 3 memories matched', time: '24 hr ago', status: 'success' },
  { id: '3', type: 'memory', title: 'Memory added', desc: '"I am a technical user"', time: '24 hr ago', status: 'success' },
  { id: '4', type: 'memory', title: 'Memory added', desc: '"My industry is Coding agents"', time: '24 hr ago', status: 'success' },
  { id: '5', type: 'sync', title: 'Initial sync complete', desc: 'Workspace initialized successfully', time: '24 hr ago', status: 'success' },
];

/* ── System services ── */
export const SYSTEM_SERVICES = [
  { name: 'API Gateway', status: 'healthy' as const, latency: '12ms' },
  { name: 'Memory Index', status: 'healthy' as const, latency: '24ms' },
  { name: 'Vector Store', status: 'healthy' as const, latency: '18ms' },
  { name: 'Embedding Pipeline', status: 'healthy' as const, latency: '45ms' },
  { name: 'Cache Layer', status: 'healthy' as const, latency: '3ms' },
];

/* ── API endpoints ── */
export const API_ENDPOINTS = [
  { method: 'POST', path: '/v1/memories', calls: 4, avg: '42ms', p99: '180ms' },
  { method: 'GET', path: '/v1/search', calls: 0, avg: '—', p99: '—' },
  { method: 'GET', path: '/v1/memories/:id', calls: 0, avg: '—', p99: '—' },
  { method: 'DELETE', path: '/v1/memories/:id', calls: 0, avg: '—', p99: '—' },
];

/* ── Data sources ── */
export const DATA_SOURCES = [
  { name: 'ChatGPT', icon: '🤖', status: 'disconnected' as const, memories: 0 },
  { name: 'Notion', icon: '📝', status: 'disconnected' as const, memories: 0 },
  { name: 'Slack', icon: '💬', status: 'disconnected' as const, memories: 0 },
  { name: 'Google Drive', icon: '📁', status: 'disconnected' as const, memories: 0 },
];
