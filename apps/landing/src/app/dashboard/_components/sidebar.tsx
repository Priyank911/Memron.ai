'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, MessageSquare, Key, Settings, Database,
  ChevronDown, ChevronRight, FolderPlus, Share2,
  GitBranch, Bell, Webhook, CreditCard, HelpCircle, BookOpen,
  LogOut, Sun, Moon, Monitor, Laptop, Sparkles,
} from 'lucide-react';
import type { OrgInfo } from './types';

/* ── Animated role ticker ── */
const ROLES = ['Developer', 'AI Engineer', 'Data Engineer', 'Full Stack Dev', 'Cloud Architect'];

function RoleTicker() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % ROLES.length);
        setFade(true);
      }, 300);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className={`mm-sb-user-role mm-role-ticker${fade ? ' mm-role-visible' : ''}`}>
      {ROLES[index]}
    </span>
  );
}

/* ── Navigation definitions ── */
const NAV_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    defaultOpen: true,
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'playground', icon: MessageSquare, label: 'Playground' },
      { id: 'memories', icon: Database, label: 'Memories' },
    ],
  },
  {
    id: 'develop',
    label: 'Develop',
    defaultOpen: true,
    items: [
      { id: 'api-keys', icon: Key, label: 'API Keys' },
      { id: 'graph-memory', icon: GitBranch, label: 'Graph Memory' },
      { id: 'webhooks', icon: Webhook, label: 'Webhooks' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    defaultOpen: false,
    items: [
      { id: 'config', icon: Settings, label: 'Settings' },
      { id: 'usage', icon: CreditCard, label: 'Usage & Billing' },
      { id: 'notifications', icon: Bell, label: 'Notifications' },
    ],
  },
];

export type ThemeMode = 'light' | 'dark' | 'system';

interface SidebarProps {
  org: OrgInfo | null;
  active: string;
  onNav: (id: string) => void;
  onSignOut: () => void;
  onShareBucket?: () => void;
  onCreateBucket?: () => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  user: {
    displayName?: string | null;
    photoURL?: string | null;
    email?: string | null;
  } | null;
}

export function Sidebar({ org, active, onNav, onSignOut, onShareBucket, onCreateBucket, user, theme, onThemeChange }: SidebarProps) {
  const router = useRouter();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    NAV_SECTIONS.forEach(s => { map[s.id] = s.defaultOpen; });
    return map;
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [comingSoonToast, setComingSoonToast] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  // Extract best display name with fallbacks
  const getDisplayName = () => {
    if (user?.displayName) return user.displayName;
    // Fallback: extract name from email (before @)
    if (user?.email) {
      const emailName = user.email.split('@')[0];
      // Capitalize first letter
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return 'User';
  };
  const displayName = getDisplayName();
  const email = user?.email || '';

  return (
    <aside className="mm-sidebar">
      {/* Brand header */}
      <div className="mm-sb-header">
        <div className="mm-sb-brand">
          <div className="mm-sb-logo-box">
            <Image src="/logo_w.png" alt="Memron" width={20} height={20} style={{ objectFit: 'contain' }} />
          </div>
          <span className="mm-sb-brand-text">{org?.name || 'Memron'}</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <div className="mm-sb-scroll">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id} className="mm-sb-section">
            <button
              className="mm-sb-section-title"
              onClick={() => toggleSection(section.id)}
            >
              <span>{section.label}</span>
              {openSections[section.id]
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              }
            </button>
            {openSections[section.id] && (
              <div className="mm-sb-section-items">
                {section.items.map((item) => {
                  const isComingSoon = item.id === 'webhooks';
                  return isComingSoon ? (
                    <button
                      key={item.id}
                      className="mm-sb-item mm-sb-item-coming-soon"
                      onClick={() => {
                        setComingSoonToast(true);
                        setTimeout(() => setComingSoonToast(false), 3000);
                      }}
                    >
                      <item.icon size={15} strokeWidth={1.7} />
                      <span>{item.label}</span>
                      <span className="mm-sb-coming-badge">Soon</span>
                    </button>
                  ) : (
                    <button
                      key={item.id}
                      className={`mm-sb-item${active === item.id ? ' active' : ''}`}
                      onClick={() => item.id === 'playground' ? router.push('/playground') : onNav(item.id)}
                    >
                      <item.icon size={15} strokeWidth={1.7} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Quick actions */}
        <div className="mm-sb-actions">
          <button className="mm-sb-action-btn" onClick={onCreateBucket}>
            <FolderPlus size={14} strokeWidth={1.7} />
            <span>Create Bucket</span>
          </button>
          <button className="mm-sb-action-btn" onClick={onShareBucket}>
            <Share2 size={14} strokeWidth={1.7} />
            <span>Share Bucket</span>
          </button>
        </div>
      </div>

      {/* Bottom — User section with dropdown */}
      <div className="mm-sb-footer" ref={menuRef}>
        <Link href="/docs" className="mm-sb-help" style={{ textDecoration: 'none' }}>
          <BookOpen size={14} strokeWidth={1.7} />
          <span>Documentation</span>
        </Link>

        <button className="mm-sb-help" onClick={() => onNav('help')}>
          <HelpCircle size={14} strokeWidth={1.7} />
          <span>Help & Support</span>
        </button>

        {/* User trigger */}
        <button className="mm-sb-user-trigger" onClick={() => setUserMenuOpen(p => !p)}>
          <div className="mm-sb-user-avatar">
            {user?.photoURL ? (
              <Image src={user.photoURL} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="mm-sb-avatar-fallback">{displayName[0]}</div>
            )}
            <span className="mm-sb-online-dot" />
          </div>
          <div className="mm-sb-user-info">
            <span className="mm-sb-user-name">{displayName}</span>
            <RoleTicker />
          </div>
        </button>

        {/* User dropdown menu */}
        {userMenuOpen && (
          <div className="mm-user-menu">
            <div className="mm-user-menu-header">
              <span className="mm-user-menu-greeting">Hi {displayName}!</span>
              <span className="mm-user-menu-email">{email}</span>
            </div>

            {/* Theme row */}
            <div className="mm-user-menu-theme">
              <span className="mm-user-menu-theme-label">Theme</span>
              <div className="mm-theme-toggles">
                <button
                  className={`mm-theme-btn${theme === 'light' ? ' active' : ''}`}
                  onClick={() => onThemeChange('light')}
                  title="Light"
                >
                  <Sun size={14} />
                </button>
                <button
                  className={`mm-theme-btn${theme === 'dark' ? ' active' : ''}`}
                  onClick={() => onThemeChange('dark')}
                  title="Dark"
                >
                  <Moon size={14} />
                </button>
                <button
                  className={`mm-theme-btn${theme === 'system' ? ' active' : ''}`}
                  onClick={() => onThemeChange('system')}
                  title="System"
                >
                  <Monitor size={14} />
                </button>
              </div>
            </div>

            {/* Logout */}
            <button className="mm-user-menu-logout" onClick={onSignOut}>
              <LogOut size={14} strokeWidth={1.7} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* Coming Soon Toast */}
      {comingSoonToast && (
        <div className="mm-coming-soon-toast">
          <Sparkles size={14} strokeWidth={1.8} />
          <span>Something great is cooking! Our devs are crafting Graph Memory for you.</span>
        </div>
      )}
    </aside>
  );
}
