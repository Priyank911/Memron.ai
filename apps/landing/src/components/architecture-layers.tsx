'use client';

import React, { useEffect, useState } from 'react';

const modules = [
  {
    label: 'MCP TOOLS',
    shortLabel: 'Protocol interface',
    detail: 'A universal control ring connects Claude, Cursor, VS Code, and every MCP-compatible agent to the same memory surface.',
    features: ['41 callable memory tools', 'JSON-RPC agent bridge', 'Live capability negotiation'],
  },
  {
    label: 'KNOWLEDGE',
    shortLabel: 'Graph lattice',
    detail: 'Entities and relationships crystallize into a living knowledge lattice that strengthens as agents complete more work.',
    features: ['Entity relationship mapping', 'Cross-session correlation', 'Automatic pattern distillation'],
  },
  {
    label: 'RETRIEVAL',
    shortLabel: 'Context turbine',
    detail: 'A relevance turbine compresses the graph into compact, confidence-scored context packets before every model call.',
    features: ['Semantic confidence scoring', '~90% token compression', 'Multi-hop context routing'],
  },
  {
    label: 'ANALYSIS',
    shortLabel: 'Reasoning core',
    detail: 'A six-stage analysis core separates episodes, extracts durable memories, and validates every trajectory before storage.',
    features: ['Episode segmentation', 'Intent and action extraction', 'Trajectory validation'],
  },
  {
    label: 'STORAGE',
    shortLabel: 'Encrypted vault',
    detail: 'The engine rests on an encrypted vector vault built for durable, private memory across projects, agents, and sessions.',
    features: ['AES-256-GCM encryption', 'PostgreSQL + pgvector', 'Lifecycle-managed memory'],
  },
];

const modulePositions = [88, 200, 318, 436, 558];

