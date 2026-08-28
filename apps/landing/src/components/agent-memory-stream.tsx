'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  siCursor,
  siClaude,
  siGithubcopilot,
  siGooglegemini,
  siDeepseek,
  siMistralai,
  siOllama,
  siPostgresql,
  siSupabase,
  siNeo4j,
  siQdrant,
  siMilvus,
  siRedis,
  siLangchain,
  siDocker,
  siPython,
  siReplit,
  siVercel,
} from 'simple-icons';

// Track 1: Agents & Environments (Scrolls LEFT) — Real brand icons, ZERO emojis
const agentsList = [
  { name: 'Cursor IDE', si: siCursor, color: '#38bdf8' },
  { name: 'Claude Code', si: siClaude, color: '#d97706' },
  { name: 'VS Code', icon: '/icons/vscode.svg', isImg: true },
  { name: 'Windsurf IDE', icon: '/icons/windsurf.png', isImg: true },
  { name: 'Cline', icon: '/icons/cline.svg', isImg: true },
  { name: 'GitHub Copilot', si: siGithubcopilot, color: '#22c55e' },
  { name: 'OpenAI Codex', icon: '/icons/openai.svg', isImg: true },
  { name: 'Warp Terminal', icon: '/icons/warp.svg', isImg: true },
  { name: 'Google Gemini', si: siGooglegemini, color: '#4285f4' },
  { name: 'Qwen Code', icon: '/icons/qwen.svg', isImg: true },
  { name: 'Docker Agent', si: siDocker, color: '#2496ed' },
  { name: 'Python Runtime', si: siPython, color: '#3776ab' },
  { name: 'Replit Agent', si: siReplit, color: '#f26207' },
  { name: 'Vercel AI SDK', si: siVercel, color: 'currentColor' },
  { name: 'Memron Protocol', isMemronLogo: true },
];

// Track 2: Models, Protocols & Vector Stores (Scrolls RIGHT) — Real brand icons, ZERO emojis
const modelsList = [
  { name: 'Model Context Protocol (MCP)', icon: '/icons/mcp.svg', isImg: true },
  { name: 'OpenAI GPT-4o', icon: '/icons/openai.svg', isImg: true },
  { name: 'Claude 3.5 Sonnet', si: siClaude, color: '#d97706' },
  { name: 'DeepSeek V3 / R1', si: siDeepseek, color: '#4d6bfe' },
  { name: 'Google Gemini 1.5 Pro', si: siGooglegemini, color: '#4285f4' },
  { name: 'Mistral Large', si: siMistralai, color: '#f97316' },
  { name: 'Ollama Engine', si: siOllama, color: 'currentColor' },
  { name: 'PostgreSQL + pgvector', si: siPostgresql, color: '#4169e1' },
  { name: 'Supabase Vector', si: siSupabase, color: '#3ecf8e' },
  { name: 'Neo4j Graph Database', si: siNeo4j, color: '#018bff' },
  { name: 'Qdrant Vector Engine', si: siQdrant, color: '#dc2626' },
  { name: 'Milvus Distributed Vector', si: siMilvus, color: '#00a1ea' },
  { name: 'Redis Context Cache', si: siRedis, color: '#ff4438' },
  { name: 'LangChain Framework', si: siLangchain, color: '#2ba37a' },
];

// 4x repeating sets for seamless infinite loop (0% to -25%) without any gap on any screen width
const seamlessAgents = [...agentsList, ...agentsList, ...agentsList, ...agentsList];
const seamlessModels = [...modelsList, ...modelsList, ...modelsList, ...modelsList];

export function AgentMemoryStream() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => { });
    }
  }, []);

  return (
    <section id="agents" className="memory-stream-section">
      <div className="memory-stream-container">
        {/* 2-Column Split: Text Left / Small Video Right */}
        <div className="memory-stream-hero-grid">
          {/* Left Side: Header, Title, Subtitle, CTA */}
          <div className="memory-stream-left">
            <div className="memory-stream-badge">
              <span>[ 01 // CONTEXT BACKBONE & AGENT WIRE ]</span>
            </div>

            <h2 className="memory-stream-title">
              One memory for every agent
              <br />
              that touches the work.
            </h2>

            <p className="memory-stream-desc">
              Claude saves the decision and the next step. Memron resolves what changed.
              Cursor and Codex continue with the context they need.
            </p>

            <div className="memory-stream-actions">
              <Link href="/login" className="memory-stream-btn-primary">
                Connect an agent
                <span className="action-arrow">↗</span>
              </Link>
            </div>
          </div>

          {/* Right Side: Very Small Video in Size (Autoplay, Loop, Non-clickable, Protected) */}
          <div className="memory-stream-video-card">
            <div className="video-card-glass-frame">
              <video
                ref={videoRef}
                src="/section1.webm"
                autoPlay
                loop
                muted
                playsInline
                controls={false}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                className="memory-stream-video"
                aria-hidden="true"
                tabIndex={-1}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dual Opposing Infinite Marquee Streams (Seamless Infinite Loops) */}
      <div className="stream-marquee-section" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
        {/* Row 1: Agents & Environments — Scrolling LEFT */}
        <div className="marquee-group">
          <span className="marquee-group-label">AGENTS & WORKSPACES</span>
          <div className="marquee-container">
            <div className="marquee-track-left">
              {seamlessAgents.map((item, idx) => (
                <div key={idx} className="marquee-tech-card" title={item.name}>
                  {item.isMemronLogo ? (
                    <>
                      <Image
                        src="/logo_w.png"
                        alt="Memron"
                        width={24}
                        height={24}
                        className="logo-light marquee-tech-icon"
                      />
                      <Image
                        src="/logo_b.png"
                        alt="Memron"
                        width={24}
                        height={24}
                        className="logo-dark marquee-tech-icon"
                      />
                    </>
                  ) : item.isImg ? (
                    <Image
                      src={item.icon!}
                      alt={item.name}
                      width={24}
                      height={24}
                      className="marquee-tech-icon"
                    />
                  ) : item.si ? (
                    <svg
                      role="img"
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill={item.color || 'currentColor'}
                      className="marquee-tech-icon"
                      aria-label={item.name}
                    >
                      <path d={item.si.path} />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Models, Protocols & Vector Stores — Scrolling RIGHT */}
        <div className="marquee-group" style={{ marginBottom: '0.5rem' }}>
          <span className="marquee-group-label">MODELS, PROTOCOLS & VECTOR ENGINES</span>
          <div className="marquee-container">
            <div className="marquee-track-right">
              {seamlessModels.map((item, idx) => (
                <div key={idx} className="marquee-tech-card" title={item.name}>
                  {item.isImg ? (
                    <Image
                      src={item.icon!}
                      alt={item.name}
                      width={24}
                      height={24}
                      className="marquee-tech-icon"
                    />
                  ) : item.si ? (
                    <svg
                      role="img"
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill={item.color || 'currentColor'}
                      className="marquee-tech-icon"
                      aria-label={item.name}
                    >
                      <path d={item.si.path} />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
