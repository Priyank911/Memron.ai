'use client';

import Image from 'next/image';
import {
  LayoutDashboard, Key, Puzzle, BarChart3, Settings, CreditCard,
  Database, GitBranch, Webhook, Download,
  ChevronDown, ChevronUp, LogOut, HelpCircle, MessageSquare, Activity,
} from 'lucide-react';
import type { OrgInfo } from './types';

/* ── Navigation sections ── */
const SETUP_NAV = [
  { id: 'install', icon: Download, label: 'Install Memron' },
  { id: 'playground', icon: MessageSquare, label: 'Playground' },
  { id: 'api-keys', icon: Key, label: 'API Keys' },
];

const ACTIVITY_NAV = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'request', icon: Activity, label: 'Request' },
  { id: 'entities', icon: Database, label: 'Entities' },
  { id: 'memories', icon: Database, label: 'Memories' },
  { id: 'graph-memory', icon: GitBranch, label: 'Graph Memory' },
  { id: 'webhooks', icon: Webhook, label: 'Webhooks' },
  { id: 'memory-exports', icon: Download, label: 'Memory Exports' },
];

const ACCOUNT_NAV = [
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'usage', icon: CreditCard, label: 'Usage & Billing' },
];

const BOTTOM_NAV = [
  { id: 'feedback', icon: MessageSquare, label: 'Feedback' },
  { id: 'status', icon: Activity, label: 'Status' },
  { id: 'help', icon: HelpCircle, label: 'Help / Support' },
];

interface SidebarProps {
  org: OrgInfo | null;
  active: string;
  onNav: (id: string) => void;
  onSignOut: () => void;
  user: {
    fullName?: string | null;
    firstName?: string | null;
    imageUrl?: string;
    emailAddresses?: { emailAddress: string }[];
  } | null;
  usage?: { tokens: number; tokenLimit: number; searches: number; searchLimit: number; resetDate: string };
}

export function Sidebar({ org, active, onNav, onSignOut, user, usage }: SidebarProps) {
  return (
    <aside className="db-sidebar">
      {/* Org header */}
      <div className="db-sidebar-org">
        <div className="db-sidebar-org-icon">
          <Image src="/logo_w.png" alt="Memron" width={20} height={20} />
        </div>
        <div className="db-sidebar-org-info">
          <span className="db-sidebar-org-name">{org?.name || 'Organization'}</span>
          <span className="db-sidebar-org-plan">Free Plan</span>
        </div>
        <ChevronDown size={14} className="db-sidebar-org-chevron" />
      </div>

      {/* Upgrade */}
      <div className="db-sidebar-upgrade">
        <button className="db-sidebar-upgrade-btn">
          <span>✦</span> Upgrade
        </button>
      </div>

      <div className="db-sidebar-nav-scroll">
        {/* SETUP */}
        <NavSection label="SETUP" items={SETUP_NAV} active={active} onNav={onNav} />

        {/* ACTIVITY */}
        <NavSection label="ACTIVITY" items={ACTIVITY_NAV} active={active} onNav={onNav} />

        {/* ACCOUNT */}
        <NavSection label="ACCOUNT" items={ACCOUNT_NAV} active={active} onNav={onNav} />
      </div>

      {/* Usage summary */}
      {usage && (
        <div className="db-sidebar-usage">
          <div className="db-sidebar-usage-row">
            <BarChart3 size={13} />
            <span>Tokens</span>
            <span className="db-sidebar-usage-val">{usage.tokens.toLocaleString()} of {formatLimit(usage.tokenLimit)}</span>
          </div>
          <div className="db-sidebar-usage-bar">
            <div style={{ width: `${Math.min((usage.tokens / usage.tokenLimit) * 100, 100)}%` }} />
          </div>

          <div className="db-sidebar-usage-row">
            <BarChart3 size={13} />
            <span>Searches</span>
            <span className="db-sidebar-usage-val">{usage.searches.toLocaleString()} of {formatLimit(usage.searchLimit)}</span>
          </div>
          <div className="db-sidebar-usage-bar">
            <div style={{ width: `${Math.min((usage.searches / usage.searchLimit) * 100, 100)}%` }} />
          </div>

          <div className="db-sidebar-usage-reset">Usage will reset {usage.resetDate}</div>
        </div>
      )}

      {/* Bottom links */}
      <div className="db-sidebar-bottom">
        {BOTTOM_NAV.map((it) => (
          <button
            key={it.id}
            className={`db-sidebar-link${active === it.id ? ' active' : ''}`}
            onClick={() => onNav(it.id)}
          >
            <it.icon size={15} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>

      {/* User footer */}
      <div className="db-sidebar-user">
        <div className="db-sidebar-user-avatar">
          {user?.imageUrl
            ? <Image src={user.imageUrl} alt="" width={28} height={28} style={{ borderRadius: 6 }} />
            : <div className="db-sidebar-user-avatar-fallback">{(user?.firstName || 'U')[0]}</div>
          }
        </div>
        <div className="db-sidebar-user-info">
          <span className="db-sidebar-user-name">{user?.fullName || user?.firstName || 'User'}</span>
          <span className="db-sidebar-user-email">{user?.emailAddresses?.[0]?.emailAddress || ''}</span>
        </div>
        <button className="db-sidebar-user-menu" onClick={onSignOut} title="Sign out">
          <ChevronUp size={14} />
        </button>
      </div>
    </aside>
  );
}

/* ── Nav section ── */
function NavSection({ label, items, active, onNav }: {
  label: string;
  items: typeof SETUP_NAV;
  active: string;
  onNav: (id: string) => void;
}) {
  return (
    <div className="db-sidebar-section">
      <div className="db-sidebar-section-label">{label}</div>
      {items.map((it) => (
        <button
          key={it.id}
          className={`db-sidebar-link${active === it.id ? ' active' : ''}`}
          onClick={() => onNav(it.id)}
        >
          <it.icon size={15} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function formatLimit(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