export function ArchitectureLayers() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    const interval = window.setInterval(() => {
      setActive((current) => (current + 1) % modules.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, []);

  const tone = (index: number) => {
    const isActive = active === index;
    return {
      primary: isActive ? '#ff642e' : 'var(--engine-line)',
      secondary: isActive ? '#c93b14' : 'var(--engine-line-soft)',
      fill: isActive ? 'rgba(255, 100, 46, 0.18)' : 'var(--engine-fill)',
      fillStrong: isActive ? 'rgba(255, 100, 46, 0.34)' : 'var(--engine-fill-strong)',
      glow: isActive ? 'url(#orange-glow)' : 'url(#soft-shadow)',
    };
  };

  const moduleInteraction = (index: number) => ({
    className: `engine-module engine-module-${index + 1} ${active === index ? 'is-active' : ''}`,
    onClick: () => setActive(index),
    onMouseEnter: () => setActive(index),
    onFocus: () => setActive(index),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActive(index);
      }
    },
    role: 'button',
    tabIndex: 0,
    'aria-label': `Show ${modules[index].label.toLowerCase()} layer`,
    style: { '--assembly-delay': `${index * 120}ms` } as React.CSSProperties,
  });

  return (
    <div className="arch-root">
      <style>{`
        .arch-root {
          --arch-text: #f7f7f8;
          --arch-muted: #8f929c;
          --arch-faint: #555963;
          --arch-panel: rgba(17, 17, 20, 0.82);
          --arch-border: rgba(255, 255, 255, 0.10);
          --engine-line: #777d89;
          --engine-line-soft: #444a55;
          --engine-fill: rgba(97, 104, 118, 0.08);
          --engine-fill-strong: rgba(97, 104, 118, 0.16);
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          color: var(--arch-text);
          font-family: var(--font-bricolage), 'Bricolage Grotesque', system-ui, sans-serif;
        }

        [data-theme='light'] .arch-root {
          --arch-text: #10141c;
          --arch-muted: #414a59;
          --arch-faint: #687386;
          --arch-panel: rgba(255, 255, 255, 0.98);
          --arch-border: rgba(30, 41, 59, 0.26);
          --engine-line: #3f4a5c;
          --engine-line-soft: #667286;
          --engine-fill: rgba(51, 65, 85, 0.14);
          --engine-fill-strong: rgba(51, 65, 85, 0.24);
        }

        .arch-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 2.25rem;
          text-align: center;
        }

        .arch-kicker {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 12px;
          color: #ff642e;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .arch-kicker::before {
          width: 22px;
          height: 1px;
          background: currentColor;
          content: '';
        }

        .arch-title {
          max-width: 720px;
          margin: 0;
          color: var(--arch-text);
          font-size: clamp(2rem, 4vw, 3.15rem);
          font-weight: 650;
          letter-spacing: -0.045em;
          line-height: 1.02;
        }

        .arch-title span {
          color: var(--arch-muted);
        }

        .arch-subtitle {
          max-width: 540px;
          margin: 14px 0 0;
          color: var(--arch-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .arch-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.75fr);
          align-items: center;
          gap: clamp(1.5rem, 4vw, 4rem);
        }

        .engine-stage {
          position: relative;
          min-width: 0;
        }

        .engine-stage::before {
          position: absolute;
          inset: 8% 12% 6%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 100, 46, 0.06), transparent 67%);
          content: '';
          filter: blur(28px);
          pointer-events: none;
        }

        .engine-svg {
          position: relative;
          display: block;
          width: 100%;
          height: auto;
          overflow: visible;
        }

        .engine-module {
          cursor: pointer;
          outline: none;
          transform-box: fill-box;
          transform-origin: center;
          animation: engine-assemble 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: var(--assembly-delay);
        }

        .engine-module > * {
          transition: fill 520ms ease, stroke 520ms ease, opacity 520ms ease, filter 520ms ease;
        }

        .engine-module.is-active {
          filter: drop-shadow(0 0 12px rgba(255, 100, 46, 0.28));
        }

        .engine-module:focus-visible {
          filter: drop-shadow(0 0 8px rgba(255, 100, 46, 0.65));
        }

        .engine-module.is-active .engine-rotor {
          animation: engine-turn 10s linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .engine-module.is-active .engine-pulse {
          animation: engine-pulse 1.8s ease-in-out infinite;
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
          transition: fill 520ms ease, stroke 520ms ease, opacity 520ms ease;
        }

        .engine-label-text {
          fill: var(--arch-muted);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: 0.18em;
        }

        .engine-label-index {
          fill: var(--arch-faint);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 7px;
          letter-spacing: 0.1em;
        }

        .engine-label.is-active .engine-label-text,
        .engine-label.is-active .engine-label-index {
          fill: #ff642e;
        }

        .engine-label.is-active .engine-label-line {
          stroke: #ff642e;
          opacity: 0.85;
        }

        .engine-label.is-active .engine-label-dot {
          fill: #ff642e;
          filter: url(#orange-glow);
        }

        .arch-readout {
          position: relative;
          min-height: 400px;
          overflow: hidden;
          padding: 2rem;
          border: 1px solid var(--arch-border);
          border-radius: 2px 22px 2px 2px;
          background: var(--arch-panel);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(18px);
        }

        .arch-readout::before {
          position: absolute;
          top: 0;
          left: 0;
          width: 82px;
          height: 2px;
          background: #ff642e;
          content: '';
        }

        .arch-readout::after {
          position: absolute;
          right: -38px;
          bottom: -38px;
          width: 120px;
          height: 120px;
          border: 1px solid var(--arch-border);
          border-radius: 50%;
          content: '';
        }

        .readout-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2.2rem;
          color: var(--arch-faint);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .readout-live {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #ff642e;
        }

        .readout-live::before {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 4px rgba(255, 100, 46, 0.12);
          content: '';
        }

        .readout-index {
          margin-bottom: 0.65rem;
          color: #ff642e;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.2em;
        }

        .readout-name {
          margin: 0;
          color: var(--arch-text);
          font-size: clamp(1.55rem, 2.6vw, 2.15rem);
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.05;
        }

        .readout-subtitle {
          margin: 6px 0 1.2rem;
          color: var(--arch-muted);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readout-copy {
          min-height: 68px;
          margin: 0 0 1.4rem;
          color: var(--arch-muted);
          font-size: 13px;
          line-height: 1.62;
        }

        .readout-features {
          display: grid;
          gap: 0;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--arch-border);
          list-style: none;
        }

        .readout-feature {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--arch-border);
          color: var(--arch-muted);
          font-size: 11px;
        }

        .readout-feature::before {
          width: 13px;
          height: 1px;
          background: #ff642e;
          content: '';
        }

        .readout-progress {
          position: absolute;
          right: 2rem;
          bottom: 1.6rem;
          left: 2rem;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }

        .readout-step {
          height: 2px;
          padding: 0;
          border: 0;
          background: var(--arch-border);
          cursor: pointer;
          transition: background 300ms ease, transform 300ms ease;
        }

        .readout-step.is-active {
          background: #ff642e;
          transform: scaleY(2);
        }

        @keyframes engine-assemble {
          from { opacity: 0; transform: translateY(-22px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes engine-turn {
          to { transform: rotate(360deg); }
        }

        @keyframes engine-pulse {
          0%, 100% { opacity: 0.6; transform: scale(0.94); }
          50% { opacity: 1; transform: scale(1.08); }
        }

        @media (max-width: 900px) {
          .arch-layout {
            grid-template-columns: 1fr;
          }

          .engine-stage {
            max-width: 680px;
            margin: 0 auto;
          }

          .arch-readout {
            width: min(100%, 600px);
            min-height: 370px;
            margin: 0 auto;
          }
        }

        @media (max-width: 600px) {
          .arch-header {
            margin-bottom: 1rem;
          }

          .arch-title {
            font-size: 1.75rem;
          }

          .arch-subtitle {
            font-size: 12px;
          }

          .engine-label-text {
            font-size: 8px;
          }

          .engine-label-index,
          .engine-measure {
            display: none;
          }

          .arch-readout {
            min-height: 390px;
            padding: 1.5rem;
          }

          .readout-progress {
            right: 1.5rem;
            bottom: 1.35rem;
            left: 1.5rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .engine-module,
          .engine-module.is-active .engine-rotor,
          .engine-module.is-active .engine-pulse {
            animation: none;
          }
        }
      `}</style>

      <header className="arch-header">
        <div className="arch-kicker">Memory engine / live sequence</div>
        <h2 className="arch-title">
          One memory system. <span>Five coordinated subsystems.</span>
        </h2>
        <p className="arch-subtitle">
          Watch raw agent activity move through Memron&apos;s protocol, knowledge, retrieval, analysis, and encrypted storage engine.
        </p>
      </header>

      <div className="arch-layout">
        <div className="engine-stage">
          <svg
            className="engine-svg"
            viewBox="0 0 680 660"
            role="img"
            aria-labelledby="memory-engine-title memory-engine-description"
          >
            <title id="memory-engine-title">Memron memory engine architecture</title>
            <desc id="memory-engine-description">
              Five exploded technical modules illuminate in sequence from MCP tools to encrypted storage.
            </desc>

            <defs>
              <filter id="orange-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000000" floodOpacity="0.22" />
              </filter>
              <radialGradient id="core-idle" cx="50%" cy="42%" r="58%">
                <stop offset="0%" stopColor="#8b909b" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#272b33" stopOpacity="0.04" />
              </radialGradient>
              <radialGradient id="core-hot" cx="50%" cy="42%" r="58%">
                <stop offset="0%" stopColor="#ff9b76" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#ff642e" stopOpacity="0.12" />
              </radialGradient>
              <pattern id="micro-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M 18 0 L 0 0 0 18" fill="none" stroke="var(--arch-border)" strokeWidth="0.5" />
              </pattern>
            </defs>

            <rect x="18" y="18" width="644" height="624" rx="10" fill="url(#micro-grid)" opacity="0.45" />
            <path className="engine-guide" d="M294 33V626" />
            <path className="engine-guide" d="M316 33V626" />
            <path className="engine-guide" d="M54 42H32V618H54" />
            <text className="engine-measure" x="29" y="334" transform="rotate(-90 29 334)">MEMRON / CONTEXT ASSEMBLY / 05 MODULES</text>
            <text className="engine-measure" x="580" y="632">SEQ 01—05</text>

            {/* Data spine between the exploded modules */}
            {[142, 260, 378, 498].map((y, index) => (
              <g key={y} opacity={active === index || active === index + 1 ? 0.9 : 0.28}>
                <line x1="305" y1={y} x2="305" y2={y + 24} stroke={active === index || active === index + 1 ? '#ff642e' : 'var(--engine-line-soft)'} strokeWidth="1" strokeDasharray="2 4" />
                <circle cx="305" cy={y + 6} r="2.4" fill={active === index || active === index + 1 ? '#ff642e' : 'var(--engine-line-soft)'} />
                <circle cx="305" cy={y + 18} r="1.5" fill={active === index || active === index + 1 ? '#ff642e' : 'var(--engine-line-soft)'} />
              </g>
            ))}

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
                  const x1 = 305 + Math.cos(angle) * 53;
                  const y1 = 101 + Math.sin(angle) * 17;
                  const x2 = 305 + Math.cos(angle) * 78;
                  const y2 = 101 + Math.sin(angle) * 25;
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
              <path d="M236 190c6-47 34-73 69-73s63 26 69 73c-8 45-34 70-69 70s-61-25-69-70Z" fill={active === 1 ? 'url(#core-hot)' : 'url(#core-idle)'} stroke={tone(1).primary} strokeWidth="1.1" filter={tone(1).glow} />
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
                  const innerX = 305 + Math.cos(angle) * 30;
                  const innerY = 321 + Math.sin(angle) * 9;
                  const outerX = 305 + Math.cos(angle + 0.12) * 72;
                  const outerY = 321 + Math.sin(angle + 0.12) * 21;
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
              <circle className="engine-pulse" cx="305" cy="432" r="14" fill={active === 3 ? 'url(#core-hot)' : 'url(#core-idle)'} stroke={tone(3).primary} strokeWidth="1.2" />
              <circle cx="305" cy="432" r="4" fill={tone(3).primary} />
              {[
                [279, 418, 265, 408], [300, 423, 296, 402], [317, 417, 324, 398], [343, 418, 359, 408], [342, 438, 361, 443], [320, 452, 329, 470], [291, 449, 283, 468], [267, 433, 247, 434],
              ].map(([x1, y1, x2, y2], index) => (
                <g key={index}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone(3).primary} strokeWidth="0.85" />
                  <circle cx={x2} cy={y2} r="2.1" fill={tone(3).primary} />
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
                  return <line key={index} x1="305" y1="542" x2={305 + Math.cos(angle) * 86} y2={542 + Math.sin(angle) * 25} stroke={tone(4).primary} strokeWidth="0.7" opacity="0.72" />;
                })}
              </g>
              <path d="M199 565c24 17 63 27 106 27s82-10 106-27M199 580c24 17 63 27 106 27s82-10 106-27" fill="none" stroke={tone(4).secondary} strokeWidth="0.85" />
              {[-72, -48, -24, 0, 24, 48, 72].map((offset, index) => (
                <rect key={offset} x={296 + offset} y="573" width="17" height="10" rx="2" fill={index === 3 ? tone(4).fillStrong : 'none'} stroke={tone(4).primary} strokeWidth="0.7" />
              ))}
              <path d="M284 611v-14h42v14M293 604h24" fill="none" stroke={tone(4).primary} strokeWidth="1" />
            </g>

            {/* Aligned technical labels */}
            {modules.map((module, index) => {
              const y = modulePositions[index];
              const isActive = active === index;
              return (
                <g
                  key={module.label}
                  className={`engine-label ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActive(index)}
                  style={{ cursor: 'pointer' }}
                >
                  <line className="engine-label-line" x1="422" y1={y} x2="493" y2={y} stroke="var(--arch-faint)" strokeWidth="0.8" strokeDasharray={isActive ? undefined : '3 6'} opacity={isActive ? 0.85 : 0.28} />
                  <circle className="engine-label-dot" cx="505" cy={y} r={isActive ? 4.5 : 2.5} fill="var(--arch-faint)" opacity={isActive ? 1 : 0.55} />
                  <text className="engine-label-index" x="521" y={y - 7}>{String(index + 1).padStart(2, '0')} / 05</text>
                  <text className="engine-label-text" x="521" y={y + 6}>{module.label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="arch-readout" aria-live="polite">
          <div className="readout-status">
            <span>Component telemetry</span>
            <span className="readout-live">cycling</span>
          </div>
          <div className="readout-index">MODULE {String(active + 1).padStart(2, '0')} / 05</div>
          <h3 className="readout-name">{modules[active].label}</h3>
          <div className="readout-subtitle">{modules[active].shortLabel}</div>
          <p className="readout-copy">{modules[active].detail}</p>
          <ul className="readout-features">
            {modules[active].features.map((feature) => (
              <li className="readout-feature" key={feature}>{feature}</li>
            ))}
          </ul>
          <div className="readout-progress" aria-label="Select architecture module">
            {modules.map((module, index) => (
              <button
                type="button"
                key={module.label}
                className={`readout-step ${active === index ? 'is-active' : ''}`}
                onClick={() => setActive(index)}
                aria-label={`Show ${module.label.toLowerCase()}`}
                aria-pressed={active === index}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
