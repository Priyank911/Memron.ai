'use client';

import { useEffect, useRef, useCallback } from 'react';

export function FlowchartCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const currentValues = useRef({ scale: 0.88, borderRadius: 28, margin: 40, shadow: 0.15, frame: 0 });

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const updateStyles = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const wh = window.innerHeight;
    const startPoint = wh * 0.85;
    const endPoint = wh * 0.15;

    let progress: number;
    if (rect.top > startPoint) {
      progress = 0;
    } else if (rect.top < endPoint) {
      progress = 1;
    } else {
      progress = (startPoint - rect.top) / (startPoint - endPoint);
      progress = Math.min(Math.max(progress, 0), 1);
    }

    const easedProgress = easeOut(progress);

    // Target values
    const targetScale = 0.88 + easedProgress * 0.12;
    const targetBorderRadius = 28 - easedProgress * 28;
    const targetMargin = (1 - easedProgress) * 40;
    const targetShadow = 0.15 - easedProgress * 0.1;
    const targetFrame = easedProgress * 0.8;

    // Smooth interpolation (lerp) at ~0.18 factor for buttery smoothness
    const lerpFactor = 0.18;
    const cv = currentValues.current;
    cv.scale = lerp(cv.scale, targetScale, lerpFactor);
    cv.borderRadius = lerp(cv.borderRadius, targetBorderRadius, lerpFactor);
    cv.margin = lerp(cv.margin, targetMargin, lerpFactor);
    cv.shadow = lerp(cv.shadow, targetShadow, lerpFactor);
    cv.frame = lerp(cv.frame, targetFrame, lerpFactor);

    // Apply directly to DOM (no React re-render, no setState)
    el.style.transform = `scale(${cv.scale})`;
    el.style.borderRadius = `${cv.borderRadius}px`;
    el.style.margin = `0 ${cv.margin}px`;
    el.style.boxShadow = `0 8px 40px rgba(0, 0, 0, ${cv.shadow}), 0 20px 60px rgba(0, 0, 0, ${cv.shadow * 0.6})`;

    const frame = el.querySelector('.screen-frame') as HTMLElement;
    if (frame) {
      frame.style.opacity = String(cv.frame);
    }

    rafRef.current = requestAnimationFrame(updateStyles);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateStyles);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateStyles]);

  return (
    <div
      ref={cardRef}
      className="flowchart-card-wrapper"
      style={{
        willChange: 'transform, border-radius',
        transform: 'scale(0.88)',
        borderRadius: '28px',
        margin: '0 40px',
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
            <h2 className="showcase-title">AI + MCP + Web3</h2>
            <p className="showcase-desc">
              Memron combines the power of Model Context Protocol with decentralized storage
              to create truly persistent AI memory—26% higher response quality with 90% fewer tokens.
            </p>
            <button className="showcase-cta">
              Learn More
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Right: Flowchart */}
          <div className="showcase-flowchart">
            {/* Input Stage - Messages */}
            <div className="flowchart-column">
              <div className="flow-box messages-box">
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

            <div className="flow-arrow">→</div>

            {/* Processing Stage - MCP */}
            <div className="flowchart-column">
              <div className="flow-phase-label">Extraction Phase</div>
              <div className="flow-box llm-box">
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

            <div className="flow-arrow">→</div>

            {/* Output Stage - Web3 */}
            <div className="flowchart-column">
              <div className="flow-phase-label">Sync Phase</div>
              <div className="flow-box web3-box">
                <div className="web3-header">
                  <svg className="web3-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span>Web3 Storage</span>
                </div>
                <div className="web3-nodes">
                  <div className="web3-node">
                    <span className="node-indicator"></span>
                    <span>IPFS</span>
                  </div>
                  <div className="web3-node">
                    <span className="node-indicator"></span>
                    <span>Arweave</span>
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
              <line x1="200" y1="200" x2="332" y2="332" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
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
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#0668E1" />
                <path d="M7 12l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="tech-label">V-JEPA</span>
            </div>

            {/* Cognee - Green/Knowledge */}
            <div className="tech-icon tech-pos-3">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <circle cx="12" cy="12" r="9" fill="#10b981" />
                <path d="M12 7v5l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="2" fill="#fff" />
              </svg>
              <span className="tech-label">Cognee</span>
            </div>

            {/* RAG - Orange */}
            <div className="tech-icon tech-pos-4">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#f97316" />
                <path d="M7 8h10M7 12h7M7 16h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="tech-label">RAG</span>
            </div>

            {/* MCP - Cyan */}
            <div className="tech-icon tech-pos-5">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#06b6d4" />
                <path d="M8 8l4 4-4 4M12 16h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="tech-label">MCP</span>
            </div>

            {/* LLM - Indigo */}
            <div className="tech-icon tech-pos-6">
              <svg viewBox="0 0 24 24" fill="none" className="tech-logo">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#6366f1" />
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
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#eab308" />
                <path d="M7 17l5-10 5 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 13h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="tech-label">Vector</span>
            </div>
          </div>

          {/* Right: Content */}
          <div className="integrations-content">
            <span className="integrations-badge">Research & Development</span>
            <h2 className="integrations-title">
              Building the Future
              <br />
              of AI Memory
            </h2>
            <p className="integrations-desc">
              We're actively researching and integrating cutting-edge technologies—
              Reinforcement Learning from Memory (RLM), Meta's V-JEPA for visual understanding,
              Cognee for knowledge graphs, and more. Our platform evolves with the latest advances in AI.
            </p>
            <p className="integrations-subdesc">
              Seamlessly integrates with your existing stack. Just a few lines of code to get started.
            </p>
            <button className="integrations-cta">
              Read more about our research
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Works Everywhere Section */}
        <div className="works-everywhere">
          <h3 className="works-tagline" style={{ fontFamily: "'Pixelify Sans', cursive" }}>&lt;/&gt; One Protocol • Every Agent • Infinite Memory</h3>

          <div className="agent-logos-wrapper">
            <div className="agent-logos-track">
              {/* First set - Using Icons8 icons */}
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/cursor-ai.png" alt="Cursor" className="agent-logo" />
                <span>Cursor</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/claude-ai.png" alt="Claude" className="agent-logo" />
                <span>Claude</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/visual-studio-code-2019.png" alt="VS Code" className="agent-logo" />
                <span>VS Code</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/ios-filled/50/windsurf-editor.png" alt="Windsurf" className="agent-logo" />
                <span>Windsurf</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/chatgpt.png" alt="OpenAI" className="agent-logo" />
                <span>OpenAI</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/gemini-ai.png" alt="Gemini" className="agent-logo" />
                <span>Gemini</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cline.svg" alt="Cline" className="agent-logo" />
                <span>Cline</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/github-copilot.png" alt="GitHub Copilot" className="agent-logo" />
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
                <img width="24" height="24" src="https://img.icons8.com/external-others-inmotus-design/67/external-Kangaroo-zoo-others-inmotus-design.png" alt="Roo Code" className="agent-logo" />
                <span>Roo Code</span>
              </div>

              {/* Duplicate for seamless loop */}
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/cursor-ai.png" alt="Cursor" className="agent-logo" />
                <span>Cursor</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/claude-ai.png" alt="Claude" className="agent-logo" />
                <span>Claude</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/visual-studio-code-2019.png" alt="VS Code" className="agent-logo" />
                <span>VS Code</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/ios-filled/50/windsurf-editor.png" alt="Windsurf" className="agent-logo" />
                <span>Windsurf</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/chatgpt.png" alt="OpenAI" className="agent-logo" />
                <span>OpenAI</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/gemini-ai.png" alt="Gemini" className="agent-logo" />
                <span>Gemini</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="/icons/cline.svg" alt="Cline" className="agent-logo" />
                <span>Cline</span>
              </div>
              <div className="agent-item">
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/github-copilot.png" alt="GitHub Copilot" className="agent-logo" />
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
                <img width="24" height="24" src="https://img.icons8.com/external-others-inmotus-design/67/external-Kangaroo-zoo-others-inmotus-design.png" alt="Roo Code" className="agent-logo" />
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
