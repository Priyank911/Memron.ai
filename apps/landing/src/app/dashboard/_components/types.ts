/* ═══════════════════════════════════════════════
   Dashboard shared types
   ═══════════════════════════════════════════════ */

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface UserInfo {
  universalId: string;
  email: string;
  fullName: string | null;
}

export interface ApiKeyInfo {
  prefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
}

export interface MemoryRow {
  id: string;
  time: string;
  entity: string;
  content: string;
  categories: string[];
}

export interface ActivityItem {
  id: string;
  type: 'memory' | 'api' | 'sync' | 'error';
  title: string;
  desc: string;
  time: string;
  status: 'success' | 'error' | 'warning' | 'info';
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export type SystemStatus = 'healthy' | 'degraded' | 'down';
