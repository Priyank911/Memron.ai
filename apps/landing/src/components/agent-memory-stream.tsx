'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export function AgentMemoryStream() {
  const nodes = [
    {
      id: 1,
      name: 'Claude',
      icon: '/icons/claude-ai.png',
      isImage: true,
    },
    {
      id: 2,
      name: 'Memron',
      icon: '/logo_w.png',
      isLogo: true,
    },
    {
      id: 3,
      name: 'Memory',
      isSvg: true,
    },
    {
      id: 4,
      name: 'Cursor',
      icon: '/icons/cursor-ai.png',
      isImage: true,
    },
  ];

  return (
    <section id="agents" className="memory-stream-section">
      <div className="memory-stream-container">
        {/* Category Pill */}
        <span className="memory-stream-badge">Agent Context Backbone</span>

        {/* Clean Centered Title */}
        <h2 className="memory-stream-title">
          One memory for every agent
          <br />
          that touches the work.
        </h2>

        {/* Concise Subtitle */}
        <p className="memory-stream-desc">
          Claude saves the decision and the next step. Memron resolves what changed.
          Cursor and Codex continue with the context they need.
        </p>

        {/* Clean Floating Agent Memory Dock (Matching Image 1 Reference) */}
        <div className="memory-pipeline-dock">
          <div className="pipeline-nodes-track">
            {nodes.map((node, index) => (
              <React.Fragment key={node.id}>
                <div className="pipeline-node-chip" title={node.name}>
                  <div className="pipeline-node-icon">
                    {node.isLogo ? (
                      <>
                        <Image
                          src="/logo_w.png"
                          alt="Memron"
                          width={22}
                          height={22}
                          className="logo-light"
                          priority
                        />
                        <Image
                          src="/logo_b.png"
                          alt="Memron"
                          width={22}
                          height={22}
                          className="logo-dark"
                          priority
                        />
                      </>
                    ) : node.isSvg ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="2.2"
                        width="20"
                        height="20"
                      >
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        <circle cx="6.5" cy="17.5" r="2.5" fill="#f97316" />
                      </svg>
                    ) : (
                      <Image
                        src={node.icon!}
                        alt={node.name}
                        width={22}
                        height={22}
                        priority
                      />
                    )}
                  </div>
                </div>

                {index < nodes.length - 1 && (
                  <span className="pipeline-flow-arrow">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Focused Single CTA Button */}
        <div className="memory-stream-actions">
          <Link href="/login" className="memory-stream-btn-primary">
            Connect an agent
            <span className="action-arrow">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
