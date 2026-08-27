import Image from 'next/image';
import { HeroFloatingArt } from '@/components/hero-floating-art';
import { SectionDivider } from '@/components/section-divider';
import { AgentMemoryStream } from '@/components/agent-memory-stream';
import { WorkflowMemoryShowcase } from '@/components/workflow-memory-showcase';
import { ArchitectureLayers } from '@/components/architecture-layers';
import { FlowchartCard } from '@/components/flowchart-card';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section id="hero" className="hero-section">
        <div className="hero-container">
          {/* Left Content */}
          <div className="hero-content">
            <a
              href="/login"
              className="hero-announcement-pill"
            >
              <span className="announcement-pill-badge">Coming Soon</span>
              <span className="announcement-pill-text">Ready to save your context</span>
              <span className="announcement-pill-arrow">→</span>
            </a>

            <h1 className="hero-title-clean">
              Persistent memory for every AI agent.
            </h1>

            <p className="hero-description-clean">
              Memron turns raw conversations into structured, encrypted memory. Stop token waste by ~90%, eliminate hallucinations, and seamlessly share context across Claude, Cursor, and any MCP agent.
            </p>

            <div className="hero-cta-group">
              <a href="/login" className="hero-primary-btn">
                Get Early Access
                <span className="btn-arrow">↗</span>
              </a>
              <a
                href="/docs"
                className="hero-secondary-btn"
              >
                Explore Docs & MCP
                <span className="btn-arrow">→</span>
              </a>
            </div>
          </div>

          {/* Right Content - 3D Floating Theme-Adaptive Art */}
          <div className="hero-right">
            <HeroFloatingArt />
          </div>
        </div>
      </section>

      {/* Main Technical Grid Frame with Vertical Boundary Guide Lines */}
      <div className="tech-blueprint-frame">
        {/* Section 01: Agent Context Backbone */}
        <SectionDivider number="01" tag="CONTEXT BACKBONE" index="1/3" />
        <AgentMemoryStream />

        {/* Section 02: Adaptive Workflow Memory */}
        <SectionDivider number="02" tag="ADAPTIVE WORKFLOW" index="2/3" />
        <WorkflowMemoryShowcase />

        {/* Section 03: 7-Layer Architecture */}
        <SectionDivider number="03" tag="7-LAYER ARCHITECTURE" index="3/3" />
        <section id="architecture" className="features-section architecture-section-mobile" style={{ paddingTop: '4rem', paddingBottom: '3rem' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
            <ArchitectureLayers />
          </div>
        </section>
      </div>

      {/* Section 04: Flowchart Showcase (Scroll Enlarge Effect, Borderless Section) */}
      <section id="team" className="showcase-section">
        <FlowchartCard />
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-left">
            <div className="footer-logo">
              <img src="/logo_w.png" alt="Memron" className="footer-logo-icon" />
              <span className="footer-brand">Memron</span>
            </div>
            <p className="footer-tagline">Persistent memory for AI systems</p>
          </div>
          <div className="footer-links">
            <a href="/docs" className="footer-link">Docs</a>
            <a href="https://github.com/Priyank911/Memron.ai" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
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
