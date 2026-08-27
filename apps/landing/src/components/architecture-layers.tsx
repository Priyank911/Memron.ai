'use client';

import React, { useState, useEffect, useRef } from 'react';

const layers = [
  {
    id: 0,
    label: 'MCP TOOLS',
    desc: 'Protocol Interface',
    detail: '41 MCP tools expose memory operations — zero-config integration for any compatible AI agent.',
    features: ['Universal IDE support (Cursor, VS Code)', 'Standardized JSON-RPC interface', 'Bi-directional state synchronization', 'Agent capability negotiation']
  },
  {
    id: 1,
    label: 'KNOWLEDGE',
    desc: 'Graph Engine',
    detail: 'Entity extraction builds knowledge graphs. Recipe distiller captures success patterns automatically.',
    features: ['Dynamic entity relationship mapping', 'Automated pattern distillation', 'Cross-session concept correlation', 'Hierarchical node clustering']
  },
  {
    id: 2,
    label: 'RETRIEVAL',
    desc: 'Context Builder',
    detail: 'Anti-hallucination packets with confidence scoring. ~90% token reduction via smart compression.',
    features: ['Semantic confidence scoring', 'Smart token compression algorithms', 'Multi-hop reasoning retrieval', 'Contextual relevance filtering']
  },
  {
    id: 3,
    label: 'ANALYSIS',
    desc: 'Memory Extractor',
    detail: '6-stage pipeline: Episode Splitter → Memory Extractor → Trajectory Analyzer for structured knowledge.',
    features: ['Conversation episode chunking', 'Intent & action classification', 'Trajectory pattern recognition', 'Anomaly detection & flagging']
  },
  {
    id: 4,
    label: 'STORAGE',
    desc: 'Encrypted Vault',
    detail: 'PostgreSQL + pgvector with AES-256-GCM encryption. All memories secured with vector embeddings.',
    features: ['AES-256-GCM data encryption', 'High-speed pgvector indexing', 'Automated lifecycle management', 'Geographic redundancy backups']
  },
];

