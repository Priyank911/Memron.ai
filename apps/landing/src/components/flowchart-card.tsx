'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

export function FlowchartCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const flowchartRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const currentValues = useRef({ scale: 0.88, borderRadius: 28, margin: 40, shadow: 0.15, frame: 0 });
  const [isFlowchartVisible, setIsFlowchartVisible] = useState(false);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ultra-smooth easeOutQuart for silky transitions
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

  const updateStyles = useCallback(function updateStylesFn() {
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const wh = window.innerHeight;
    const startPoint = wh * 0.9;
    const endPoint = wh * 0.2;

    let progress: number;
    if (rect.top > startPoint) {
      progress = 0;
    } else if (rect.top < endPoint) {
      progress = 1;
    } else {
      progress = (startPoint - rect.top) / (startPoint - endPoint);
      progress = Math.min(Math.max(progress, 0), 1);
    }

    const easedProgress = easeOutQuart(progress);

    // Target values — mobile adaptive
    const isMobile = window.innerWidth < 640;
    const isTablet = window.innerWidth < 1024;
    const maxMargin = isMobile ? 8 : isTablet ? 20 : 40;
    const minScale = isMobile ? 0.96 : 0.88;
    const scaleDelta = 1 - minScale;

    const targetScale = minScale + easedProgress * scaleDelta;
    const targetBorderRadius = isMobile ? (16 - easedProgress * 16) : (28 - easedProgress * 28);
    const targetMargin = (1 - easedProgress) * maxMargin;
    const targetShadow = 0.15 - easedProgress * 0.1;
    const targetFrame = easedProgress * 0.8;

    const lerpFactor = 0.25;
    const cv = currentValues.current;
    cv.scale = lerp(cv.scale, targetScale, lerpFactor);
    cv.borderRadius = lerp(cv.borderRadius, targetBorderRadius, lerpFactor);
    cv.margin = lerp(cv.margin, targetMargin, lerpFactor);
    cv.shadow = lerp(cv.shadow, targetShadow, lerpFactor);
    cv.frame = lerp(cv.frame, targetFrame, lerpFactor);

    // Apply directly to DOM
    el.style.transform = `scale(${cv.scale})`;
    el.style.borderRadius = `${cv.borderRadius}px`;
    el.style.margin = `0 ${cv.margin}px`;
    el.style.boxShadow = `0 8px 40px rgba(0, 0, 0, ${cv.shadow}), 0 20px 60px rgba(0, 0, 0, ${cv.shadow * 0.6})`;

    const frame = el.querySelector('.screen-frame') as HTMLElement;
    if (frame) {
      frame.style.opacity = String(cv.frame);
    }

    rafRef.current = requestAnimationFrame(updateStylesFn);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateStyles);

    // Intersection Observer for flowchart animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
            setIsFlowchartVisible(true);
          }
        });
      },
      { threshold: [0.25], rootMargin: '-30px' }
    );

    if (flowchartRef.current) {
      observer.observe(flowchartRef.current);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [updateStyles]);

  return (
    <div
      ref={cardRef}
      className="flowchart-card-wrapper"
      style={{
        willChange: 'transform, border-radius, margin, box-shadow',
        transform: 'scale(0.88)',
        borderRadius: '28px',
        margin: '0 40px',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div className="flowchart-card-inner">
        {/* Laptop screen frame effect - appears as card expands */}
        <div
          className="screen-frame"
          style={{ opacity: 0 }}
        />

        {/* Unified horizontal layout: Content + Flowchart */}
        <div className="showcase-unified-row">
          {/* Left: Title & Description */}
          <div className="showcase-content-left">
            <span className="showcase-badge">How It Works</span>
            <h2 className="showcase-title">AI + MCP + Graph Memory</h2>
            <p className="showcase-desc">
              Memron combines the power of Model Context Protocol with encrypted temporal graph memory
              to create truly persistent AI context - 26% higher response quality with 90% fewer tokens.
            </p>
            <button className="showcase-cta">
              Learn More
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Right: Flowchart */}
          <div ref={flowchartRef} className={`showcase-flowchart ${isFlowchartVisible ? 'flowchart-animated' : ''}`}>
            {/* Input Stage - Messages */}
            <div className="flowchart-column flow-col-1">
              <div className="flow-box messages-box flow-box-animated">
                <div className="message-line">
                  <span className="msg-label">User</span>
                  <div className="msg-bar"></div>
                </div>
                <div className="message-line">
                  <div className="msg-bar msg-wide"></div>
                  <span className="msg-label">Agent</span>
                </div>
              </div>
              <span className="flow-label">Conversations</span>
            </div>

            <div className="flow-arrow flow-arrow-1">→</div>

            {/* Processing Stage - MCP */}
            <div className="flowchart-column flow-col-2">
              <div className="flow-phase-label">Extraction Phase</div>
              <div className="flow-box llm-box flow-box-animated">
                <div className="llm-header">MCP Server</div>
                <div className="llm-content">
                  <div className="llm-item">Summary</div>
                  <div className="llm-divider"></div>
                  <div className="llm-item">Context Memory</div>
                </div>
                <div className="llm-nested">
                  <div className="nested-line">
                    <span className="nested-label">Pattern</span>
                    <div className="nested-bar"></div>
                  </div>
                  <div className="nested-line">
                    <div className="nested-bar nested-wide"></div>
                    <span className="nested-label">Pref</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flow-arrow flow-arrow-2">→</div>

            {/* Output Stage - Graph Memory */}
            <div className="flowchart-column flow-col-3">
              <div className="flow-phase-label">Sync Phase</div>
              <div className="flow-box web3-box flow-box-animated">
                <div className="web3-header">
                  <svg className="web3-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <line x1="8.5" y1="7.5" x2="10.5" y2="15.5" />
                    <line x1="15.5" y1="7.5" x2="13.5" y2="15.5" />
                    <line x1="9" y1="6" x2="15" y2="6" />
                  </svg>
                  <span>Graph Memory</span>
                </div>
                <div className="web3-nodes">
                  <div className="web3-node">
                    <span className="node-indicator"></span>
                    <span>Knowledge Graph</span>
                  </div>
                  <div className="web3-node">
                    <span className="node-indicator"></span>
                    <span>Temporal Vector</span>
                  </div>
                </div>
              </div>
              <div className="flow-box summary-box">
                <div className="summary-mini">
                  <span className="summary-dot"></span>
                  <span>Compressed Memory</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="card-section-divider"></div>

        {/* Integrations Section - Hub and Spoke */}
        <div className="integrations-row">
          {/* Left: Hub and Spoke Diagram */}
          <div className="integrations-hub">
            {/* Center Logo */}
            <div className="hub-center">
              <img src="/logo_b.png" alt="Memron" className="hub-logo hub-logo-light" />
              <img src="/logo_w.png" alt="Memron" className="hub-logo hub-logo-dark" />
            </div>

            {/* Spoke Lines - connecting to each icon */}
            <svg className="spoke-lines" viewBox="0 0 400 400">
              <line x1="200" y1="200" x2="68" y2="68" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="200" y2="40" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="332" y2="68" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="28" y2="200" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="372" y2="200" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="68" y2="332" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="200" y2="360" className="spoke-line" strokeWidth="1" />
              <line x1="200" y1="200" x2="332" y2="332" className="spoke-line" strokeWidth="1" />
            </svg>

            {/* Technology Icons with colored logos */}
            {/* RLM - Purple/Brain */}
            <div className="tech-icon tech-pos-1">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <path d="M12 2a9 9 0 0 1 9 9c0 3.9-2.5 7.2-6 8.4V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.6c-3.5-1.2-6-4.5-6-8.4a9 9 0 0 1 9-9z" fill="#8b5cf6" />
                <path d="M9 10h.01M15 10h.01M9 14c1 1 2 1.5 3 1.5s2-.5 3-1.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="tech-label">RLM</span>
            </div>

            {/* V-JEPA - Blue/Meta */}
            <div className="tech-icon tech-pos-2">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#0668E1" />
                <path d="M7 12l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="tech-label">V-JEPA</span>
            </div>

            {/* AES-256 - Emerald / Cryptographic Vault */}
            <div className="tech-icon tech-pos-3">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#10b981" />
                <rect x="7" y="11" width="10" height="8" rx="2" stroke="#fff" strokeWidth="1.5" />
                <path d="M9 11V8a3 3 0 0 1 6 0v3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="15" r="1" fill="#fff" />
              </svg>
              <span className="tech-label">AES-256</span>
            </div>

            {/* RAG - Orange */}
            <div className="tech-icon tech-pos-4">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#f97316" />
                <path d="M7 8h10M7 12h7M7 16h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="tech-label">RAG</span>
            </div>

            {/* MCP - Cyan */}
            <div className="tech-icon tech-pos-5">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#06b6d4" />
                <path d="M8 8l4 4-4 4M12 16h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="tech-label">MCP</span>
            </div>

            {/* COMPRESS - Indigo / Pointer-Based Context Compression */}
            <div className="tech-icon tech-pos-6">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#6366f1" />
                <path d="M9 8v8M12 10v6M15 7v10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="tech-label">LLM</span>
            </div>

            {/* KG - Pink */}
            <div className="tech-icon tech-pos-7">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <circle cx="12" cy="12" r="9" fill="#ec4899" />
                <circle cx="12" cy="9" r="2" fill="#fff" />
                <circle cx="8" cy="14" r="2" fill="#fff" />
                <circle cx="16" cy="14" r="2" fill="#fff" />
                <path d="M12 11v1M10 13l-1 0M14 13l1 0" stroke="#fff" strokeWidth="1" />
              </svg>
              <span className="tech-label">KG</span>
            </div>

            {/* Vector - Yellow */}
            <div className="tech-icon tech-pos-8">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#eab308" />
                <path d="M7 17l5-10 5 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 13h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="tech-label">Vector</span>
            </div>
          </div>

          {/* Right: Content */}
          <div className="integrations-content">
            <span className="integrations-badge">Research &amp; Core Architecture</span>
            <h2 className="integrations-title">
              Building the Future
              <br />
              of AI Memory
            </h2>
            <p className="integrations-desc">
              We&apos;re actively researching and integrating cutting-edge technologies —
              Reinforcement Learning from Memory (RLM), Meta&apos;s V-JEPA for multimodal understanding,
              temporal knowledge graphs, pointer-based context compression, and zero-knowledge AES-256-GCM encryption.
            </p>
            <p className="integrations-subdesc">
              Native MCP architecture ensures zero-config integration for Claude, Cursor, and any autonomous AI agent.
            </p>
            <a
              href="https://github.com/Priyank911/Memron.ai#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="integrations-cta"
            >
              Explore our architecture
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>

        {/* Works Everywhere Section */}
        <div className="works-everywhere">
          <h3 className="works-tagline" style={{ fontFamily: "'Pixelify Sans', cursive" }}>&lt;/&gt; One Protocol • Every Agent • Infinite Memory</h3>

          <div className="agent-logos-wrapper">
            <div className="agent-logos-track">
              {/* First set */}
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cursor-ai.png" alt="Cursor" className="agent-logo" />
                <span>Cursor</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/claude-ai.png" alt="Claude" className="agent-logo" />
                <span>Claude</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/vscode.svg" alt="VS Code" className="agent-logo" />
                <span>VS Code</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/windsurf.png" alt="Windsurf" className="agent-logo" />
                <span>Windsurf</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/openai.svg" alt="OpenAI" className="agent-logo" />
                <span>OpenAI</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/gemini-ai.png" alt="Gemini" className="agent-logo" />
                <span>Gemini</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cline.svg" alt="Cline" className="agent-logo" />
                <span>Cline</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/github-copilot.png" alt="GitHub Copilot" className="agent-logo" />
                <span>GitHub Copilot</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/qwen.svg" alt="Qwen" className="agent-logo" />
                <span>Qwen</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/warp.svg" alt="Warp" className="agent-logo" />
                <span>Warp</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/roo-logo.svg" alt="Roo Code" className="agent-logo" />
                <span>Roo Code</span>
              </div>

              {/* Duplicate for seamless loop */}
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cursor-ai.png" alt="Cursor" className="agent-logo" />
                <span>Cursor</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/claude-ai.png" alt="Claude" className="agent-logo" />
                <span>Claude</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/vscode.svg" alt="VS Code" className="agent-logo" />
                <span>VS Code</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/windsurf.png" alt="Windsurf" className="agent-logo" />
                <span>Windsurf</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/openai.svg" alt="OpenAI" className="agent-logo" />
                <span>OpenAI</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/gemini-ai.png" alt="Gemini" className="agent-logo" />
                <span>Gemini</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cline.svg" alt="Cline" className="agent-logo" />
                <span>Cline</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/github-copilot.png" alt="GitHub Copilot" className="agent-logo" />
                <span>GitHub Copilot</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/qwen.svg" alt="Qwen" className="agent-logo" />
                <span>Qwen</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/warp.svg" alt="Warp" className="agent-logo" />
                <span>Warp</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/roo-logo.svg" alt="Roo Code" className="agent-logo" />
                <span>Roo Code</span>
              </div>
            </div>
          </div>

          <p className="works-subtitle">Connect any AI agent via MCP and unleash infinite memory</p>
        </div>

        {/* Quote Section Inside Card */}
        <div className="card-quote-section">
          <img src="/logo_b.png" alt="Memron" className="card-quote-logo card-quote-logo-light" />
          <img src="/logo_w.png" alt="Memron" className="card-quote-logo card-quote-logo-dark" />
          <h2 className="card-quote-text">
            Every conversation remembered.
            <br />
            Every insight preserved.
          </h2>
        </div>
      </div>
    </div>
  );
}
