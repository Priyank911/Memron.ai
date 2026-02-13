import Image from 'next/image';
import { VideoCarousel } from '@/components/journey-carousel';
import { FlowchartCard } from '@/components/flowchart-card';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          {/* Left Content */}
          <div className="hero-content">
            <h1 className="hero-title">
              Give Your AI
              <br />
              <span className="hero-title-highlight">Persistent Memory</span>
            </h1>
            <p className="hero-description">
              Memron enables AI systems to retain and recall context across multiple conversations. 
              Build intelligent applications with persistent memory that learns from every interaction, 
              maintains user preferences, and delivers personalized experiences. Transform your AI from 
              stateless to context-aware with seamless memory integration.
            </p>
            <button className="hero-cta">
              Install Now
              <svg className="hero-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          {/* Right Content - Video Carousel */}
          <div className="hero-right">
            <VideoCarousel />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-header">
          <span className="features-badge">For AI Builders</span>
          <h2 className="features-title">
            One Integration
            <br />
            <span className="features-title-highlight">Infinite Context for Your Agents</span>
          </h2>
        </div>

        <div className="features-grid">
          {/* Feature 1 - Memory Sync */}
          <div className="feature-box">
            <div className="feature-box-content">
              <h3 className="feature-box-title">Cross-Platform Memory Sync</h3>
              <p className="feature-box-desc">
                Seamless memory transfer between AI agents across platforms, sharing context regardless of runtime.
              </p>
              <ul className="feature-box-list">
                <li><span className="feature-dot"></span>Multi-agent context sharing</li>
                <li><span className="feature-dot"></span>Real-time propagation</li>
                <li><span className="feature-dot"></span>Offline reconciliation</li>
              </ul>
            </div>
            <div className="feature-box-visual">
              <div className="visual-chat">
                <div className="chat-bubble chat-user">Sync context</div>
                <div className="chat-bubble chat-ai">Synced to Agent B</div>
                <div className="chat-time">Now</div>
                <div className="chat-bubble chat-ai">Remembers preferences</div>
              </div>
            </div>
          </div>

          {/* Feature 2 - Zero Trust */}
          <div className="feature-box">
            <div className="feature-box-content">
              <h3 className="feature-box-title">Hardware-Backed Zero Trust</h3>
              <p className="feature-box-desc">
                Every memory encrypted and verified with hardware security modules. No central authority.
              </p>
              <ul className="feature-box-list">
                <li><span className="feature-dot"></span>End-to-end encryption</li>
                <li><span className="feature-dot"></span>User-controlled keys</li>
                <li><span className="feature-dot"></span>Full audit trail</li>
              </ul>
            </div>
            <div className="feature-box-visual">
              <div className="visual-security">
                <div className="sec-block">
                  <span className="sec-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <span className="sec-label">AES-256</span>
                </div>
                <div className="sec-line"></div>
                <div className="sec-block sec-verified">
                  <span className="sec-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  <span className="sec-label">Verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 - MCP Protocol */}
          <div className="feature-box">
            <div className="feature-box-content">
              <h3 className="feature-box-title">Native MCP Integration</h3>
              <p className="feature-box-desc">
                Built on Model Context Protocol for universal compatibility with zero configuration.
              </p>
              <ul className="feature-box-list">
                <li><span className="feature-dot"></span>MCP-native architecture</li>
                <li><span className="feature-dot"></span>Standardized memory format</li>
                <li><span className="feature-dot"></span>Cross-LLM compatibility</li>
              </ul>
            </div>
            <div className="feature-box-visual">
              <div className="visual-protocol">
                <div className="protocol-node">
                  <span className="node-dot"></span>
                  <span className="node-label">Claude</span>
                </div>
                <div className="protocol-hub">
                  <span className="hub-text">MCP</span>
                </div>
                <div className="protocol-node">
                  <span className="node-dot"></span>
                  <span className="node-label">GPT</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Research Section */}
        <div className="research-section">
          <div className="research-content">
            <h3 className="research-title">Memory Compression Engine</h3>
            <p className="research-desc">
              Intelligently compresses conversation context into optimized memory representations, 
              reducing token overhead while preserving technical fidelity.
            </p>
            <ul className="research-list">
              <li>
                <span className="research-status active"></span>
                <span>Extracts code patterns and API preferences</span>
              </li>
              <li>
                <span className="research-status active"></span>
                <span>Compresses context by up to 80%</span>
              </li>
              <li>
                <span className="research-status active"></span>
                <span>Distributed storage across IPFS + Arweave</span>
              </li>
            </ul>
          </div>
          <div className="research-visual">
            <div className="memory-tracker">
              <div className="tracker-header">
                <span className="tracker-title">Memory Context Flow</span>
                <div className="sync-indicator">
                  <span className="sync-dot"></span>
                  <span className="sync-text">Syncing to Web3</span>
                </div>
              </div>
              <div className="memory-timeline">
                <div className="memory-item memory-item-1">
                  <div className="memory-meta">
                    <span className="memory-type">Code Pattern</span>
                    <span className="memory-time">2m ago</span>
                  </div>
                  <div className="memory-text typing-animation">Uses async/await over .then() chains</div>
                  <div className="memory-source">
                    <span className="source-label">Source:</span>
                    <span className="source-value">Code Review</span>
                  </div>
                  <div className="memory-confidence">
                    <span className="confidence-bar">
                      <span className="confidence-fill confidence-fill-1"></span>
                    </span>
                    <span className="confidence-text">95%</span>
                  </div>
                  <div className="storage-status">
                    <svg className="storage-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span className="storage-text">IPFS: bafk...x7q2</span>
                  </div>
                </div>
                <div className="memory-connector"></div>
                <div className="memory-item memory-item-2">
                  <div className="memory-meta">
                    <span className="memory-type">API Context</span>
                    <span className="memory-time">5m ago</span>
                  </div>
                  <div className="memory-text typing-animation">Prefers REST over GraphQL for simple CRUD</div>
                  <div className="memory-source">
                    <span className="source-label">Source:</span>
                    <span className="source-value">Architecture Doc</span>
                  </div>
                  <div className="memory-confidence">
                    <span className="confidence-bar">
                      <span className="confidence-fill confidence-fill-2"></span>
                    </span>
                    <span className="confidence-text">88%</span>
                  </div>
                  <div className="storage-status">
                    <svg className="storage-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span className="storage-text">Arweave: ar://mn8k</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Section - How It Works */}
      <section className="showcase-section">
        <FlowchartCard />
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-left">
            <div className="footer-logo">
              <img src="/logo_w.png" alt="Memron" className="footer-logo-icon" />
              <span className="footer-brand">Memron</span>
            </div>
            <p className="footer-tagline">Persistent memory for AI systems</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Docs</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Twitter</a>
            <a href="#" className="footer-link">Discord</a>
          </div>
          <div className="footer-right">
            <p className="footer-copy">© 2026 Memron. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
