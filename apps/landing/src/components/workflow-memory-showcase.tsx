'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface ShowcaseItem {
  number: string;
  title: string;
  description: string;
  tag: string;
}

interface ShowcaseTab {
  id: string;
  label: string;
  items: ShowcaseItem[];
  buttonText: string;
}

const showcaseTabs: ShowcaseTab[] = [
  {
    id: 'dev-agents',
    label: 'Developer Agents',
    buttonText: 'Explore Memron for Developer Agents',
    items: [
      {
        number: '01',
        title: 'Cross-Session Bug Recall',
        description:
          'Remembers previous failed attempts, tricky edge cases, and runtime workarounds across debugging sessions so your agent never repeats mistakes.',
        tag: 'Persistent Recall',
      },
      {
        number: '02',
        title: 'Codebase Conventions Tracker',
        description:
          'Maintains team styling preferences, lint rules, and architectural guidelines, automatically guiding agent generation to match your standards.',
        tag: 'Rules Enforced',
      },
      {
        number: '03',
        title: 'Persistent Architecture Ledger',
        description:
          'Preserves decisions made in planning sessions, schema changes, and API contracts so follow-up tasks stay aligned with the master architecture.',
        tag: 'Zero Drift',
      },
    ],
  },
  {
    id: 'handoffs',
    label: 'Multi-Agent Handoffs',
    buttonText: 'Explore Multi-Agent Handoffs',
    items: [
      {
        number: '01',
        title: 'Seamless IDE-to-CLI Transfer',
        description:
          'Hand off unfinished tasks between Claude Code in terminal and Cursor in your editor without manual prompt re-explaining or copy-pasting.',
        tag: 'Zero Handoff Loss',
      },
      {
        number: '02',
        title: 'Zero-Drift Context Bridge',
        description:
          'Synchronizes decisions, modified files, and test results across independent agent instances in real time via Model Context Protocol.',
        tag: 'Live Sync',
      },
      {
        number: '03',
        title: 'Cross-Runtime State Sync',
        description:
          'Whether running local CLI models, cloud agents, or background workers, every assistant accesses the exact same unified context graph.',
        tag: 'Unified Graph',
      },
    ],
  },
  {
    id: 'compression',
    label: 'Context Compression',
    buttonText: 'Explore Context Compression',
    items: [
      {
        number: '01',
        title: '3-Token Memory Pointers',
        description:
          'Replaces replaying 15,000 raw chat tokens with compact, high-precision pointers that slash token burn by ~90% per query.',
        tag: '~90% Token Cut',
      },
      {
        number: '02',
        title: 'Hierarchical Summarization',
        description:
          'Compresses long conversations into structured episodic and procedural memory layers, preserving critical insights with minimal footprint.',
        tag: 'Smart Layers',
      },
      {
        number: '03',
        title: 'Predictive Context Prefetch',
        description:
          'Predicts the exact facts, functions, and documentation your agent will need for the next step, loading them in under 15ms.',
        tag: '< 15ms Prefetch',
      },
    ],
  },
  {
    id: 'verification',
    label: 'Anti-Hallucination',
    buttonText: 'Explore Anti-Hallucination Guard',
    items: [
      {
        number: '01',
        title: 'Dual-Layer Truth Verification',
        description:
          'Cross-checks generated statements against verified ground-truth memory, instantly flagging ungrounded claims before execution.',
        tag: 'Verified Evidence',
      },
      {
        number: '02',
        title: 'Confidence Scoring per Claim',
        description:
          'Scores the factual validity of agent actions against past empirical runs, assigning clear confidence thresholds to decisions.',
        tag: '99.4% Precision',
      },
      {
        number: '03',
        title: 'Cryptographic Audit Trail',
        description:
          'Every memory fact is linked to source git commit hashes and tamper-proof SHA-256 signatures for verifiable compliance.',
        tag: 'Audit Provenance',
      },
    ],
  },
  {
    id: 'security',
    label: 'Enterprise Security',
    buttonText: 'Explore Enterprise Security',
    items: [
      {
        number: '01',
        title: 'Zero-Knowledge AES-256-GCM',
        description:
          'All memory vectors and semantic entities are encrypted at rest with hardware-backed keys, ensuring complete tenant isolation.',
        tag: 'AES-256-GCM',
      },
      {
        number: '02',
        title: 'Self-Hosted & Sovereign',
        description:
          'Deploy entirely within your VPC or private cloud on PostgreSQL with pgvector. Your proprietary code never leaves your infrastructure.',
        tag: 'Air-Gapped Ready',
      },
      {
        number: '03',
        title: 'Fine-Grained Access Scoping',
        description:
          'Role-based permissions and workspace scoping guarantee agents only access the memory layers relevant to their authorized role.',
        tag: 'RBAC Scoped',
      },
    ],
  },
];

export function WorkflowMemoryShowcase() {
  const [activeTabId, setActiveTabId] = useState<string>('dev-agents');

  const activeTab =
    showcaseTabs.find((tab) => tab.id === activeTabId) || showcaseTabs[0];

  return (
    <section id="features" className="workflow-showcase-section">
      <div className="workflow-showcase-container">
        {/* Top Centered Brand Pet Mascot Badge */}
        <div className="workflow-pet-chip" title="Memron AI Memory Mascot">
          <Image
            src="/logo_w.png"
            alt="Memron Pet Mascot"
            width={26}
            height={26}
            className="logo-light"
            priority
          />
          <Image
            src="/logo_b.png"
            alt="Memron Pet Mascot"
            width={26}
            height={26}
            className="logo-dark"
            priority
          />
        </div>

        {/* Clean Expressive Headline */}
        <h2 className="workflow-showcase-title">
          AI memory that adapts
          <br />
          to your workflow
        </h2>

        {/* Crisp Subtitle */}
        <p className="workflow-showcase-subtitle">
          Memron helps your AI agents remember what matters.
        </p>

        {/* Horizontal Category Tabs */}
        <div className="workflow-tabs-bar">
          {showcaseTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`workflow-tab-item ${
                activeTabId === tab.id ? 'active' : ''
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Horizontal Strip Stack (Horizontal Layout, Grey-Black Family) */}
        <div className="workflow-horizontal-stack">
          {activeTab.items.map((item, idx) => (
            <div key={idx} className="workflow-horizontal-row">
              {/* Left Index Badge */}
              <div className="row-index-pill">{item.number}</div>

              {/* Title & Tag */}
              <div className="row-title-block">
                <h3 className="row-title">{item.title}</h3>
                <span className="row-tag">{item.tag}</span>
              </div>

              {/* Horizontal Description */}
              <p className="row-desc">{item.description}</p>

              {/* Subtle Indicator Arrow */}
              <div className="row-arrow-chip">
                <span>→</span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA Button */}
        <div className="workflow-cta-row">
          <Link href="/login" className="workflow-cta-btn">
            {activeTab.buttonText}
            <span className="cta-arrow">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
