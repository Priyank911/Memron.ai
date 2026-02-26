'use client';

import { Search, Plus, Upload, RefreshCw, Key, Settings } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  if (!open) return null;

  const commands = [
    { icon: Plus, label: 'Create new memory', shortcut: 'Ctrl N' },
    { icon: Search, label: 'Search memories', shortcut: 'Ctrl F' },
    { icon: Upload, label: 'Import from file', shortcut: 'Ctrl I' },
    { icon: RefreshCw, label: 'Sync all sources', shortcut: 'Ctrl S' },
    { icon: Key, label: 'Manage API keys', shortcut: '' },
    { icon: Settings, label: 'Open settings', shortcut: 'Ctrl ,' },
  ];

  return (
    <div className="db-cmd-overlay" onClick={onClose}>
      <div className="db-cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="db-cmd-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search memories, commands, settings…"
            className="db-cmd-input"
          />
          <kbd className="db-kbd">ESC</kbd>
        </div>
        <div className="db-cmd-list">
          {commands.map((c, i) => (
            <button key={i} className="db-cmd-item">
              <c.icon size={15} />
              <span className="db-cmd-item-label">{c.label}</span>
              {c.shortcut && <kbd className="db-kbd sm">{c.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
