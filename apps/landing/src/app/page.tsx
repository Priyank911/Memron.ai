import Image from 'next/image';
import { VideoCarousel } from '@/components/journey-carousel';
import { FlowchartCard } from '@/components/flowchart-card';
import { ArchitectureLayers } from '@/components/architecture-layers';

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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="100%" height="100%" style={{ maxWidth: '600px', margin: '0 auto', display: 'block' }}>
                <defs>
                  <style>{`
                    .ah-new-svg {
                      --bg-card: #151921;
                      --border-card: #272E38;
                      --text-primary: #F3F4F6;
                      --text-secondary: #8B949E;
                      --accent-red: #F87171;
                      --accent-cyan: #22D3EE;
                      --accent-blue: #60A5FA;
                      --accent-green: #34D399;
                      --wire-color: #3B82F6;
                    }
                    [data-theme="light"] .ah-new-svg {
                      --bg-card: #F9FAFB;
                      --border-card: #E5E7EB;
                      --text-primary: #111827;
                      --text-secondary: #4B5563;
                      --wire-color: #93C5FD;
                    }
                    .ah-title { fill: var(--text-primary); font-size: 16px; font-weight: 700; letter-spacing: -0.2px; font-family: system-ui, sans-serif; }
                    .ah-body-text { fill: var(--text-secondary); font-size: 13px; font-weight: 400; letter-spacing: 0.1px; font-family: system-ui, sans-serif; }
                    .ah-tag-text { font-size: 11px; font-weight: 600; letter-spacing: 0.2px; font-family: system-ui, sans-serif; }

                    .ah-core-aura {
                      animation: ah-breatheAura 5s ease-in-out infinite alternate;
                      transform-origin: center;
                    }
                    @keyframes ah-breatheAura {
                      0% { transform: scale(0.9); opacity: 0.7; }
                      100% { transform: scale(1.1); opacity: 1; }
                    }

                    .ah-ui-card {
                      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.3s ease;
                      transform-origin: center;
                      cursor: pointer;
                    }
                    .ah-ui-card:hover {
                      transform: translateY(-4px);
                      stroke: #4B5563;
                    }
                    [data-theme="light"] .ah-ui-card:hover { stroke: #9CA3AF; }

                    .ah-data-stream {
                      fill: none;
                      stroke: #FFFFFF;
                      strokeWidth: 2;
                      strokeLinecap: round;
                      strokeDasharray: 4 40;
                      animation: ah-flowStream 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    }
                    [data-theme="light"] .ah-data-stream { stroke: #3B82F6; }

                    .ah-data-stream-delay {
                      fill: none;
                      stroke: #FFFFFF;
                      strokeWidth: 2;
                      strokeLinecap: round;
                      strokeDasharray: 4 40;
                      animation: ah-flowStream 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite 1.25s;
                    }
                    [data-theme="light"] .ah-data-stream-delay { stroke: #3B82F6; }

                    @keyframes ah-flowStream {
                      0% { stroke-dashoffset: 84; opacity: 0; }
                      20% { opacity: 1; }
                      80% { opacity: 1; }
                      100% { stroke-dashoffset: 0; opacity: 0; }
                    }
                  `}</style>
                  <path id="ah-curve-left" d="M 460 300 C 460 360, 310 330, 310 390" pathLength="84" />
                  <path id="ah-curve-right" d="M 540 300 C 540 360, 690 330, 690 390" pathLength="84" />
                </defs>

                <g className="ah-new-svg">
                  {/* The Intense Central Glow */}
                  <circle cx="500" cy="280" r="350" fill="url(#ah-blue-glow)" className="ah-core-aura" />

                  {/* Static faded wires */}
                  <g fill="none" stroke="var(--wire-color)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
                    <use href="#ah-curve-left" />
                    <use href="#ah-curve-right" />
                  </g>

                  {/* Animated glowing data particles */}
                  <use href="#ah-curve-left" className="ah-data-stream" />
                  <use href="#ah-curve-right" className="ah-data-stream-delay" />

                  {/* TOP NODE */}
                  <g className="ah-ui-card" filter="url(#ah-soft-shadow)">
                    <rect x="310" y="110" width="380" height="180" rx="16" fill="var(--bg-card)" stroke="var(--border-card)" strokeWidth="1.5" />

                    <g transform="translate(309, 130)">
                      <text x="22" y="10" fill="var(--accent-red)" className="ah-tag-text">Automatic Pipeline</text>
                    </g>

                    <text x="330" y="165" className="ah-title">Anti-Hallucination Guard</text>
                    <text x="330" y="190" className="ah-body-text">
                      <tspan x="330" dy="0">Grounds every AI response in verified memory,</tspan>
                      <tspan x="330" dy="20">preventing fabricated answers and ensuring</tspan>
                      <tspan x="330" dy="20">strict factual consistency.</tspan>
                    </text>

                    <g transform="translate(330, 260)">
                      <path d="M 6 0 L 7.5 4.5 L 12 6 L 7.5 7.5 L 6 12 L 4.5 7.5 L 0 6 L 4.5 4.5 Z" fill="var(--accent-cyan)" />
                      <text x="18" y="9" fill="var(--accent-cyan)" className="ah-tag-text">Fact-Checking Pipeline</text>
                    </g>

                    <text x="670" y="269" fill="var(--text-secondary)" className="ah-tag-text" textAnchor="end">Active Mode</text>
                  </g>

                  {/* BOTTOM LEFT NODE */}
                  <g className="ah-ui-card" filter="url(#ah-soft-shadow)">
                    <rect x="150" y="390" width="320" height="150" rx="12" fill="var(--bg-card)" stroke="var(--border-card)" strokeWidth="1.5" />

                    <text x="170" y="425" className="ah-title" style={{ fontSize: '14px' }}>Source-verified responses</text>
                    <text x="170" y="450" className="ah-body-text">
                      <tspan x="170" dy="0">Cross-references all generated</tspan>
                      <tspan x="170" dy="20">claims directly against extracted</tspan>
                      <tspan x="170" dy="20">facts from the memory timeline.</tspan>
                    </text>

                    <text x="170" y="515" fill="var(--accent-blue)" className="ah-tag-text">Validation</text>

                    <g transform="translate(450, 505)">
                      <text x="5" y="10" fill="var(--accent-green)" className="ah-tag-text" textAnchor="end">Verified</text>
                    </g>
                  </g>

                  {/* BOTTOM RIGHT NODE */}
                  <g className="ah-ui-card" filter="url(#ah-soft-shadow)">
                    <rect x="530" y="390" width="320" height="150" rx="12" fill="var(--bg-card)" stroke="var(--border-card)" strokeWidth="1.5" />

                    <text x="550" y="425" className="ah-title" style={{ fontSize: '14px' }}>Confidence scoring per claim</text>
                    <text x="550" y="450" className="ah-body-text">
                      <tspan x="550" dy="0">Calculates deterministic precision</tspan>
                      <tspan x="550" dy="20">matches for each specific claim</tspan>
                      <tspan x="550" dy="20">before passing the final output.</tspan>
                    </text>

                    <text x="550" y="515" fill="var(--accent-blue)" className="ah-tag-text">Scoring</text>

                    <g transform="translate(830, 505)">
                      <text x="0" y="10" fill="var(--accent-green)" className="ah-tag-text" textAnchor="end">High Match</text>
                    </g>
                  </g>
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440" width="100%" height="100%" style={{ maxWidth: '520px', margin: '0 auto', display: 'block', overflow: 'visible' }}>
                <defs>
                  {/* Dot grid background pattern */}
                  <pattern id="mcp-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="1.5" cy="1.5" r="1" className="mcp3-grid-dot" />
                  </pattern>
                  {/* Blue gradient for Memron Engine */}
                  <linearGradient id="mcp3-blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60A5FA" />
                    <stop offset="100%" stopColor="#2563EB" />
                  </linearGradient>
                  {/* Soft shadow for nodes */}
                  <filter id="mcp3-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#000000" floodOpacity="0.08" />
                  </filter>
                  {/* Particle glow */}
                  <filter id="mcp3-pglow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  {/* Branch wires: left nodes → MCP center */}
                  <path id="mcp3-p1" d="M175 88 C 265 88, 265 216, 360 216" />
                  <path id="mcp3-p2" d="M175 178 C 265 178, 265 216, 360 216" />
                  <path id="mcp3-p3" d="M175 268 C 265 268, 265 216, 360 216" />
                  <path id="mcp3-p4" d="M175 358 C 265 358, 265 216, 360 216" />
                  {/* Main trunk: MCP → Memron Engine */}
                  <path id="mcp3-main" d="M418 216 L545 216" />
                  <style>{`
                    .mcp3-svg {
                      --mcp3-bg: transparent;
                      --mcp3-node-bg: rgba(255,255,255,0.04);
                      --mcp3-node-border: rgba(255,255,255,0.08);
                      --mcp3-wire: rgba(255,255,255,0.10);
                      --mcp3-text: rgba(255,255,255,0.8);
                      --mcp3-sub: rgba(255,255,255,0.38);
                      --mcp3-particle: #3B82F6;
                    }
                    [data-theme="light"] .mcp3-svg {
                      --mcp3-node-bg: #F3F4F6;
                      --mcp3-node-border: #E5E7EB;
                      --mcp3-wire: #D1D5DB;
                      --mcp3-text: #1F2937;
                      --mcp3-sub: #6B7280;
                      --mcp3-particle: #3B82F6;
                    }
                    .mcp3-grid-dot { fill: rgba(255,255,255,0.04); }
                    [data-theme="light"] .mcp3-grid-dot { fill: #E5E7EB; }
                    @keyframes mcp3GlowPulse {
                      0% { filter: drop-shadow(0 0 14px rgba(59,130,246,0.35)); }
                      100% { filter: drop-shadow(0 0 32px rgba(59,130,246,0.65)); }
                    }
                    .mcp3-engine-glow { animation: mcp3GlowPulse 4s ease-in-out infinite alternate; }
                  `}</style>
                </defs>

                <g className="mcp3-svg">
                  {/* Dot grid background */}
                  <rect width="100%" height="100%" fill="url(#mcp-dot-grid)" rx="12" />

                  {/* Title */}
                  <text x="360" y="34" textAnchor="middle" style={{ fontSize: '16px', fontWeight: 700, fill: 'var(--mcp3-text)', fontFamily: 'system-ui,sans-serif', letterSpacing: '-0.3px' }}>Native MCP Architecture</text>
                  <text x="360" y="54" textAnchor="middle" style={{ fontSize: '9.5px', fontWeight: 500, fill: 'var(--mcp3-sub)', fontFamily: 'system-ui,sans-serif' }}>Standardized memory context synced across distributed environments.</text>

                  {/* ── Static wires ── */}
                  <g fill="none" stroke="var(--mcp3-wire)" strokeWidth="1.5" strokeLinecap="round">
                    <use href="#mcp3-p1" />
                    <use href="#mcp3-p2" />
                    <use href="#mcp3-p3" />
                    <use href="#mcp3-p4" />
                    <use href="#mcp3-main" strokeWidth="2.5" />
                  </g>

                  {/* ── Animated data particles ── */}
                  <g fill="var(--mcp3-particle)" filter="url(#mcp3-pglow)">
                    <circle r="2">
                      <animateMotion dur="2.5s" repeatCount="indefinite" begin="0s"><mpath href="#mcp3-p1" /></animateMotion>
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="2.5s" repeatCount="indefinite" begin="0s" />
                    </circle>
                    <circle r="2">
                      <animateMotion dur="2.2s" repeatCount="indefinite" begin="0.8s"><mpath href="#mcp3-p2" /></animateMotion>
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="2.2s" repeatCount="indefinite" begin="0.8s" />
                    </circle>
                    <circle r="2">
                      <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.4s"><mpath href="#mcp3-p3" /></animateMotion>
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="2.8s" repeatCount="indefinite" begin="0.4s" />
                    </circle>
                    <circle r="2">
                      <animateMotion dur="2.6s" repeatCount="indefinite" begin="1.2s"><mpath href="#mcp3-p4" /></animateMotion>
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="2.6s" repeatCount="indefinite" begin="1.2s" />
                    </circle>
                    {/* Dense trunk particles */}
                    <circle r="3">
                      <animateMotion dur="1.2s" repeatCount="indefinite" begin="0s"><mpath href="#mcp3-main" /></animateMotion>
                    </circle>
                    <circle r="3">
                      <animateMotion dur="1.2s" repeatCount="indefinite" begin="0.4s"><mpath href="#mcp3-main" /></animateMotion>
                    </circle>
                    <circle r="3">
                      <animateMotion dur="1.2s" repeatCount="indefinite" begin="0.8s"><mpath href="#mcp3-main" /></animateMotion>
                    </circle>
                  </g>

                  {/* ── LEFT NODES ── */}

                  {/* Node 1: OpenAI (AI Models) */}
                  <text x="100" y="92" textAnchor="end" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-sub)', letterSpacing: '0.4px', fontFamily: 'system-ui,sans-serif' }}>OpenAI</text>
                  <g filter="url(#mcp3-shadow)">
                    <rect x="115" y="58" width="60" height="60" rx="15" fill="var(--mcp3-node-bg)" stroke="var(--mcp3-node-border)" strokeWidth="1" />
                    <image href="/icons/openai.svg" x="127" y="70" width="36" height="36" />
                  </g>

                  {/* Node 2: Cursor (Web / Apps) */}
                  <text x="100" y="182" textAnchor="end" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-sub)', letterSpacing: '0.4px', fontFamily: 'system-ui,sans-serif' }}>Cursor.ai</text>
                  <g filter="url(#mcp3-shadow)">
                    <rect x="115" y="148" width="60" height="60" rx="15" fill="var(--mcp3-node-bg)" stroke="var(--mcp3-node-border)" strokeWidth="1" />
                    <image href="/icons/cursor-ai.png" x="127" y="160" width="36" height="36" />
                  </g>

                  {/* Node 3: Cline (IDE / Tools) */}
                  <text x="100" y="272" textAnchor="end" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-sub)', letterSpacing: '0.4px', fontFamily: 'system-ui,sans-serif' }}>Claude.ai</text>
                  <g filter="url(#mcp3-shadow)">
                    <rect x="115" y="238" width="60" height="60" rx="15" fill="var(--mcp3-node-bg)" stroke="var(--mcp3-node-border)" strokeWidth="1" />
                    <image href="/icons/claude-ai.png" x="127" y="250" width="36" height="36" />
                  </g>

                  {/* Node 4: VS Code (Edge Nodes) */}
                  <text x="100" y="362" textAnchor="end" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-sub)', letterSpacing: '0.4px', fontFamily: 'system-ui,sans-serif' }}>Copilot</text>
                  <g filter="url(#mcp3-shadow)">
                    <rect x="115" y="328" width="60" height="60" rx="15" fill="var(--mcp3-node-bg)" stroke="var(--mcp3-node-border)" strokeWidth="1" />
                    <image href="/icons/github-copilot.png" x="127" y="340" width="36" height="36" />
                  </g>

                  {/* ── CENTER NODE: MCP Server ── */}
                  <g filter="url(#mcp3-shadow)">
                    <rect x="360" y="186" width="60" height="60" rx="15" fill="var(--mcp3-node-bg)" stroke="var(--mcp3-node-border)" strokeWidth="1" />
                    <image href="/icons/mcp.svg" x="372" y="198" width="36" height="36" />
                  </g>
                  <text x="390" y="270" textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-sub)', letterSpacing: '0.4px', fontFamily: 'system-ui,sans-serif' }}>MCP Server</text>

                  {/* ── RIGHT NODE: Memron Memory Engine ── */}
                  <g className="mcp3-engine-glow">
                    <rect x="545" y="156" width="120" height="120" rx="28" fill="url(#mcp3-blue-grad)" />
                    <image href="/logo_w.png" x="565" y="176" width="80" height="80" style={{ opacity: 0.95 }} />
                    {/* Glass shine overlay */}

                  </g>
                  <text x="605" y="304" textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--mcp3-text)', letterSpacing: '0.3px', fontFamily: 'system-ui,sans-serif' }}>Memron Memory Engine</text>
                </g>
              </svg>
            </div>
          </div >
        </div >
      </section >

      {/* Architecture Showcase Section */}
      <section id="architecture" className="features-section architecture-section-mobile" style={{ paddingTop: '5rem', paddingBottom: '3rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
          <ArchitectureLayers />
        </div>
      </section>

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
