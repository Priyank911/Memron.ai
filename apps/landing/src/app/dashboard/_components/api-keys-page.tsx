'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key, Plus, Copy, Eye, EyeOff, Trash2, Check, AlertTriangle,
  Shield, Clock, Terminal, RefreshCw, Zap, ExternalLink,
} from 'lucide-react';

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? '';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

interface NewKey {
  id: string;
  fullKey: string;
  prefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/keys', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: keyName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate key');

      setNewKey(data.key);
      setShowCreateForm(false);
      setKeyName('');
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke key');

      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      setConfirmRevoke(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const relativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  };

  // Generate the config snippet dynamically
  const mcpConfig = (apiKey?: string) => JSON.stringify({
    mcpServers: {
      memron: {
        type: 'http',
        url: MCP_URL,
        headers: {
          Authorization: `Bearer ${apiKey || 'YOUR_API_KEY'}`,
        },
      },
    },
  }, null, 2);

  return (
    <div className="db-content">
      {/* Header */}
      <div className="db-keys-header">
        <div>
          <h1 className="db-page-title">API Keys</h1>
          <p className="db-page-desc">Manage your Memron API keys for MCP server authentication.</p>
        </div>
        <button
          className="db-btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={keys.length >= 5 || showCreateForm}
          title={keys.length >= 5 ? 'Maximum 5 keys allowed' : 'Create a new API key'}
        >
          <Plus size={15} /> Create New Key
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="db-keys-error">
          <AlertTriangle size={14} /> {error}
          <button onClick={() => setError(null)} className="db-keys-error-close">×</button>
        </div>
      )}

      {/* New key banner — shown ONCE after generation */}
      {newKey && (
        <div className="db-keys-new-banner">
          <div className="db-keys-new-banner-header">
            <Shield size={16} />
            <span>New API key created — copy it now!</span>
          </div>
          <p className="db-keys-new-banner-warn">
            This is the only time you&apos;ll see the full key. Save it somewhere safe.
          </p>
          <div className="db-keys-new-banner-key">
            <code>{showKey ? newKey.fullKey : newKey.prefix + '•'.repeat(40)}</code>
            <div className="db-keys-new-banner-actions">
              <button onClick={() => setShowKey(!showKey)} className="db-btn-icon" title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => handleCopy(newKey.fullKey, 'newkey')} className="db-btn-icon" title="Copy key">
                {copied === 'newkey' ? <Check size={14} className="text-green" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Quick config with the new key */}
          <div className="db-keys-quick-config">
            <p className="db-keys-quick-config-label">
              <Terminal size={12} /> Quick setup — paste into your MCP config:
            </p>
            <div className="db-keys-code-block">
              <pre>{mcpConfig(newKey.fullKey)}</pre>
              <button
                className="db-btn-icon db-keys-code-copy"
                onClick={() => handleCopy(mcpConfig(newKey.fullKey), 'newconfig')}
                title="Copy config"
              >
                {copied === 'newconfig' ? <Check size={13} className="text-green" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <button className="db-btn-ghost db-keys-new-dismiss" onClick={() => setNewKey(null)}>
            I&apos;ve saved my key
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && !newKey && (
        <div className="db-keys-create-form">
          <h3>Create New API Key</h3>
          <div className="db-keys-create-field">
            <label>Key Name (optional)</label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. VS Code Copilot, Cursor, CI/CD"
              className="db-keys-input"
              maxLength={50}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate();
                if (e.key === 'Escape') { setShowCreateForm(false); setKeyName(''); }
              }}
            />
          </div>
          <div className="db-keys-create-scopes">
            <label>Permissions</label>
            <div className="db-keys-scope-list">
              <span className="db-keys-scope-badge"><Zap size={10} /> memory:read</span>
              <span className="db-keys-scope-badge"><Zap size={10} /> memory:write</span>
              <span className="db-keys-scope-badge"><Zap size={10} /> memory:delete</span>
            </div>
          </div>
          <div className="db-keys-create-actions">
            <button className="db-btn-ghost" onClick={() => { setShowCreateForm(false); setKeyName(''); }}>Cancel</button>
            <button className="db-btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <RefreshCw size={13} className="db-spin" /> Generating…
                </>
              ) : (
                <>
                  <Key size={13} /> Generate Key
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MCP Server Connection Info */}
      <div className="db-keys-mcp-info">
        <h3><Terminal size={14} /> MCP Server Connection</h3>
        <p>
          Add this to your MCP client configuration
          <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers" target="_blank" rel="noopener noreferrer" className="db-keys-link">
            VS Code <ExternalLink size={10} />
          </a>
          <a href="https://docs.cursor.com/context/model-context-protocol" target="_blank" rel="noopener noreferrer" className="db-keys-link">
            Cursor <ExternalLink size={10} />
          </a>
        </p>
        <div className="db-keys-code-block">
          <pre>{mcpConfig(keys[0]?.prefix ? keys[0].prefix + '...' : undefined)}</pre>
          <button
            className="db-btn-icon db-keys-code-copy"
            onClick={() => handleCopy(mcpConfig(), 'config')}
            title="Copy"
          >
            {copied === 'config' ? <Check size={13} className="text-green" /> : <Copy size={13} />}
          </button>
        </div>
        <p className="db-keys-mcp-hint">
          Replace <code>YOUR_API_KEY</code> with one of your active keys below.
        </p>
      </div>

      {/* Keys list */}
      <div className="db-keys-list">
        <div className="db-keys-list-header">
          <h3>Active Keys ({keys.length}/5)</h3>
          {keys.length > 0 && (
            <button className="db-btn-ghost-sm" onClick={() => fetchKeys()} title="Refresh">
              <RefreshCw size={12} /> Refresh
            </button>
          )}
        </div>

        {loading ? (
          <div className="db-keys-loading">
            <RefreshCw size={16} className="db-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="db-keys-empty">
            <Key size={36} />
            <p>No API keys yet</p>
            <span>Create your first API key to connect your MCP client.</span>
            <button className="db-btn-primary db-keys-empty-cta" onClick={() => setShowCreateForm(true)}>
              <Plus size={14} /> Create First Key
            </button>
          </div>
        ) : (
          <div className="db-keys-table">
            {keys.map((key) => (
              <div key={key.id} className="db-keys-row">
                <div className="db-keys-row-main">
                  <div className="db-keys-row-icon">
                    <Key size={15} />
                  </div>
                  <div className="db-keys-row-info">
                    <span className="db-keys-row-name">{key.name}</span>
                    <div className="db-keys-row-prefix-wrap">
                      <code className="db-keys-row-prefix">{key.prefix}••••••••</code>
                      <button
                        className="db-btn-icon-xs"
                        onClick={() => handleCopy(key.prefix, `prefix-${key.id}`)}
                        title="Copy key prefix"
                      >
                        {copied === `prefix-${key.id}` ? <Check size={10} /> : <Copy size={10} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="db-keys-row-meta">
                  <div className="db-keys-row-scopes">
                    {key.scopes.map((s) => (
                      <span key={s} className="db-keys-scope-badge-sm">{s}</span>
                    ))}
                  </div>
                  <span className="db-keys-row-date" title={key.createdAt}>
                    <Clock size={11} /> {formatDate(key.createdAt)}
                  </span>
                  <span className={`db-keys-row-used ${key.lastUsedAt ? 'active' : ''}`}>
                    Last used: {relativeTime(key.lastUsedAt)}
                  </span>
                </div>
                <div className="db-keys-row-actions">
                  {confirmRevoke === key.id ? (
                    <div className="db-keys-revoke-confirm">
                      <span>Are you sure?</span>
                      <button
                        className="db-btn-danger-sm"
                        onClick={() => handleRevoke(key.id)}
                        disabled={revoking === key.id}
                      >
                        {revoking === key.id ? 'Revoking…' : 'Yes, revoke'}
                      </button>
                      <button className="db-btn-ghost-sm" onClick={() => setConfirmRevoke(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="db-btn-ghost-sm db-btn-revoke"
                      onClick={() => setConfirmRevoke(key.id)}
                      title="Revoke key"
                    >
                      <Trash2 size={13} /> Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