export function ArchitectureLayers() {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll-based layer progression - starts when component enters viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const containerTop = rect.top;
      const containerHeight = rect.height;
      const viewportHeight = window.innerHeight;

      // The component becomes sticky at top: 15vh
      // We want the scroll effect to start EXACTLY when the container reaches this point
      const stickyOffset = viewportHeight * 0.15;

      // Total scrollable distance while the element remains sticky
      const scrollDistance = containerHeight - viewportHeight;

      // Calculate scroll progress (0 to 1) starting only after it sticks
      const scrolledAmount = stickyOffset - containerTop;
      const scrollProgress = Math.max(0, Math.min(1, scrolledAmount / scrollDistance));

      // Map scroll progress to layer index (0-4)
      const layerIndex = Math.min(4, Math.floor(scrollProgress * 5));
      setActive(layerIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // SVG dimensions - wider to fit aligned labels
  const viewWidth = 750;
  const viewHeight = 400;
  const cx = 300;

  // Progressive sizing - smallest at top, largest at bottom
  const getLayerSize = (index: number) => {
    const baseWidth = 95;
    const baseDepth = 48;
    const increment = 16;
    return {
      width: baseWidth + (index * increment),
      depth: baseDepth + (index * increment * 0.5),
    };
  };

  const baseGap = 65;
  const startY = 45;
  const layerThickness = 16;

  const getLayerY = (index: number) => {
    const base = startY + index * baseGap;
    const diff = index - active;
    if (diff === 0) return base;
    if (diff < 0) return base - Math.abs(diff) * 10;
    return base + diff * 10;
  };

  const getLayerColor = (isActive: boolean) => {
    return {
      top: isActive ? '#4b5563' : '#9ca3af',
      right: isActive ? '#374151' : '#6b7280',
      left: isActive ? '#1f2937' : '#4b5563',
      opacity: isActive ? 1 : 0.4,
    };
  };

  return (
    <div className="arch-root" ref={containerRef}>
      <style>{`
        .arch-root {
          --text-primary: #111827;
          --text-secondary: #374151;
          --text-muted: #6b7280;
          --text-faint: #9ca3af;
          --border-light: rgba(0, 0, 0, 0.12);
          --border-highlight: rgba(255, 255, 255, 0.2);
          --box-border: #e2e8f0;
          --inner-line: rgba(0, 0, 0, 0.06);
          --bg: transparent;
          --card-bg: #ffffff;
          --bg-dark: transparent;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          font-family: 'Bricolage Grotesque', system-ui, -apple-system, sans-serif;
          height: 140vh;
          position: relative;
        }

        .dark .arch-root,
        [data-theme="dark"] .arch-root {
          --text-primary: #f9fafb;
          --text-secondary: #e5e7eb;
          --text-muted: #9ca3af;
          --text-faint: #6b7280;
          --border-light: rgba(255, 255, 255, 0.1);
          --border-highlight: rgba(255, 255, 255, 0.25);
          --box-border: #27272d;
          --inner-line: rgba(255, 255, 255, 0.08);
          --bg: transparent;
          --card-bg: #18181c;
        }

        .arch-sticky {
          position: sticky;
          top: 10vh;
          padding: 0 1rem;
          z-index: 10;
        }

        .arch-header {
          text-align: center;
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .arch-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: #a78bfa;
          margin-bottom: 12px;
        }

        [data-theme="light"] .arch-badge {
          background: #f3e8ff;
          border-color: #d8b4fe;
          color: #7c3aed;
        }

        .arch-title {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 40px;
          font-weight: 700;
          line-height: 1.18;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin: 0 0 8px;
        }

        .arch-title-highlight {
          color: var(--text-muted);
        }

        .arch-subtitle {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 14.5px;
          color: var(--text-muted);
          margin: 0;
          max-width: 520px;
        }

        /* Outer flex container: Border and background box removed! Free-floating and clean */
        .arch-flex {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2.5rem;
          padding: 0.5rem 0;
          border: none;
          background: transparent;
        }

        .dark .arch-flex,
        [data-theme="dark"] .arch-flex {
          background: transparent;
          border: none;
        }

        .arch-svg-wrap {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
        }

        .arch-svg {
          display: block;
          overflow: visible;
        }

        .layer-g {
          cursor: pointer;
          transition: all 0.6s cubic-bezier(0.34, 1.4, 0.64, 1);
        }

        .layer-g.on {
          filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.1));
        }

        .layer-g:hover polygon {
          filter: brightness(1.2);
        }

        .plate-face {
          transition: all 0.5s ease;
        }

        .plate-top {
          stroke: var(--border-highlight);
          stroke-width: 0.6;
        }

        .plate-top.on {
          stroke: var(--border-highlight);
          stroke-width: 1;
        }

        .plate-right {
          stroke: var(--border-light);
          stroke-width: 0.4;
        }

        .plate-right.on {
          stroke: var(--border-light);
          stroke-width: 0.6;
        }

        .plate-left {
          stroke: var(--border-light);
          stroke-width: 0.4;
        }

        .plate-left.on {
          stroke: var(--border-light);
          stroke-width: 0.6;
        }

        /* Inner plate decorations */
        .plate-inner {
          fill: none;
          stroke: var(--inner-line);
          stroke-width: 0.5;
          opacity: 0.4;
          transition: all 0.4s ease;
        }

        .plate-inner.on {
          opacity: 0.7;
          stroke-width: 0.8;
        }

        .plate-dot {
          fill: var(--inner-line);
          opacity: 0.5;
          transition: all 0.4s ease;
        }

        .plate-dot.on {
          opacity: 0.9;
        }

        .lbl-text {
          font-weight: 500;
          letter-spacing: 1.5px;
          fill: var(--text-faint);
          transition: all 0.4s ease;
          text-transform: uppercase;
          font-family: var(--font-bricolage), 'Inter', sans-serif;
        }

        .lbl-text.on {
          fill: var(--text-primary);
          font-weight: 800;
          letter-spacing: 2px;
        }

        .lbl-line {
          stroke: var(--text-faint);
          stroke-width: 0.8;
          opacity: 0.15;
          transition: all 0.4s ease;
          stroke-dasharray: 2 4;
        }

        .lbl-line.on {
          opacity: 0.4;
          stroke: var(--text-muted);
          stroke-width: 1;
          stroke-dasharray: none;
        }

        .lbl-dot {
          fill: var(--text-faint);
          opacity: 0.3;
          transition: all 0.4s ease;
        }

        .lbl-dot.on {
          fill: var(--text-secondary);
          opacity: 1;
        }

        /* Info Panel: Only the text area box has the card border & box */
        .info-box {
          flex: 0 0 420px;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 2.25rem 2.5rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }

        [data-theme="dark"] .info-box {
          background: #18181c;
          border-color: #27272d;
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
        }

        .info-num {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2.5px;
          color: #8b5cf6;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }

        [data-theme="light"] .info-num {
          color: #7c3aed;
        }

        .info-name {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          margin-bottom: 0.25rem;
          transition: all 0.4s ease;
        }

        .info-sub {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 1rem;
        }

        .info-bar {
          width: 32px;
          height: 2px;
          background: #8b5cf6;
          border-radius: 2px;
          margin-bottom: 1.25rem;
          opacity: 0.8;
        }

        .info-text {
          font-size: 13.5px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin-bottom: 1.25rem;
        }

        .info-features {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .info-feature-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 12.5px;
          color: var(--text-muted);
        }

        .info-feature-icon {
          color: #8b5cf6;
          font-size: 8px;
          flex-shrink: 0;
        }

        [data-theme="light"] .info-feature-icon {
          color: #7c3aed;
        }

        .progress-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--box-border);
        }

        .progress-dots {
          display: flex;
          gap: 6px;
        }

        .progress-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-faint);
          opacity: 0.25;
          transition: all 0.3s ease;
        }

        .progress-dot.active {
          opacity: 1;
          background: #8b5cf6;
          transform: scale(1.3);
        }

        [data-theme="light"] .progress-dot.active {
          background: #7c3aed;
        }

        .progress-dot.past {
          opacity: 0.6;
        }

        .scroll-hint {
          font-size: 10px;
          letter-spacing: 2px;
          color: var(--text-faint);
          text-transform: uppercase;
          opacity: 0.5;
        }

        @media (max-width: 900px) {
          .arch-root {
            height: 200vh;
          }
          .arch-sticky {
            top: 5vh;
          }
          .arch-flex {
            flex-direction: column;
            gap: 2rem;
            padding: 2rem 1.5rem;
          }
          .info-box {
            flex: none;
            max-width: 100%;
            text-align: center;
            padding-left: 0;
            padding-top: 2rem;
            border-left: none;
            border-top: 1px solid var(--box-border);
          }
          .info-bar {
            margin: 0 auto 1.5rem;
          }
          .progress-wrap {
            align-items: center;
          }
        }

        @media (max-width: 768px) {
          .arch-root {
            height: auto;
            min-height: 100vh;
          }
          .arch-sticky {
            position: relative;
            top: 0;
            padding: 24px 12px;
          }
          .arch-header {
            display: block !important;
            margin-bottom: 1.25rem;
          }
          .arch-title {
            font-size: 1.5rem !important;
            line-height: 1.25 !important;
          }
          .arch-subtitle {
            font-size: 0.85rem !important;
            margin-top: 6px !important;
          }
          .arch-flex {
            padding: 1rem 0.5rem;
            gap: 1.5rem;
          }
          .arch-svg-wrap {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .arch-svg {
            width: 100% !important;
            max-width: 440px !important;
            height: auto !important;
          }
        }
      `}</style>

      <div className="arch-sticky">
        <div className="arch-header">
          <span className="arch-badge">7-Layer Architecture</span>
          <h2 className="arch-title">
            Context Intelligence &amp;
            <br />
            <span className="arch-title-highlight">Memory Orchestration Layer</span>
          </h2>
          <p className="arch-subtitle">
            From raw conversation streams to verifiable, encrypted graph memory.
          </p>
        </div>
        <div className="arch-flex">
          {/* SVG Layers */}
          <div className="arch-svg-wrap">
            <svg
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              className="arch-svg"
              width="520"
              height="360"
            >
              <defs>
                <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.06" />
                </filter>
                <filter id="shOn" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.12" />
                </filter>
              </defs>

              {[...layers].reverse().map((layer) => {
                const i = layer.id;
                const isOn = active === i;
                const y = getLayerY(i);
                const { width: w, depth: d } = getLayerSize(i);
                const t = layerThickness;
                const colors = getLayerColor(isOn);

                const top = `${cx},${y - d / 2} ${cx + w},${y} ${cx},${y + d / 2} ${cx - w},${y}`;
                const right = `${cx + w},${y} ${cx},${y + d / 2} ${cx},${y + d / 2 + t} ${cx + w},${y + t}`;
                const left = `${cx - w},${y} ${cx},${y + d / 2} ${cx},${y + d / 2 + t} ${cx - w},${y + t}`;

                // Fixed X position for all labels (straight alignment)
                const fixedLblX = 580;

                // Inner decoration positions (on the top face)
                const innerScale = 0.5;
                const innerW = w * innerScale;
                const innerD = d * innerScale;
                const innerTop = `${cx},${y - innerD / 2} ${cx + innerW},${y} ${cx},${y + innerD / 2} ${cx - innerW},${y}`;

                return (
                  <g
                    key={i}
                    className={`layer-g ${isOn ? 'on' : ''}`}
                    style={{
                      transform: `translateY(${isOn ? -10 : 0}px)`,
                      filter: isOn ? 'url(#shOn)' : 'url(#sh)',
                    }}
                  >
                    {/* Main plate faces */}
                    <polygon
                      className={`plate-face plate-left ${isOn ? 'on' : ''}`}
                      points={left}
                      fill={colors.left}
                      opacity={colors.opacity * 0.9}
                    />
                    <polygon
                      className={`plate-face plate-right ${isOn ? 'on' : ''}`}
                      points={right}
                      fill={colors.right}
                      opacity={colors.opacity * 0.95}
                    />
                    <polygon
                      className={`plate-face plate-top ${isOn ? 'on' : ''}`}
                      points={top}
                      fill={colors.top}
                      opacity={colors.opacity}
                    />

                    {/* Inner decoration - small diamond */}
                    <polygon
                      className={`plate-inner ${isOn ? 'on' : ''}`}
                      points={innerTop}
                    />

                    {/* Center dots */}
                    <circle
                      className={`plate-dot ${isOn ? 'on' : ''}`}
                      cx={cx}
                      cy={y}
                      r={isOn ? 3 : 2}
                    />

                    {/* Small accent lines on active plate */}
                    {isOn && (
                      <>
                        <line
                          x1={cx - innerW * 0.6}
                          y1={y}
                          x2={cx - innerW * 0.3}
                          y2={y}
                          stroke="var(--inner-line)"
                          strokeWidth="1"
                          opacity="0.6"
                        />
                        <line
                          x1={cx + innerW * 0.3}
                          y1={y}
                          x2={cx + innerW * 0.6}
                          y2={y}
                          stroke="var(--inner-line)"
                          strokeWidth="1"
                          opacity="0.6"
                        />
                      </>
                    )}

                    {/* Connector line - horizontal to fixed X position (with gaps) */}
                    <line
                      x1={cx + w + 15}
                      y1={y}
                      x2={fixedLblX - 60}
                      y2={y}
                      className={`lbl-line ${isOn ? 'on' : ''}`}
                    />

                    {/* Bullet indicator */}
                    <circle
                      cx={fixedLblX - 45}
                      cy={y}
                      r={isOn ? 4.5 : 2.5}
                      className={`lbl-dot ${isOn ? 'on' : ''}`}
                      style={{ filter: isOn ? 'drop-shadow(0 0 4px #fff)' : 'none' }}
                    />

                    {/* Label text - all aligned at same X */}
                    <text
                      x={fixedLblX - 30}
                      y={y + 4}
                      className={`lbl-text ${isOn ? 'on' : ''}`}
                      fontSize={isOn ? '12px' : '10px'}
                    >
                      {layer.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Info Panel */}
          <div className="info-box">
            <div className="info-num">Layer {String(active + 1).padStart(2, '0')}</div>
            <div className="info-name">{layers[active]?.label}</div>
            <div className="info-sub">{layers[active]?.desc}</div>
            <div className="info-bar" />
            <div className="info-text">{layers[active]?.detail}</div>

            {layers[active]?.features && (
              <ul className="info-features">
                {layers[active].features.map((feat, i) => (
                  <li key={i} className="info-feature-item">
                    <span className="info-feature-icon">●</span>
                    {feat}
                  </li>
                ))}
              </ul>
            )}

            {/* Progress indicator */}
            <div className="progress-wrap">
              <div className="progress-dots">
                {layers.map((_, i) => (
                  <div
                    key={i}
                    className={`progress-dot ${i === active ? 'active' : ''} ${i < active ? 'past' : ''}`}
                  />
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
