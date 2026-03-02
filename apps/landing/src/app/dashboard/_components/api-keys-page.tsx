'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Copy, Eye, EyeOff, Trash2, Check, AlertTriangle, Shield, Clock } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <div className="db-keys-page">
      {/* Header */}
      <div className="db-keys-header">
        <div>
          <h1 className="db-page-title">API Keys</h1>
          <p className="db-page-desc">Manage your Memron API keys for MCP server authentication.</p>
        </div>
        <button
          className="db-btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={keys.length >= 5}
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
          <p className="db-keys-new-banner-warn">This is the only time you&apos;ll see the full key. Save it somewhere safe.</p>
          <div className="db-keys-new-banner-key">
            <code>{showKey ? newKey.fullKey : newKey.prefix + '•'.repeat(40)}</code>
            <div className="db-keys-new-banner-actions">
              <button onClick={() => setShowKey(!showKey)} className="db-btn-icon" title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => handleCopy(newKey.fullKey)} className="db-btn-icon" title="Copy">
                {copied ? <Check size={14} /> : <Copy size={14} />}
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
            />
          </div>
          <div className="db-keys-create-scopes">
            <label>Permissions</label>
            <div className="db-keys-scope-list">
              <span className="db-keys-scope-badge">memory:read</span>
              <span className="db-keys-scope-badge">memory:write</span>
              <span className="db-keys-scope-badge">memory:delete</span>
            </div>
          </div>
          <div className="db-keys-create-actions">
            <button className="db-btn-ghost" onClick={() => { setShowCreateForm(false); setKeyName(''); }}>Cancel</button>
            <button className="db-btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </div>
      )}

      {/* MCP Server Connection Info */}
      <div className="db-keys-mcp-info">
        <h3><Key size={14} /> MCP Server Connection</h3>
        <p>Add this to your MCP client configuration (VS Code, Cursor, etc.):</p>
        <div className="db-keys-code-block">
          <pre>{`{
  "mcpServers": {
    "memron": {
      "type": "http",
      "url": "https://memron-mcp-production-d85b.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}</pre>
          <button
            className="db-btn-icon db-keys-code-copy"
            onClick={() => handleCopy(`{
  "mcpServers": {
    "memron": {
      "type": "http",
      "url": "https://memron-mcp-production-d85b.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`)}
            title="Copy"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Keys list */}
      <div className="db-keys-list">
        <div className="db-keys-list-header">
          <h3>Active Keys ({keys.length}/5)</h3>
        </div>

        {loading ? (
          <div className="db-keys-loading">Loading keys...</div>
        ) : keys.length === 0 ? (
          <div className="db-keys-empty">
            <Key size={32} />
            <p>No API keys yet</p>
            <span>Create your first API key to connect your MCP client.</span>
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
                    <code className="db-keys-row-prefix">{key.prefix}••••••••</code>
                  </div>
                </div>
                <div className="db-keys-row-meta">
                  <div className="db-keys-row-scopes">
                    {key.scopes.slice(0, 2).map((s) => (
                      <span key={s} className="db-keys-scope-badge-sm">{s}</span>
                    ))}
                    {key.scopes.length > 2 && <span className="db-keys-scope-badge-sm">+{key.scopes.length - 2}</span>}
                  </div>
                  <span className="db-keys-row-date" title={key.createdAt}>
                    <Clock size={11} /> Created {formatDate(key.createdAt)}
                  </span>
                  <span className="db-keys-row-used">
                    Last used: {relativeTime(key.lastUsedAt)}
                  </span>
                </div>
                <div className="db-keys-row-actions">
                  {confirmRevoke === key.id ? (
                    <>
                      <button
                        className="db-btn-danger-sm"
                        onClick={() => handleRevoke(key.id)}
                        disabled={revoking === key.id}
                      >
                        {revoking === key.id ? 'Revoking...' : 'Confirm Revoke'}
                      </button>
                      <button className="db-btn-ghost-sm" onClick={() => setConfirmRevoke(null)}>Cancel</button>
                    </>
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
