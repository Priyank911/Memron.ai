'use client';

import { Search, Bell } from 'lucide-react';

interface TopbarProps {
  orgName: string;
  projectName: string;
  onCommandPalette: () => void;
}

export function Topbar({ orgName, projectName, onCommandPalette }: TopbarProps) {
  return (
    <header className="db-topbar">
      {/* Left — org / project selectors */}
      <div className="db-topbar-left">
        <div className="db-topbar-org">
          <span className="db-topbar-org-icon">⊞</span>
          <span className="db-topbar-org-name">{orgName}</span>
          <span className="db-topbar-org-badge">Organization</span>
        </div>

        <span className="db-topbar-divider" />

        <div className="db-topbar-project">
          <span className="db-topbar-project-icon">▢</span>
          <span className="db-topbar-project-name">{projectName}</span>
        </div>
      </div>

      {/* Right — promo + nav + avatar */}
      <div className="db-topbar-right">
        <button className="db-topbar-promo" onClick={onCommandPalette}>
          <Search size={13} />
          <span>Search…</span>
          <kbd>⌘K</kbd>
        </button>

        <nav className="db-topbar-nav">
          <button className="db-topbar-nav-link active">Dashboard</button>
          <button className="db-topbar-nav-link">Playground</button>
          <button className="db-topbar-nav-link">Docs</button>
        </nav>
      </div>
    </header>
  );
}
