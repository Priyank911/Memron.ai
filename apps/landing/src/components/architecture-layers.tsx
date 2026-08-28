'use client';

import React, { useEffect, useState, useRef } from 'react';

const modules = [
  {
    id: '01',
    label: 'MCP TOOLS',
    shortLabel: 'Protocol Interface',
    detail: 'A universal control ring connects Claude, Cursor, VS Code, and every MCP-compatible agent to the same memory surface.',
    features: [
      { name: '41 callable memory tools', status: 'ACTIVE' },
      { name: 'JSON-RPC agent bridge', status: 'VERIFIED' },
      { name: 'Live capability negotiation', status: 'SYNCED' },
    ],
    tag: 'PROTOCOL',
  },
  {
    id: '02',
    label: 'KNOWLEDGE',
    shortLabel: 'Graph Lattice',
    detail: 'Entities and relationships crystallize into a living knowledge lattice that strengthens as agents complete more work.',
    features: [
      { name: 'Entity relationship mapping', status: 'RESOLVED' },
      { name: 'Cross-session correlation', status: 'ACTIVE' },
      { name: 'Automatic pattern distillation', status: 'INDEXED' },
    ],
    tag: 'GRAPH_ENGINE',
  },
  {
    id: '03',
    label: 'RETRIEVAL',
    shortLabel: 'Context Turbine',
    detail: 'A relevance turbine compresses the graph into compact, confidence-scored context packets before every model call.',
    features: [
      { name: 'Semantic confidence scoring', status: 'OPTIMIZED' },
      { name: '~90% token compression', status: 'BENCHMARKED' },
      { name: 'Multi-hop context routing', status: 'ROUTED' },
    ],
    tag: 'COMPRESSION',
  },
  {
    id: '04',
    label: 'ANALYSIS',
    shortLabel: 'Reasoning Core',
    detail: 'A six-stage analysis core separates episodes, extracts durable memories, and validates every trajectory before storage.',
    features: [
      { name: 'Episode segmentation', status: 'PARSED' },
      { name: 'Intent and action extraction', status: 'COMPILED' },
      { name: 'Trajectory validation', status: 'VERIFIED' },
    ],
    tag: 'EVAL_PIPELINE',
  },
  {
    id: '05',
    label: 'STORAGE',
    shortLabel: 'Encrypted Vault',
    detail: 'The engine rests on an encrypted vector vault built for durable, private memory across projects, agents, and sessions.',
    features: [
      { name: 'AES-256-GCM zero-knowledge', status: 'ENCRYPTED' },
      { name: 'PostgreSQL + pgvector (1536-dim)', status: 'PERSISTED' },
      { name: 'Tenant DID/RBAC isolation', status: 'LOCKED' },
    ],
    tag: 'SECURITY_VAULT',
  },
];

const modulePositions = [88, 200, 318, 436, 558];
const stableCoordinate = (value: number) => Number(value.toFixed(4));

