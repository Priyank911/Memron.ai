'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { siCursor, siGooglegemini, siGithubcopilot } from 'simple-icons';

const supportedAgents = [
  { name: 'Claude', icon: '/icons/claude-ai.png', isImg: true },
  { name: 'Cursor', si: siCursor, color: '#38bdf8' },
  { name: 'ChatGPT', icon: '/icons/openai.svg', isImg: true },
  { name: 'VS Code', icon: '/icons/vscode.svg', isImg: true },
  { name: 'Windsurf', icon: '/icons/windsurf.png', isImg: true },
  { name: 'Cline', icon: '/icons/cline.svg', isImg: true },
  { name: 'Gemini', si: siGooglegemini, color: '#4285f4' },
  { name: 'Copilot', si: siGithubcopilot, color: '#22c55e' },
];

export function WorkflowMemoryShowcase() {
  const [activeTab, setActiveTab] = useState<'agents' | 'humans' | 'terminal'>('agents');
  const [copied, setCopied] = useState(false);

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText('https://api.memron.ai/mcp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="features" className="workflow-showcase-section">
      <div className="workflow-reference-container">
        {/* 2-Column Split: Left Interactive Agent Card / Right Content */}
        <div className="workflow-reference-grid">
          {/* Left Column: Interactive Agent Terminal Card */}
          <div className="workflow-agent-card">
            {/* Top Navigation Tabs */}
            <div className="agent-card-tabbar">
              <div className="tabbar-left-buttons">
                <button
                  type="button"
                  className={`tabbar-btn ${activeTab === 'agents' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('agents')}
                >
                  FOR AI AGENTS
                </button>
                <button
                  type="button"
                  className={`tabbar-btn ${activeTab === 'humans' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('humans')}
                >
                  FOR HUMANS
                </button>
                <button
                  type="button"
                  className={`tabbar-btn ${activeTab === 'terminal' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('terminal')}
                >
                  TERMINAL
                </button>
              </div>

              {/* Top-Right MCP Endpoint Pill */}
              <button
                type="button"
                className="tabbar-endpoint-pill"
                onClick={handleCopyEndpoint}
                title="Copy MCP server endpoint"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copied ? 'COPIED!' : 'MCP ENDPOINT'}</span>
              </button>
            </div>

            {/* Terminal Body Content */}
            <div className="agent-card-body">
              {activeTab === 'agents' && (
                <div className="agent-chat-view">
                  {/* Agent Header */}
                  <div className="agent-chat-header">
                    <div className="agent-identity">
                      <Image
                        src="/icons/claude-ai.png"
                        alt="Claude"
                        width={20}
                        height={20}
                        className="agent-avatar"
                      />
                      <span className="agent-name">Claude Code</span>
                    </div>
                    <div className="agent-connection-status">
                      <span className="live-status-dot" />
                      <span>MCP · memron connected</span>
                    </div>
                  </div>

                  {/* Real-world Example: User prompt */}
                  <div className="agent-msg-bubble user-prompt">
                    <div className="bubble-sender">DEVELOPER</div>
                    <p>How did we resolve the AuthProvider session race condition in last sprint&apos;s PKCE refactor?</p>
                  </div>

                  {/* Real MCP Memory Tool Call */}
                  <div className="agent-tool-call">
                    <span className="tool-call-bullet">●</span>
                    <span className="tool-call-fn">memron_search_context</span>
                    <span className="tool-call-args">{`{ "query": "AuthProvider session race condition PKCE", "scope": "decisions" }`}</span>
                  </div>

                  {/* Actual Context Recalled from Memron */}
                  <div className="agent-context-card">
                    <div className="context-card-header">
                      <span className="context-source-badge">RECALLED // SPRINT 14 (CURSOR SESSION)</span>
                      <span className="context-confidence">CONFIDENCE 99.4%</span>
                    </div>
                    <div className="context-data-payload">
                      <span className="payload-key">DECISION:</span>
                      <span className="payload-val">Wrap token refresh in BroadcastChannel mutex lock. Do not re-challenge PKCE verifier on concurrent browser tabs.</span>
                    </div>
                  </div>

                  {/* Claude's Response Utilizing Memory */}
                  <div className="agent-msg-bubble agent-reply">
                    <div className="bubble-sender">CLAUDE CODE</div>
                    <p>
                      Found the architectural consensus from Tuesday: We use a <code className="inline-code">BroadcastChannel</code> mutex in <code className="inline-code">AuthProvider.tsx</code> to synchronize token rotation across tabs without re-issuing PKCE verifiers. Applying that exact pattern now.
                    </p>
                  </div>

                  {/* Live Memory Resolution Tag */}
                  <div className="agent-memory-resolved">
                    <span className="resolved-check">✔</span>
                    <span>1,480 entities synced · Zero drift verified across Cursor & Claude</span>
                  </div>
                </div>
              )}

              {activeTab === 'humans' && (
                <div className="human-dashboard-view">
                  <div className="dashboard-meta-header">
                    <span className="dashboard-title">WORKSPACE KNOWLEDGE GRAPH // OVERVIEW</span>
                    <span className="dashboard-badge">LIVE SYNC</span>
                  </div>

                  <div className="dashboard-query-box">
                    <span className="query-prompt">› query:</span>
                    <span className="query-text">&quot;Why was PKCE chosen over state parameters for auth?&quot;</span>
                  </div>

                  <div className="dashboard-result-card">
                    <div className="result-header">
                      <span className="result-tag">DECISION RECORD #142</span>
                      <span className="result-time">Aug 18, 2026 · Cross-Agent Consensus</span>
                    </div>
                    <p className="result-desc">
                      PKCE mitigates interception attacks on authorization codes in distributed CLI & IDE workflows. Confirmed across Cursor and Claude Code PR sessions.
                    </p>
                    <div className="result-entities">
                      <span className="entity-chip">Auth Flow</span>
                      <span className="entity-chip">RFC 7636</span>
                      <span className="entity-chip">Zero-Drift Enforced</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'terminal' && (
                <div className="terminal-cli-view">
                  <div className="terminal-prompt-line">
                    <span className="term-prompt">$</span>
                    <span className="term-cmd">npx @memron/cli link --daemon</span>
                  </div>
                  <div className="terminal-log-output">
                    <p className="log-line info">› Contacting Memron Local Daemon on 127.0.0.1:4182...</p>
                    <p className="log-line success">✔ Connected to Sovereign Memory Core [PID 8912]</p>
                    <p className="log-line info">› Scanning MCP Tool Registrations...</p>
                    <p className="log-line success">✔ 41 callable tools bound to Claude, Cursor & Codex</p>
                    <p className="log-line info">› Memory Vault: AES-256-GCM [HARDWARE ISOLATED]</p>
                    <p className="log-line highlight">● Ready. Every agent session is now shared seamlessly.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Content & Integrations */}
          <div className="workflow-content-side">
            <div className="workflow-kicker">02 · ADAPTIVE WORKFLOW MEMORY</div>

            <h2 className="workflow-main-title">
              It starts inside the
              <br />
              agent you already use.
            </h2>

            <p className="workflow-main-desc">
              Connect once via MCP, authorize your workspace, and point your agent at any task.
              From there it stores decisions, recalls past bugs, and syncs context across independent sessions.
              Agents self-serve over MCP; humans use the dashboard or <code className="inline-code">npx @memron/cli</code>.
            </p>

            {/* "RUNS INSIDE YOUR AGENT" Section */}
            <div className="runs-inside-section">
              <span className="runs-inside-label">RUNS INSIDE YOUR AGENT</span>
              <div className="agents-grid">
                {supportedAgents.map((agent) => (
                  <div key={agent.name} className="agent-badge-item" title={agent.name}>
                    {agent.isImg ? (
                      <Image
                        src={agent.icon!}
                        alt={agent.name}
                        width={18}
                        height={18}
                        className="agent-badge-icon"
                      />
                    ) : agent.si ? (
                      <svg
                        role="img"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill={agent.color || 'currentColor'}
                        className="agent-badge-icon"
                      >
                        <path d={agent.si.path} />
                      </svg>
                    ) : null}
                    <span className="agent-badge-name">{agent.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Read Integration Guide Link */}
            <div className="workflow-guide-link-wrap">
              <Link href="/login" className="workflow-guide-link">
                <span>Read the integration guide</span>
                <span className="guide-arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
