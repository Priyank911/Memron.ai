import Image from 'next/image';
import { VideoCarousel } from '@/components/journey-carousel';
import { FlowchartCard } from '@/components/flowchart-card';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section id="hero" className="hero-section">
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
            <a href="/login" className="hero-cta">
              Get Early Access
              <svg className="hero-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Right Content - Video Carousel */}
          <div className="hero-right">
            <VideoCarousel />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="pricing" className="features-section">
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" style={{ maxWidth: '360px', margin: '0 auto' }}>
                <defs>
                  <style>{`
                    .chat-svg {
                      --bg-container: transparent;
                      --border-color: #2a2a35;
                      --user-bg: #1f2937;
                      --user-txt: #e5e7eb;
                      --agent-bg: #1e1e40;
                      --agent-txt: #a78bfa;
                      --time-txt: #6b7280;
                      --shadow-color: rgba(0, 0, 0, 0.2);
                    }
                    [data-theme="light"] .chat-svg {
                      --border-color: #e5e7eb;
                      --user-bg: #f3f4f6;
                      --user-txt: #374151;
                      --agent-bg: #eff6ff;
                      --agent-txt: #4f46e5;
                      --time-txt: #9ca3af;
                      --shadow-color: rgba(0, 0, 0, 0.03);
                    }
                    .chat-svg text {
                      font-family: system-ui, -apple-system, sans-serif;
                      font-size: 14px;
                      font-weight: 500;
                      text-anchor: middle;
                      dominant-baseline: middle;
                    }
                    .chat-svg .time-text { font-size: 12px; font-weight: 400; fill: var(--time-txt); }
                    .chat-svg .anim-bubble {
                      animation-duration: 8s;
                      animation-iteration-count: infinite;
                      animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
                      opacity: 0;
                    }
                    @keyframes chatUserMsg {
                      0%, 4% { opacity: 0; transform: translateY(12px); }
                      8%, 85% { opacity: 1; transform: translateY(0); }
                      90%, 100% { opacity: 0; transform: translateY(-12px); }
                    }
                    .chat-svg .user-msg { animation-name: chatUserMsg; }
                    @keyframes chatAgentMsg1 {
                      0%, 28% { opacity: 0; transform: translateY(12px); }
                      32%, 85% { opacity: 1; transform: translateY(0); }
                      90%, 100% { opacity: 0; transform: translateY(-12px); }
                    }
                    .chat-svg .agent-msg-1 { animation-name: chatAgentMsg1; }
                    @keyframes chatTimeFade {
                      0%, 40% { opacity: 0; }
                      44%, 85% { opacity: 1; }
                      90%, 100% { opacity: 0; }
                    }
                    .chat-svg .timestamp { animation-name: chatTimeFade; animation-timing-function: linear; }
                    @keyframes chatAgentMsg2 {
                      0%, 53% { opacity: 0; transform: translateY(12px); }
                      57%, 85% { opacity: 1; transform: translateY(0); }
                      90%, 100% { opacity: 0; transform: translateY(-12px); }
                    }
                    .chat-svg .agent-msg-2 { animation-name: chatAgentMsg2; }
                    .chat-svg .box-shadow { filter: drop-shadow(0px 2px 4px var(--shadow-color)); }
                  `}</style>
                </defs>
                <rect x="10" y="10" width="380" height="220" rx="16" fill="var(--bg-container)" stroke="var(--border-color)" strokeWidth="1.5" className="chat-svg" />
                <g className="chat-svg">
                  <g className="anim-bubble user-msg box-shadow" style={{ transformOrigin: '250px 30px' }}>
                    <rect x="250" y="30" width="120" height="40" rx="12" fill="var(--user-bg)" />
                    <text x="310" y="51" fill="var(--user-txt)">Sync context</text>
                  </g>
                  <g className="anim-bubble agent-msg-1 box-shadow" style={{ transformOrigin: '30px 85px' }}>
                    <rect x="30" y="85" width="150" height="40" rx="12" fill="var(--agent-bg)" />
                    <text x="105" y="106" fill="var(--agent-txt)">Synced to Agent B</text>
                  </g>
                  <g className="anim-bubble timestamp" style={{ transformOrigin: '200px 144px' }}>
                    <text x="200" y="144" className="time-text">Now</text>
                  </g>
                  <g className="anim-bubble agent-msg-2 box-shadow" style={{ transformOrigin: '30px 160px' }}>
                    <rect x="30" y="160" width="190" height="40" rx="12" fill="var(--agent-bg)" />
                    <text x="125" y="181" fill="var(--agent-txt)">Remembers preferences</text>
                  </g>
                </g>
              </svg>
            </div>
          </div>

          {/* Feature 2 - Anti-Hallucination */}
          <div className="feature-box">
            <div className="feature-box-content">
              <h3 className="feature-box-title">Anti-Hallucination Guard</h3>
              <p className="feature-box-desc">
                Grounds every AI response in verified memory, preventing fabricated answers and ensuring factual consistency.
              </p>
              <ul className="feature-box-list">
                <li><span className="feature-dot"></span>Source-verified responses</li>
                <li><span className="feature-dot"></span>Confidence scoring per claim</li>
                <li><span className="feature-dot"></span>Automatic fact-checking pipeline</li>
              </ul>
            </div>
            <div className="feature-box-visual">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" style={{ maxWidth: '360px', margin: '0 auto' }}>
                <defs>
                  <style>{`
                    .ah-svg {
                      --ah-bg: transparent;
                      --ah-surface: #1a1a2e;
                      --ah-border: #2a2a40;
                      --ah-green: #22c55e;
                      --ah-red: #ef4444;
                      --ah-purple: #a78bfa;
                      --ah-text: #e5e7eb;
                      --ah-muted: #6b7280;
                      --ah-check-bg: rgba(34, 197, 94, 0.1);
                      --ah-warn-bg: rgba(239, 68, 68, 0.1);
                    }
                    [data-theme="light"] .ah-svg {
                      --ah-surface: #f8f9fa;
                      --ah-border: #e5e7eb;
                      --ah-text: #374151;
                      --ah-muted: #9ca3af;
                      --ah-check-bg: rgba(34, 197, 94, 0.08);
                      --ah-warn-bg: rgba(239, 68, 68, 0.08);
                    }
                    .ah-svg text {
                      font-family: system-ui, -apple-system, sans-serif;
                      font-size: 11px;
                      font-weight: 500;
                    }
                    @keyframes ahCheckIn {
                      0%, 10% { opacity: 0; transform: scale(0.8); }
                      15%, 85% { opacity: 1; transform: scale(1); }
                      90%, 100% { opacity: 0; transform: scale(0.8); }
                    }
                    @keyframes ahStrike {
                      0%, 30% { opacity: 0; transform: scaleX(0); }
                      35%, 85% { opacity: 1; transform: scaleX(1); }
                      90%, 100% { opacity: 0; transform: scaleX(0); }
                    }
                    @keyframes ahPulse {
                      0%, 100% { opacity: 0.4; }
                      50% { opacity: 1; }
                    }
                    .ah-svg .ah-row-1 { animation: ahCheckIn 6s infinite ease-in-out; }
                    .ah-svg .ah-row-2 { animation: ahCheckIn 6s infinite ease-in-out 0.8s; }
                    .ah-svg .ah-row-3 { animation: ahCheckIn 6s infinite ease-in-out 1.6s; }
                    .ah-svg .ah-strike { transform-origin: left center; animation: ahStrike 6s infinite ease-in-out 1.6s; }
                    .ah-svg .ah-scan { animation: ahPulse 2s infinite ease-in-out; }
                  `}</style>
                </defs>
                <g className="ah-svg">
                  {/* Container */}
                  <rect x="20" y="15" width="360" height="210" rx="12" fill="var(--ah-surface)" stroke="var(--ah-border)" strokeWidth="1" />

                  {/* Header */}
                  <text x="40" y="42" fill="var(--ah-purple)" fontSize="10" fontWeight="700" letterSpacing="1.5">VERIFICATION ENGINE</text>
                  <rect x="40" y="48" width="30" height="3" rx="1.5" fill="var(--ah-purple)" />

                  {/* Scanning line */}
                  <rect x="20" y="55" width="360" height="2" fill="var(--ah-purple)" opacity="0.15" className="ah-scan" />

                  {/* Row 1 - Verified */}
                  <g className="ah-row-1" style={{ transformOrigin: '200px 85px' }}>
                    <rect x="40" y="68" width="320" height="34" rx="8" fill="var(--ah-check-bg)" />
                    <circle cx="60" cy="85" r="8" fill="none" stroke="var(--ah-green)" strokeWidth="1.5" />
                    <path d="M56 85 l3 3 l6 -6" fill="none" stroke="var(--ah-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="78" y="83" fill="var(--ah-text)" fontSize="11" fontWeight="600">Uses async/await pattern</text>
                    <text x="78" y="95" fill="var(--ah-muted)" fontSize="9">Verified — Source: conversation #42</text>
                    <text x="340" y="88" fill="var(--ah-green)" fontSize="10" fontWeight="700" textAnchor="end">98%</text>
                  </g>

                  {/* Row 2 - Verified */}
                  <g className="ah-row-2" style={{ transformOrigin: '200px 125px' }}>
                    <rect x="40" y="108" width="320" height="34" rx="8" fill="var(--ah-check-bg)" />
                    <circle cx="60" cy="125" r="8" fill="none" stroke="var(--ah-green)" strokeWidth="1.5" />
                    <path d="M56 125 l3 3 l6 -6" fill="none" stroke="var(--ah-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="78" y="123" fill="var(--ah-text)" fontSize="11" fontWeight="600">Prefers TypeScript strict mode</text>
                    <text x="78" y="135" fill="var(--ah-muted)" fontSize="9">Verified — Source: preference log</text>
                    <text x="340" y="128" fill="var(--ah-green)" fontSize="10" fontWeight="700" textAnchor="end">95%</text>
                  </g>

                  {/* Row 3 - Rejected (hallucination caught) */}
                  <g className="ah-row-3" style={{ transformOrigin: '200px 165px' }}>
                    <rect x="40" y="148" width="320" height="34" rx="8" fill="var(--ah-warn-bg)" />
                    <circle cx="60" cy="165" r="8" fill="none" stroke="var(--ah-red)" strokeWidth="1.5" />
                    <line x1="55" y1="160" x2="65" y2="170" stroke="var(--ah-red)" strokeWidth="2" strokeLinecap="round" />
                    <line x1="65" y1="160" x2="55" y2="170" stroke="var(--ah-red)" strokeWidth="2" strokeLinecap="round" />
                    <text x="78" y="163" fill="var(--ah-text)" fontSize="11" fontWeight="600" opacity="0.5">Uses Redux for state mgmt</text>
                    {/* <line x1="78" y1="162" x2="230" y2="162" stroke="var(--ah-red)" strokeWidth="1" className="ah-strike" /> */}
                    <text x="78" y="175" fill="var(--ah-red)" fontSize="9" fontWeight="600">Rejected — No matching memory</text>
                    <text x="340" y="168" fill="var(--ah-red)" fontSize="10" fontWeight="700" textAnchor="end">12%</text>
                  </g>

                  {/* Bottom status */}
                  <rect x="40" y="192" width="140" height="22" rx="6" fill="var(--ah-check-bg)" />
                  <circle cx="53" cy="203" r="4" fill="var(--ah-green)" />
                  <text x="62" y="207" fill="var(--ah-green)" fontSize="10" fontWeight="600">2 verified · 1 blocked</text>
                </g>
              </svg>
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%" height="100%" style={{ maxWidth: '360px', margin: '0 auto' }}>
                <defs>
                  <style>{`
                    .mcp-svg {
                      --mcp-surface: #1a1a2e;
                      --mcp-border: #2a2a40;
                      --mcp-fg: #e5e7eb;
                      --mcp-muted: #6b7280;
                      --mcp-line: #3f3f5e;
                      --mcp-accent: #a78bfa;
                    }
                    [data-theme="light"] .mcp-svg {
                      --mcp-surface: #f8f9fa;
                      --mcp-border: #e5e7eb;
                      --mcp-fg: #374151;
                      --mcp-muted: #9ca3af;
                      --mcp-line: #d1d5db;
                      --mcp-accent: #8b5cf6;
                    }
                    .mcp-svg text {
                      font-family: system-ui, sans-serif;
                      font-size: 11px;
                      font-weight: 600;
                      fill: var(--mcp-fg);
                    }
                    .mcp-svg .mcp-label {
                      font-size: 9px;
                      font-weight: 700;
                      fill: var(--mcp-muted);
                      letter-spacing: 1px;
                      text-transform: uppercase;
                    }
                    @keyframes mcpFlow { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
                    .mcp-svg .mcp-flow { stroke-dasharray: 6 6; animation: mcpFlow 1s linear infinite; }
                    @keyframes mcpPulse1 { 0%, 15% { transform: scale(1); } 20% { transform: scale(1.08); } 25%, 100% { transform: scale(1); } }
                    @keyframes mcpPulse2 { 0%, 45% { transform: scale(1); } 50% { transform: scale(1.08); } 55%, 100% { transform: scale(1); } }
                    @keyframes mcpPulse3 { 0%, 75% { transform: scale(1); } 80% { transform: scale(1.08); } 85%, 100% { transform: scale(1); } }
                    .mcp-svg .mcp-n1 { transform-origin: 60px 100px; animation: mcpPulse1 4s infinite linear; }
                    .mcp-svg .mcp-n2 { transform-origin: 200px 100px; animation: mcpPulse2 4s infinite linear; }
                    .mcp-svg .mcp-n3 { transform-origin: 340px 100px; animation: mcpPulse3 4s infinite linear; }
                  `}</style>
                </defs>
                <g className="mcp-svg">
                  <line x1="110" y1="100" x2="150" y2="100" stroke="var(--mcp-line)" strokeWidth="2" className="mcp-flow" />
                  <line x1="250" y1="100" x2="290" y2="100" stroke="var(--mcp-line)" strokeWidth="2" className="mcp-flow" />

                  {/* Agent A */}
                  <g className="mcp-n1">
                    <rect x="20" y="75" width="80" height="50" rx="12" fill="var(--mcp-surface)" stroke="var(--mcp-border)" strokeWidth="1.5" />
                    <circle cx="38" cy="100" r="4" fill="#22c55e" />
                    <text x="68" y="104" textAnchor="middle">Agent A</text>
                  </g>

                  {/* MCP Hub */}
                  <g className="mcp-n2">
                    <polygon points="200,60 250,100 200,140 150,100" fill="var(--mcp-surface)" stroke="var(--mcp-accent)" strokeWidth="2" />
                    <text x="200" y="104" textAnchor="middle" fill="var(--mcp-accent)">MCP</text>
                  </g>
                  <text x="200" y="160" textAnchor="middle" className="mcp-label">Protocol</text>

                  {/* Agent B */}
                  <g className="mcp-n3">
                    <rect x="300" y="75" width="80" height="50" rx="12" fill="var(--mcp-surface)" stroke="var(--mcp-border)" strokeWidth="1.5" />
                    <circle cx="318" cy="100" r="4" fill="#3b82f6" />
                    <text x="348" y="104" textAnchor="middle">Agent B</text>
                  </g>
                </g>
              </svg>
            </div>
          </div >
        </div >
      </section >

      {/* Research Section - Compact: text left, SVG right */}
      < section id="blog" className="research-section-compact" >
        <div className="research-compact-inner">
          <div className="research-compact-text">
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
                <span>Redundant cloud storage</span>
              </li>
            </ul>
          </div>
          <div className="research-compact-visual">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 375" className="compression-pipeline-svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <defs>
                <filter id="cpp-card-shadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="var(--cpp-shadow-color)" floodOpacity="var(--cpp-shadow-op)" />
                </filter>
                <filter id="cpp-panel-shadow" x="-5%" y="-5%" width="110%" height="110%">
                  <feDropShadow dx="0" dy="16" stdDeviation="24" floodColor="var(--cpp-shadow-color)" floodOpacity="var(--cpp-shadow-op-heavy)" />
                </filter>
                <linearGradient id="cpp-flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--cpp-accent-blue)" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="var(--cpp-accent-purple)" />
                  <stop offset="100%" stopColor="var(--cpp-accent-green)" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="cpp-scan-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--cpp-accent-purple)" stopOpacity="0" />
                  <stop offset="50%" stopColor="var(--cpp-accent-purple)" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="var(--cpp-accent-purple)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <style>{`
                .compression-pipeline-svg {
                  --cpp-panel-bg: rgba(15, 15, 20, 0.6);
                  --cpp-panel-border: #2a2a35;
                  --cpp-card-bg: #181820;
                  --cpp-card-border: #242430;
                  --cpp-text-main: #f8fafc;
                  --cpp-text-muted: #94a3b8;
                  --cpp-text-mono: #cbd5e1;
                  --cpp-accent-purple: #a78bfa;
                  --cpp-accent-purple-light: rgba(167, 139, 250, 0.15);
                  --cpp-accent-green: #34d399;
                  --cpp-pill-bg: rgba(52, 211, 153, 0.15);
                  --cpp-accent-blue: #60a5fa;
                  --cpp-bar-bg: #334155;
                  --cpp-shadow-color: #000;
                  --cpp-shadow-op: 0.3;
                  --cpp-shadow-op-heavy: 0.6;
                  --cpp-font-sans: system-ui, sans-serif;
                  --cpp-font-mono: ui-monospace, monospace;
                }
                [data-theme="light"] .compression-pipeline-svg {
                  --cpp-panel-bg: rgba(255, 255, 255, 0.6);
                  --cpp-panel-border: #e5e7eb;
                  --cpp-card-bg: #ffffff;
                  --cpp-card-border: #f1f5f9;
                  --cpp-text-main: #0f172a;
                  --cpp-text-muted: #64748b;
                  --cpp-text-mono: #475569;
                  --cpp-accent-purple: #8b5cf6;
                  --cpp-accent-purple-light: rgba(139, 92, 246, 0.1);
                  --cpp-accent-green: #10b981;
                  --cpp-pill-bg: rgba(16, 185, 129, 0.1);
                  --cpp-accent-blue: #3b82f6;
                  --cpp-bar-bg: #e2e8f0;
                  --cpp-shadow-color: #000;
                  --cpp-shadow-op: 0.04;
                  --cpp-shadow-op-heavy: 0.08;
                }
                .compression-pipeline-svg text { font-family: var(--cpp-font-sans); }
                .compression-pipeline-svg .cpp-header-title { font-size: 16px; font-weight: 800; fill: var(--cpp-text-main); letter-spacing: 2px; }
                .compression-pipeline-svg .cpp-step-title { font-size: 13px; font-weight: 700; fill: var(--cpp-text-muted); letter-spacing: 1.5px; text-transform: uppercase; }
                .compression-pipeline-svg .cpp-card-label { font-size: 11px; font-weight: 700; fill: var(--cpp-accent-purple); letter-spacing: 0.5px; }
                .compression-pipeline-svg .cpp-card-time { font-size: 11px; font-weight: 500; fill: var(--cpp-text-muted); }
                .compression-pipeline-svg .cpp-card-title { font-size: 15px; font-weight: 600; fill: var(--cpp-text-main); }
                .compression-pipeline-svg .cpp-source-label { font-size: 12px; font-weight: 500; fill: var(--cpp-text-muted); }
                .compression-pipeline-svg .cpp-source-value { font-size: 11px; font-family: var(--cpp-font-mono); fill: var(--cpp-text-mono); font-weight: 500; }
                .compression-pipeline-svg .cpp-pill-text { font-size: 12px; font-family: var(--cpp-font-mono); font-weight: 600; fill: var(--cpp-accent-green); }
                .compression-pipeline-svg .cpp-token-text { font-size: 12px; font-weight: 700; font-family: var(--cpp-font-mono); }
                .compression-pipeline-svg .cpp-token-high { fill: var(--cpp-accent-blue); }
                .compression-pipeline-svg .cpp-token-low { fill: var(--cpp-accent-green); }
                @keyframes cppFlowLine { 0% { stroke-dashoffset: 20; } 100% { stroke-dashoffset: 0; } }
                .compression-pipeline-svg .cpp-flow-line { stroke-dasharray: 6 6; animation: cppFlowLine 0.8s linear infinite; }
                @keyframes cppFadeInSlide { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
                .compression-pipeline-svg .cpp-step-1 { opacity: 0; animation: cppFadeInSlide 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards; }
                .compression-pipeline-svg .cpp-step-2 { opacity: 0; animation: cppFadeInSlide 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.2s forwards; }
                .compression-pipeline-svg .cpp-step-3 { opacity: 0; animation: cppFadeInSlide 0.8s cubic-bezier(0.16, 1, 0.3, 1) 2.5s forwards; }
                @keyframes cppScan { 0% { transform: translateY(0); } 50% { transform: translateY(140px); } 100% { transform: translateY(0); } }
                .compression-pipeline-svg .cpp-scanner { animation: cppScan 2.5s ease-in-out infinite; }
                @keyframes cppPulseRing { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(1.3); opacity: 0; } }
                .compression-pipeline-svg .cpp-engine-pulse { transform-origin: center; animation: cppPulseRing 2s infinite cubic-bezier(0.2, 0, 0.2, 1); }
                @keyframes cppCompressBar { 0% { width: 0; } 100% { width: 220px; } }
                .compression-pipeline-svg .cpp-bar-fill { width: 0; animation: cppCompressBar 1s cubic-bezier(0.16, 1, 0.3, 1) 3s forwards; }
                @keyframes cppPopIn { 0% { opacity: 0; transform: scale(0.9); } 70% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
                .compression-pipeline-svg .cpp-pill { opacity: 0; transform-origin: center; animation: cppPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 3.8s forwards; }
                @keyframes cppFloatUp { 0% { opacity: 0; transform: translateY(20px) scale(0.9); } 20% { opacity: 1; transform: translateY(0) scale(1); } 80% { opacity: 1; transform: translateY(-30px) scale(1); } 100% { opacity: 0; transform: translateY(-50px) scale(0.9); } }
                .compression-pipeline-svg .cpp-float-1 { animation: cppFloatUp 3s infinite linear 1.5s; opacity: 0; }
                .compression-pipeline-svg .cpp-float-2 { animation: cppFloatUp 3s infinite linear 2.5s; opacity: 0; }
              `}</style>
              <g transform="scale(0.75)">
                <rect x="10" y="10" width="980" height="480" rx="16" fill="var(--cpp-panel-bg)" stroke="var(--cpp-panel-border)" strokeWidth="1.5" filter="url(#cpp-panel-shadow)" />
                <g transform="translate(40, 50)">
                  <text x="0" y="0" className="cpp-header-title">MEMORY COMPRESSION PIPELINE</text>
                  <rect x="0" y="15" width="40" height="4" rx="2" fill="var(--cpp-accent-purple)" />
                </g>
                <path d="M 320 250 L 360 250" fill="none" stroke="var(--cpp-accent-blue)" strokeWidth="3" className="cpp-flow-line" />
                <path d="M 640 250 L 680 250" fill="none" stroke="var(--cpp-accent-purple)" strokeWidth="3" className="cpp-flow-line" />
                <path d="M 320 250 L 680 250" fill="none" stroke="url(#cpp-flow-gradient)" strokeWidth="2" opacity="0.3" />
                <g transform="translate(40, 100)">
                  <g className="cpp-step-1">
                    <text x="0" y="0" className="cpp-step-title">1. Raw Ingestion</text>
                    <text x="280" y="0" className="cpp-token-text cpp-token-high" textAnchor="end">2,048 Tokens</text>
                    <rect x="0" y="20" width="280" height="300" rx="12" fill="var(--cpp-card-bg)" stroke="var(--cpp-card-border)" strokeWidth="1.5" filter="url(#cpp-card-shadow)" />
                    <g transform="translate(20, 40)" opacity="0.7">
                      <rect x="0" y="0" width="140" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.4" />
                      <rect x="0" y="16" width="200" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                      <rect x="0" y="32" width="180" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                      <rect x="0" y="60" width="80" height="8" rx="4" fill="var(--cpp-accent-blue)" opacity="0.6" />
                      <rect x="20" y="76" width="220" height="8" rx="4" fill="var(--cpp-text-main)" opacity="0.8" />
                      <rect x="20" y="92" width="190" height="8" rx="4" fill="var(--cpp-text-main)" opacity="0.5" />
                      <rect x="20" y="108" width="210" height="8" rx="4" fill="var(--cpp-text-main)" opacity="0.5" />
                      <rect x="0" y="136" width="120" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.3" />
                      <rect x="20" y="152" width="180" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                      <rect x="20" y="168" width="160" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                      <rect x="20" y="184" width="200" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                      <rect x="0" y="212" width="100" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.4" />
                      <rect x="0" y="228" width="240" height="8" rx="4" fill="var(--cpp-text-muted)" opacity="0.2" />
                    </g>
                    <text x="140" y="345" className="cpp-source-label" textAnchor="middle">Unstructured API Logs &amp; Chat</text>
                  </g>
                </g>
                <g transform="translate(360, 100)">
                  <g className="cpp-step-2">
                    <text x="140" y="0" className="cpp-step-title" textAnchor="middle">2. Memron Engine</text>
                    <rect x="0" y="20" width="280" height="300" rx="12" fill="var(--cpp-panel-bg)" stroke="var(--cpp-accent-purple)" strokeWidth="2" strokeDasharray="8 4" filter="url(#cpp-card-shadow)" />
                    <g transform="translate(140, 250)">
                      <g className="cpp-float-1">
                        <rect x="-70" y="-15" width="140" height="30" rx="8" fill="var(--cpp-card-bg)" stroke="var(--cpp-card-border)" strokeWidth="1.5" filter="url(#cpp-card-shadow)" />
                        <text x="0" y="4" className="cpp-card-label" textAnchor="middle">Extracting Patterns...</text>
                      </g>
                      <g className="cpp-float-2">
                        <rect x="-75" y="-15" width="150" height="30" rx="8" fill="var(--cpp-card-bg)" stroke="var(--cpp-card-border)" strokeWidth="1.5" filter="url(#cpp-card-shadow)" />
                        <text x="0" y="4" className="cpp-card-label" textAnchor="middle" fill="var(--cpp-text-main)">Removing Redundancy</text>
                      </g>
                    </g>
                    <g transform="translate(140, 150)">
                      <circle cx="0" cy="0" r="40" fill="none" stroke="var(--cpp-accent-purple)" strokeWidth="2" className="cpp-engine-pulse" />
                      <circle cx="0" cy="0" r="55" fill="none" stroke="var(--cpp-accent-purple-light)" strokeWidth="4" className="cpp-engine-pulse" style={{ animationDelay: '1s' }} />
                      <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" fill="var(--cpp-accent-purple)" />
                      <polygon points="0,-15 13,-7.5 13,7.5 0,15 -13,7.5 -13,-7.5" fill="var(--cpp-panel-bg)" opacity="0.5" />
                    </g>
                    <rect x="10" y="30" width="260" height="60" fill="url(#cpp-scan-grad)" className="cpp-scanner" />
                    <line x1="10" y1="60" x2="270" y2="60" stroke="var(--cpp-accent-purple)" strokeWidth="2" className="cpp-scanner" />
                    <text x="140" y="345" className="cpp-source-label" textAnchor="middle" fill="var(--cpp-accent-purple)">Context compressed by 80%</text>
                  </g>
                </g>
                <g transform="translate(680, 100)">
                  <g className="cpp-step-3">
                    <text x="0" y="0" className="cpp-step-title">3. Grounded Memory</text>
                    <text x="280" y="0" className="cpp-token-text cpp-token-low" textAnchor="end">410 Tokens</text>
                    <rect x="0" y="20" width="280" height="300" rx="12" fill="var(--cpp-card-bg)" stroke="var(--cpp-card-border)" strokeWidth="1.5" filter="url(#cpp-card-shadow)" />
                    <rect x="0" y="20" width="4" height="300" rx="2" fill="var(--cpp-accent-green)" />
                    <g transform="translate(20, 45)">
                      <text x="0" y="0" className="cpp-card-label">CODE PATTERN</text>
                      <text x="240" y="0" className="cpp-card-time" textAnchor="end">Just now</text>
                      <text x="0" y="35" className="cpp-card-title">Uses async/await</text>
                      <text x="0" y="55" className="cpp-card-title">over .then() chains</text>
                      <text x="0" y="90" className="cpp-source-label">Source:</text>
                      <text x="55" y="90" className="cpp-source-value">Ingestion Pipeline</text>
                      <g transform="translate(0, 125)">
                        <text x="0" y="0" className="cpp-source-label">Compression Ratio:</text>
                        <text x="240" y="0" className="cpp-token-text" textAnchor="end" fill="var(--cpp-accent-purple)">-80%</text>
                        <rect x="0" y="15" width="240" height="6" rx="3" fill="var(--cpp-bar-bg)" />
                        <rect x="0" y="15" height="6" rx="3" fill="var(--cpp-accent-purple)" className="cpp-bar-fill" />
                      </g>
                      <g transform="translate(0, 180)">
                        <g className="cpp-pill">
                          <rect x="0" y="0" width="240" height="32" rx="8" fill="var(--cpp-pill-bg)" />
                          <circle cx="16" cy="16" r="9" fill="none" stroke="var(--cpp-accent-green)" strokeWidth="1.5" />
                          <path d="M11 16 l3 3 l6 -6" fill="none" stroke="var(--cpp-accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <text x="35" y="20" className="cpp-pill-text">Hash: bafk...x7q2</text>
                        </g>
                      </g>
                      <g transform="translate(0, 220)">
                        <g className="cpp-pill" style={{ animationDelay: '4.1s' }}>
                          <rect x="0" y="0" width="240" height="32" rx="8" fill="var(--cpp-pill-bg)" />
                          <circle cx="16" cy="16" r="9" fill="none" stroke="var(--cpp-accent-green)" strokeWidth="1.5" />
                          <path d="M 12 16 L 16 12 L 20 16 M 16 12 L 16 20" fill="none" stroke="var(--cpp-accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <text x="35" y="20" className="cpp-pill-text">Redundant Cloud Stored</text>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </svg>
          </div>
        </div>
      </section >

      {/* Showcase Section - How It Works */}
      < section id="team" className="showcase-section" >
        <FlowchartCard />
      </section >

      {/* Footer */}
      < footer className="site-footer" >
        <div className="footer-container">
          <div className="footer-left">
            <div className="footer-logo">
              <img src="/logo_w.png" alt="Memron" className="footer-logo-icon" />
              <span className="footer-brand">Memron</span>
            </div>
            <p className="footer-tagline">Persistent memory for AI systems</p>
          </div>
          <div className="footer-links">
            <a href="https://github.com/memron-ai" target="_blank" rel="noopener noreferrer" className="footer-link">Docs</a>
            <a href="https://github.com/memron-ai" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
            <a href="https://x.com/memron_ai" target="_blank" rel="noopener noreferrer" className="footer-link">Twitter</a>
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