export function ArchitectureLayers() {
  const [active, setActive] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const pinWrapperRef = useRef<HTMLDivElement>(null);

  // Pinned scroll scrubber:
  // When this section enters the viewport, scroll pins and scrubs through the 5 modules.
  // After module 5 is finished, scrolling continues normally down the page.
  useEffect(() => {
    let rafId: number;

    const handleScroll = () => {
      if (!pinWrapperRef.current) return;
      const rect = pinWrapperRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const isMobile = window.innerWidth <= 960;
      const topOffset = isMobile ? 56 : 70;

      // Total distance the user scrolls while this section is pinned
      const totalPinTravel = rect.height - vh;

      if (totalPinTravel > 0) {
        const scrolled = -rect.top + topOffset;
        const progress = Math.max(0, Math.min(0.999, scrolled / totalPinTravel));
        setScrollProgress(progress);

        if (rect.top <= topOffset && rect.bottom >= vh) {
          const step = Math.min(
            modules.length - 1,
            Math.max(0, Math.floor(progress * modules.length))
          );
          setActive(step);
        } else if (rect.top > topOffset) {
          setActive(0);
        } else if (rect.bottom < vh) {
          setActive(modules.length - 1);
        }
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    handleScroll();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Professional Technical Accent Tones (Anti-AI, Industrial / Linear Style)
  const moduleTones = [
    { primary: '#6366f1', secondary: '#4338ca', fill: 'rgba(99, 102, 241, 0.16)', fillStrong: 'rgba(99, 102, 241, 0.32)', glow: 'url(#tech-glow-indigo)', tagColor: '#818cf8' },
    { primary: '#3b82f6', secondary: '#1d4ed8', fill: 'rgba(59, 130, 246, 0.16)', fillStrong: 'rgba(59, 130, 246, 0.32)', glow: 'url(#tech-glow-blue)', tagColor: '#60a5fa' },
    { primary: '#06b6d4', secondary: '#0e7490', fill: 'rgba(6, 182, 212, 0.16)', fillStrong: 'rgba(6, 182, 212, 0.32)', glow: 'url(#tech-glow-cyan)', tagColor: '#22d3ee' },
    { primary: '#8b5cf6', secondary: '#6d28d9', fill: 'rgba(139, 92, 246, 0.16)', fillStrong: 'rgba(139, 92, 246, 0.32)', glow: 'url(#tech-glow-purple)', tagColor: '#a78bfa' },
    { primary: '#10b981', secondary: '#047857', fill: 'rgba(16, 185, 129, 0.16)', fillStrong: 'rgba(16, 185, 129, 0.32)', glow: 'url(#tech-glow-emerald)', tagColor: '#34d399' },
  ];

  const tone = (index: number) => {
    const isActive = active === index;
    const m = moduleTones[index] || moduleTones[0];
    return {
      primary: isActive ? m.primary : 'var(--arch-line)',
      secondary: isActive ? m.secondary : 'var(--arch-line-faint)',
      fill: isActive ? m.fill : 'var(--arch-layer-fill)',
      fillStrong: isActive ? m.fillStrong : 'var(--arch-layer-strong)',
      glow: isActive ? m.glow : 'url(#subtle-depth)',
    };
  };

  const moduleInteraction = (index: number) => ({
    className: `engine-module engine-module-${index + 1} ${active === index ? 'is-active' : ''}`,
    onClick: () => setActive(index),
    role: 'button',
    tabIndex: 0,
    'aria-label': `Select ${modules[index].label} subsystem`,
    style: { '--assembly-delay': `${index * 80}ms` } as React.CSSProperties,
  });

  const currentMod = modules[active];
  const currentTone = moduleTones[active] || moduleTones[0];

  return (
    <div ref={pinWrapperRef} className="arch-pin-wrapper">
      <style>{`
        /* Pinned Scroll Architecture Section */
        .arch-pin-wrapper {
          position: relative;
          width: 100%;
          height: 250vh; /* Controlled travel distance for scrolling through 5 modules */
        }

        .arch-sticky-frame {
          position: sticky;
          top: 70px;
          height: calc(100vh - 70px);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .arch-root {
          --arch-bg-panel: #111116;
          --arch-border: rgba(255, 255, 255, 0.08);
          --arch-text: #ffffff;
          --arch-muted: #9496a1;
          --arch-faint: #4b5563;
          --arch-line: #64748b;
          --arch-line-faint: #334155;
          --arch-layer-fill: rgba(148, 163, 184, 0.06);
          --arch-layer-strong: rgba(148, 163, 184, 0.12);
          width: 100%;
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 1.5rem;
          color: var(--arch-text);
          font-family: var(--font-bricolage), 'Bricolage Grotesque', system-ui, sans-serif;
        }

        [data-theme='light'] .arch-root {
          --arch-bg-panel: #ffffff;
          --arch-border: #e2e8f0;
          --arch-text: #09090b;
          --arch-muted: #52525b;
          --arch-faint: #94a3b8;
          --arch-line: #64748b;
          --arch-line-faint: #cbd5e1;
          --arch-layer-fill: rgba(226, 232, 240, 0.4);
          --arch-layer-strong: rgba(203, 213, 225, 0.6);
        }

        /* Compact Header */
        .arch-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        /* Anti-AI Professional Technical Kicker */
        .arch-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: var(--arch-muted);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .arch-kicker-bracket {
          color: var(--arch-faint);
          font-weight: 400;
        }

        .arch-kicker-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        }

        .arch-title {
          max-width: 760px;
          margin: 0;
          color: var(--arch-text);
          font-size: clamp(1.85rem, 3.2vw, 2.65rem);
          font-weight: 700;
          letter-spacing: -0.035em;
          line-height: 1.1;
        }

        .arch-title span {
          color: var(--arch-muted);
        }

        .arch-subtitle {
          max-width: 580px;
          margin: 8px 0 0;
          color: var(--arch-muted);
          font-size: 14px;
          line-height: 1.55;
        }

        /* 2-Column Broad Layout */
        .arch-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(420px, 0.95fr);
          align-items: center;
          gap: 2.5rem;
        }

        /* Left Diagram Stage */
        .engine-stage {
          position: relative;
          min-width: 0;
          max-height: 500px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .engine-svg {
          position: relative;
          display: block;
          width: 100%;
          max-width: 580px;
          height: auto;
          overflow: visible;
        }

        .engine-module {
          cursor: pointer;
          outline: none;
          transform-box: fill-box;
          transform-origin: center;
          transition: transform 0.4s ease;
        }

        .engine-module > * {
          transition: fill 350ms ease, stroke 350ms ease, opacity 350ms ease, filter 350ms ease;
        }

        .engine-module.is-active {
          filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.35));
        }

        .engine-module.is-active .engine-rotor {
          animation: engine-turn 14s linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .engine-module.is-active .engine-pulse {
          animation: engine-pulse 2.2s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .engine-guide {
          fill: none;
          stroke: var(--arch-border);
          stroke-width: 1;
          stroke-dasharray: 3 7;
        }

        .engine-measure {
          fill: var(--arch-faint);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 8px;
          letter-spacing: 0.16em;
        }

        .engine-label-line,
        .engine-label-dot,
        .engine-label-text,
        .engine-label-index {
          transition: fill 350ms ease, stroke 350ms ease, opacity 350ms ease;
        }

        .engine-label-text {
          fill: var(--arch-muted);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: 0.16em;
        }

        .engine-label-index {
          fill: var(--arch-faint);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 7px;
          letter-spacing: 0.1em;
        }

        /* Right Broad Telemetry Box (Curved, Clean, Minimalist) */
        .arch-readout-card {
          position: relative;
          min-height: 420px;
          padding: 2.25rem 2.5rem;
          border-radius: 20px;
          background: var(--arch-bg-panel);
          border: 1px solid var(--arch-border);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: border-color 0.3s ease;
        }

        [data-theme='light'] .arch-readout-card {
          box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .readout-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--arch-border);
          margin-bottom: 1.5rem;
        }

        .readout-sys-id {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: var(--arch-text);
        }

        .readout-tag-pill {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--arch-border);
          color: var(--arch-muted);
        }

        [data-theme='light'] .readout-tag-pill {
          background: #f1f5f9;
        }

        .readout-live-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #10b981;
        }

        .readout-live-status::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
          animation: status-pulse 2s infinite ease-in-out;
        }

        @keyframes status-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }

        .readout-content-main {
          margin-bottom: 1.5rem;
        }

        .readout-name {
          margin: 0;
          color: var(--arch-text);
          font-size: clamp(2rem, 3.2vw, 2.5rem);
          font-weight: 700;
          letter-spacing: -0.035em;
          line-height: 1.05;
        }

        .readout-subtitle {
          margin: 4px 0 1rem;
          color: var(--arch-muted);
          font-size: 13px;
          font-weight: 650;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readout-copy {
          margin: 0;
          color: var(--arch-muted);
          font-size: 14px;
          line-height: 1.65;
        }

        /* Technical Specifications Rows */
        .readout-specs-table {
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid var(--arch-border);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.015);
        }

        [data-theme='light'] .readout-specs-table {
          background: #fafafa;
        }

        .readout-spec-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--arch-border);
          font-size: 12.5px;
          transition: background 0.2s ease;
        }

        .readout-spec-row:last-child {
          border-bottom: none;
        }

        .readout-spec-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--arch-text);
          font-weight: 500;
        }

        .readout-spec-arrow {
          color: var(--arch-faint);
          font-family: ui-monospace, monospace;
          font-size: 11px;
        }

        .readout-spec-status {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--arch-muted);
          border: 1px solid var(--arch-border);
        }

        [data-theme='light'] .readout-spec-status {
          background: #f1f5f9;
        }

        @keyframes engine-turn {
          to { transform: rotate(360deg); }
        }

        @keyframes engine-pulse {
          0%, 100% { opacity: 0.6; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.06); }
        }

        @media (max-width: 960px) {
          .arch-pin-wrapper {
            position: relative;
            width: 100%;
            height: 240vh; /* Smooth, natural scroll travel distance on mobile touchscreens */
          }

          .arch-sticky-frame {
            position: sticky;
            top: 56px;
            height: calc(100svh - 56px);
            padding: 0.5rem 0.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }

          .arch-root {
            padding: 0 0.5rem;
          }

          .arch-header {
            margin-bottom: 0.4rem;
          }

          .arch-kicker {
            font-size: 9.5px;
            margin-bottom: 2px;
          }

          .arch-title {
            font-size: 1.15rem;
            line-height: 1.15;
          }

          .arch-subtitle {
            display: none;
          }

          .arch-layout {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            width: 100%;
            max-width: 440px;
            margin: 0 auto;
          }

          .engine-stage {
            max-height: 170px;
            width: 100%;
            margin: 0 auto;
          }

          .engine-svg {
            max-width: 260px;
            max-height: 170px;
          }

          .arch-readout-card {
            width: 100%;
            min-height: auto;
            padding: 0.75rem 0.9rem;
            border-radius: 12px;
          }

          .readout-name {
            font-size: 1.15rem;
            margin-bottom: 2px;
          }

          .readout-subtitle {
            font-size: 11px;
            margin-bottom: 4px;
          }

          .readout-copy {
            font-size: 11px;
            line-height: 1.35;
            margin-bottom: 6px;
          }

          .readout-specs-table {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }

          .readout-spec-row {
            padding: 3px 6px;
            font-size: 10px;
          }

          .engine-label-index,
          .engine-measure,
          .engine-label-line,
          .engine-label-dot,
          .engine-label-text {
            display: none;
          }
        }
      `}</style>

      <div className="arch-sticky-frame">
        <div className="arch-root">
          {/* Header */}
          <header className="arch-header">
            <div className="arch-kicker">
              <span className="arch-kicker-dot" />
              <span className="arch-kicker-bracket">[</span>
              <span>ARCHITECTURE // 05 COORDINATED LAYERS</span>
              <span className="arch-kicker-bracket">]</span>
            </div>
            <h2 className="arch-title">
              One memory system. <span>Five coordinated subsystems.</span>
            </h2>
            <p className="arch-subtitle">
              Watch raw agent activity move through Memron&apos;s protocol, knowledge, retrieval, analysis, and encrypted storage engine.
            </p>
          </header>

          <div className="arch-layout">
            {/* Left Column: 3D Exploded Diagram */}
            <div className="engine-stage">
              <svg
                className="engine-svg"
                viewBox="0 0 680 660"
                role="img"
                aria-label="Memron memory engine architecture"
              >
                <defs>
                  <filter id="tech-glow-indigo" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="tech-glow-blue" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="tech-glow-cyan" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="tech-glow-purple" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="tech-glow-emerald" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="subtle-depth" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.18" />
                  </filter>
                  <radialGradient id="core-idle" cx="50%" cy="42%" r="58%">
                    <stop offset="0%" stopColor="#8b909b" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#272b33" stopOpacity="0.04" />
                  </radialGradient>
                  <radialGradient id="core-active-hot" cx="50%" cy="42%" r="58%">
                    <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.85" />
                    <stop offset="45%" stopColor="#6366f1" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#4338ca" stopOpacity="0.08" />
                  </radialGradient>
                  <radialGradient id="core-emerald" cx="50%" cy="42%" r="58%">
                    <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.85" />
                    <stop offset="45%" stopColor="#10b981" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#047857" stopOpacity="0.08" />
                  </radialGradient>
                  <pattern id="arch-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                    <path d="M 18 0 L 0 0 0 18" fill="none" stroke="var(--arch-border)" strokeWidth="0.5" />
                  </pattern>
                </defs>

                <rect x="18" y="18" width="644" height="624" rx="14" fill="url(#arch-grid)" opacity="0.35" />
                <path className="engine-guide" d="M294 33V626" />
                <path className="engine-guide" d="M316 33V626" />
                <path className="engine-guide" d="M54 42H32V618H54" />
                <text className="engine-measure" x="29" y="334" transform="rotate(-90 29 334)">MEMRON / CONTEXT ASSEMBLY / 05 MODULES</text>
                <text className="engine-measure" x="580" y="632">SEQ 01—05</text>

                {/* Data spine */}
                {[142, 260, 378, 498].map((y, index) => {
                  const isSpineActive = active === index || active === index + 1;
                  const spineColor = isSpineActive ? moduleTones[index]?.primary || '#6366f1' : 'var(--arch-line-faint)';
                  return (
                    <g key={y} opacity={isSpineActive ? 0.95 : 0.28}>
                      <line x1="305" y1={y} x2="305" y2={y + 24} stroke={spineColor} strokeWidth="1" strokeDasharray="2 4" />
                      <circle cx="305" cy={y + 6} r={isSpineActive ? 2.6 : 1.8} fill={spineColor} />
                      <circle cx="305" cy={y + 18} r={isSpineActive ? 1.8 : 1.4} fill={spineColor} />
                    </g>
                  );
                })}

                {/* Module 01 — MCP protocol interface */}
                <g {...moduleInteraction(0)}>
                  <ellipse cx="305" cy="101" rx="102" ry="34" fill={tone(0).fill} stroke={tone(0).primary} strokeWidth="1.2" filter={tone(0).glow} />
                  <path d="M203 101v20c0 19 46 34 102 34s102-15 102-34v-20" fill={tone(0).fillStrong} stroke={tone(0).secondary} strokeWidth="1" />
                  <ellipse cx="305" cy="101" rx="82" ry="26" fill="none" stroke={tone(0).primary} strokeWidth="1.1" />
                  <ellipse cx="305" cy="101" rx="51" ry="16" fill={tone(0).fillStrong} stroke={tone(0).primary} strokeWidth="1" />
                  <ellipse className="engine-pulse" cx="305" cy="101" rx="28" ry="9" fill="none" stroke={tone(0).primary} strokeWidth="1.2" />
                  <g className="engine-rotor">
                    {Array.from({ length: 12 }).map((_, index) => {
                      const angle = (Math.PI * 2 * index) / 12;
                      const x1 = stableCoordinate(305 + Math.cos(angle) * 53);
                      const y1 = stableCoordinate(101 + Math.sin(angle) * 17);
                      const x2 = stableCoordinate(305 + Math.cos(angle) * 78);
                      const y2 = stableCoordinate(101 + Math.sin(angle) * 25);
                      return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone(0).primary} strokeWidth="0.9" opacity="0.75" />;
                    })}
                  </g>
                  <path d="M225 116c20 13 49 20 80 20s60-7 80-20M217 127c23 15 54 23 88 23s65-8 88-23" fill="none" stroke={tone(0).secondary} strokeWidth="0.8" />
                  <rect x="289" y="61" width="32" height="12" rx="3" fill={tone(0).fillStrong} stroke={tone(0).primary} />
                  <path d="M298 61v-8h14v8M302 57h6" fill="none" stroke={tone(0).primary} strokeWidth="1" />
                </g>

                {/* Module 02 — knowledge graph lattice */}
                <g {...moduleInteraction(1)}>
                  <ellipse cx="305" cy="190" rx="80" ry="23" fill={tone(1).fill} stroke={tone(1).secondary} strokeWidth="1" />
                  <path d="M236 190c6-47 34-73 69-73s63 26 69 73c-8 45-34 70-69 70s-61-25-69-70Z" fill={active === 1 ? 'url(#core-active-hot)' : 'url(#core-idle)'} stroke={tone(1).primary} strokeWidth="1.1" filter={tone(1).glow} />
                  <ellipse cx="305" cy="188" rx="68" ry="22" fill="none" stroke={tone(1).primary} strokeWidth="0.8" />
                  <ellipse cx="305" cy="188" rx="36" ry="70" fill="none" stroke={tone(1).secondary} strokeWidth="0.8" />
                  <path d="M244 158l61 30 61-30M244 218l61-30 61 30M264 129l41 59 41-59M264 247l41-59 41 59" fill="none" stroke={tone(1).primary} strokeWidth="0.85" />
                  <path d="M236 190l28-61 82 0 28 61-28 57-82 0Z" fill="none" stroke={tone(1).secondary} strokeWidth="0.75" />
                  {[
                    [305, 118], [264, 129], [346, 129], [236, 190], [305, 188], [374, 190], [264, 247], [346, 247], [305, 260], [244, 158], [366, 158], [244, 218], [366, 218],
                  ].map(([cx, cy], index) => (
                    <circle key={index} cx={cx} cy={cy} r={index === 4 ? 4 : 2.4} fill={tone(1).primary} />
                  ))}
                </g>

                {/* Module 03 — retrieval turbine */}
                <g {...moduleInteraction(2)}>
                  <ellipse cx="305" cy="321" rx="104" ry="32" fill={tone(2).fill} stroke={tone(2).primary} strokeWidth="1.1" filter={tone(2).glow} />
                  <path d="M201 321v20c0 18 47 32 104 32s104-14 104-32v-20" fill={tone(2).fillStrong} stroke={tone(2).secondary} strokeWidth="1" />
                  <ellipse cx="305" cy="321" rx="79" ry="23" fill="none" stroke={tone(2).primary} strokeWidth="1" />
                  <g className="engine-rotor">
                    {Array.from({ length: 16 }).map((_, index) => {
                      const angle = (Math.PI * 2 * index) / 16;
                      const innerX = stableCoordinate(305 + Math.cos(angle) * 30);
                      const innerY = stableCoordinate(321 + Math.sin(angle) * 9);
                      const outerX = stableCoordinate(305 + Math.cos(angle + 0.12) * 72);
                      const outerY = stableCoordinate(321 + Math.sin(angle + 0.12) * 21);
                      return (
                        <path key={index} d={`M305 321 L${innerX} ${innerY} L${outerX} ${outerY} Z`} fill={index % 2 === 0 ? tone(2).fillStrong : 'none'} stroke={tone(2).primary} strokeWidth="0.65" opacity="0.8" />
                      );
                    })}
                  </g>
                  <ellipse className="engine-pulse" cx="305" cy="321" rx="25" ry="8" fill={tone(2).fillStrong} stroke={tone(2).primary} strokeWidth="1.1" />
                  <path d="M224 340c22 12 50 18 81 18s59-6 81-18" fill="none" stroke={tone(2).secondary} strokeWidth="0.8" />
                  <rect x="292" y="271" width="26" height="28" rx="6" fill={tone(2).fillStrong} stroke={tone(2).primary} />
                  <ellipse cx="305" cy="274" rx="13" ry="5" fill="none" stroke={tone(2).primary} />
                  {[-8, -4, 0, 4, 8].map((offset) => (
                    <line key={offset} x1={305 + offset} y1="278" x2={305 + offset} y2="295" stroke={tone(2).primary} strokeWidth="0.65" />
                  ))}
                </g>

                {/* Module 04 — analysis core */}
                <g {...moduleInteraction(3)}>
                  <ellipse cx="305" cy="433" rx="91" ry="29" fill={tone(3).fill} stroke={tone(3).primary} strokeWidth="1.1" filter={tone(3).glow} />
                  <path d="M214 433v26c0 17 41 30 91 30s91-13 91-30v-26" fill={tone(3).fillStrong} stroke={tone(3).secondary} strokeWidth="1" />
                  <ellipse cx="305" cy="433" rx="68" ry="21" fill="none" stroke={tone(3).primary} />
                  <path d="M267 433l12-15 21 5 17-15 26 10-1 20-22 14-29-3Z" fill={tone(3).fillStrong} stroke={tone(3).primary} strokeWidth="1" />
                  <circle className="engine-pulse" cx="305" cy="432" r="14" fill={active === 3 ? 'url(#core-active-hot)' : 'url(#core-idle)'} stroke={tone(3).primary} strokeWidth="1.2" />
                  <circle cx="305" cy="432" r="4" fill={tone(3).primary} />
                  {[
                    [279, 418, 265, 408], [300, 423, 296, 402], [317, 417, 324, 398], [343, 418, 359, 408], [342, 438, 361, 443], [320, 452, 329, 470], [291, 449, 283, 468], [267, 433, 247, 434],
                  ].map(([x1, y1, x2, y2], index) => (
                    <g key={index}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone(3).primary} strokeWidth="0.85" />
                      <circle cx={x2} cy={y2} r={2.1} fill={tone(3).primary} />
                    </g>
                  ))}
                  <path d="M226 455c20 13 48 20 79 20s59-7 79-20" fill="none" stroke={tone(3).secondary} strokeWidth="0.8" />
                </g>

                {/* Module 05 — encrypted storage vault */}
                <g {...moduleInteraction(4)}>
                  <ellipse cx="305" cy="542" rx="119" ry="37" fill={tone(4).fill} stroke={tone(4).primary} strokeWidth="1.2" filter={tone(4).glow} />
                  <path d="M186 542v45c0 22 53 40 119 40s119-18 119-40v-45" fill={tone(4).fillStrong} stroke={tone(4).secondary} strokeWidth="1.1" />
                  <ellipse cx="305" cy="542" rx="93" ry="28" fill="none" stroke={tone(4).primary} strokeWidth="1" />
                  <ellipse cx="305" cy="542" rx="55" ry="17" fill={tone(4).fillStrong} stroke={tone(4).primary} />
                  <ellipse className="engine-pulse" cx="305" cy="542" rx="25" ry="8" fill="none" stroke={tone(4).primary} strokeWidth="1.2" />
                  <g className="engine-rotor">
                    {Array.from({ length: 14 }).map((_, index) => {
                      const angle = (Math.PI * 2 * index) / 14;
                      return <line key={index} x1="305" y1="542" x2={stableCoordinate(305 + Math.cos(angle) * 86)} y2={stableCoordinate(542 + Math.sin(angle) * 25)} stroke={tone(4).primary} strokeWidth="0.7" opacity="0.72" />;
                    })}
                  </g>
                  <path d="M199 565c24 17 63 27 106 27s82-10 106-27M199 580c24 17 63 27 106 27s82-10 106-27" fill="none" stroke={tone(4).secondary} strokeWidth="0.85" />
                  {[-72, -48, -24, 0, 24, 48, 72].map((offset, index) => (
                    <rect key={offset} x={296 + offset} y="573" width="17" height="10" rx="2.5" fill={index === 3 ? tone(4).fillStrong : 'none'} stroke={tone(4).primary} strokeWidth="0.7" />
                  ))}
                  <path d="M284 611v-14h42v14M293 604h24" fill="none" stroke={tone(4).primary} strokeWidth="1" />
                </g>

                {/* Technical side labels */}
                {modules.map((module, index) => {
                  const y = modulePositions[index];
                  const isActive = active === index;
                  const activeColor = moduleTones[index]?.primary || '#6366f1';
                  return (
                    <g
                      key={module.label}
                      className={`engine-label ${isActive ? 'is-active' : ''}`}
                      onClick={() => setActive(index)}
                      style={{ cursor: 'pointer' }}
                    >
                      <line
                        className="engine-label-line"
                        x1="422"
                        y1={y}
                        x2="493"
                        y2={y}
                        stroke={isActive ? activeColor : 'var(--arch-line-faint)'}
                        strokeWidth="0.8"
                        strokeDasharray={isActive ? undefined : '3 6'}
                        opacity={isActive ? 0.95 : 0.28}
                      />
                      <circle
                        className="engine-label-dot"
                        cx="505"
                        cy={y}
                        r={isActive ? 4 : 2}
                        fill={isActive ? activeColor : 'var(--arch-line-faint)'}
                        opacity={isActive ? 1 : 0.45}
                      />
                      <text
                        className="engine-label-index"
                        x="521"
                        y={y - 7}
                        fill={isActive ? activeColor : 'var(--arch-faint)'}
                      >
                        {String(index + 1).padStart(2, '0')} / 05
                      </text>
                      <text
                        className="engine-label-text"
                        x="521"
                        y={y + 6}
                        fill={isActive ? activeColor : 'var(--arch-muted)'}
                      >
                        {module.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Right Column: Broad, Curved Telemetry Card (No Bottom Line Navigation) */}
            <aside className="arch-readout-card" aria-live="polite">
              <div>
                {/* Meta Row: Clean System ID + Status */}
                <div className="readout-meta-row">
                  <div className="readout-sys-id">
                    <span>MODULE {currentMod.id} / 05</span>
                    <span className="readout-tag-pill">{currentMod.tag}</span>
                  </div>
                  <div className="readout-live-status">
                    <span>ONLINE</span>
                  </div>
                </div>

                {/* Subsystem Title & Core Detail */}
                <div className="readout-content-main">
                  <h3 className="readout-name">{currentMod.label}</h3>
                  <div className="readout-subtitle" style={{ color: currentTone.tagColor }}>
                    {currentMod.shortLabel}
                  </div>
                  <p className="readout-copy">{currentMod.detail}</p>
                </div>
              </div>

              {/* Technical Specifications Rows */}
              <div className="readout-specs-table">
                {currentMod.features.map((feature, i) => (
                  <div className="readout-spec-row" key={i}>
                    <div className="readout-spec-label">
                      <span className="readout-spec-arrow">›</span>
                      <span>{feature.name}</span>
                    </div>
                    <span className="readout-spec-status">{feature.status}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
