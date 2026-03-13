import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About - Memron',
  description: 'The team and mission behind Memron - persistent, sovereign memory infrastructure for AI agents.',
};

const stats = [
  { value: '89–95%', label: 'Token Compression' },
  { value: '<3', label: 'Pointer Size (tokens)' },
  { value: '4', label: 'Memory Buckets' },
  { value: 'AES-256', label: 'Encryption Standard' },
];

const founders = [
  {
    name: 'Priyank',
    role: 'Co-Founder, CEO',
    bio: 'Building the memory layer for AI agents with a focus on privacy-first context, reliable retrieval, and minimal UX.',
    twitter: 'https://x.com/memron_ai',
    github: 'https://github.com/Priyank911',
    imageSrc: '/about/founders/Priyank.jpg',
  },
  {
    name: 'Anarv',
    role: 'Co-Founder, CTO',
    bio: 'Architecting distributed memory systems and pointer-based context transfer across agents, tools, and providers.',
    twitter: '#',
    github: '#',
    imageSrc: '/about/founders/Anarv.png',
    objectPosition: 'center 5%',
  },
  {
    name: 'Prayers',
    role: 'Co-Founder, CSO',
    bio: 'Focused on security, governance, and safe personalization so memory improves trust and reliability.',
    twitter: '#',
    github: '#',
    imageSrc: '/about/founders/Prayers.jpg',
    objectPosition: 'center 10%',
  },
];

const values = [
  {
    title: 'Memory Sovereignty',
    desc: 'Users own their AI memory. No vendor lock-in, no platform silos. Your context, your control.',
  },
  {
    title: 'Zero-Trust Architecture',
    desc: 'AES-256-GCM encryption, row-level security, and hardware-backed access control by default.',
  },
  {
    title: 'Protocol-First',
    desc: 'Built on Model Context Protocol. Standards over proprietary formats. Interoperability over lock-in.',
  },
  {
    title: 'Compression Over Replay',
    desc: '3-token pointers replace 1000-token histories. Efficiency is not optional - it is the architecture.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page">
      {/* Hero */}
      <section className="about-hero">
        <div className="about-hero-inner">
          <span className="about-badge">About Memron</span>
          <h1 className="about-hero-title">
            We are building the
            <br />
            <span className="about-hero-highlight">memory layer for AI</span>
          </h1>
          <p className="about-hero-desc">
            AI agents forget everything between sessions. Context is locked in
            platform silos. Users don&apos;t own their data. We&apos;re fixing that - one
            pointer at a time.
          </p>
        </div>
      </section>

      <div className="about-divider" />

      {/* Mission */}
      <section className="about-section">
        <div className="about-section-inner">
          <div className="about-two-col">
            <div className="about-col-label">
              <span className="about-label">Our Mission</span>
            </div>
            <div className="about-col-content">
              <h2 className="about-section-title">
                Persistent, sovereign memory for every AI system
              </h2>
              <p className="about-section-desc">
                Memron is cross-platform memory infrastructure that lets AI agents
                retain context, share knowledge, and learn across sessions - without
                replaying entire conversation histories.
              </p>
              <p className="about-section-desc">
                We built a four-stage pipeline - Perception, Normalization, Memory
                Management, and Persistence - that compresses raw context into
                cryptographically verified, pointer-addressable memories. The result:
                10–100x cost reduction and agents that actually remember.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="about-divider" />

      {/* Stats */}
      <section className="about-section">
        <div className="about-section-inner">
          <div className="about-stats-grid">
            {stats.map((s) => (
              <div key={s.label} className="about-stat">
                <span className="about-stat-value">{s.value}</span>
                <span className="about-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="about-divider" />

      {/* Values */}
      <section className="about-section">
        <div className="about-section-inner">
          <span className="about-label">What We Believe</span>
          <div className="about-values-grid">
            {values.map((v) => (
              <div key={v.title} className="about-value-card">
                <h3 className="about-value-title">{v.title}</h3>
                <p className="about-value-desc">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="about-divider" />

      {/* Founders */}
      <section className="about-section">
        <div className="about-section-inner">
          <span className="about-label">The Team</span>
          <h2 className="about-section-title about-team-title">
            Built by engineers who ship
          </h2>
          <div className="about-founders-grid">
            {founders.map((f, idx) => (
              <div key={`${f.role}-${f.name}-${idx}`} className="about-founder-card">
                <div className="about-founder-media" aria-hidden="true">
                  <Image
                    src={f.imageSrc}
                    alt=""
                    width={900}
                    height={780}
                    style={{ objectPosition: f.objectPosition || 'center center' }}
                    className="about-founder-image"
                    priority={idx === 0}
                  />
                </div>
                <div className="about-founder-info">
                  <h3 className="about-founder-name">{f.name}</h3>
                  <span className="about-founder-role">{f.role}</span>
                  <p className="about-founder-bio">{f.bio}</p>
                  <div className="about-founder-links">
                    <a
                      href={f.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="about-founder-link"
                      aria-label="Twitter"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                    <a
                      href={f.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="about-founder-link"
                      aria-label="GitHub"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="about-divider" />

      {/* CTA */}
      <section className="about-section about-cta-section">
        <div className="about-section-inner about-cta-inner">
          <h2 className="about-cta-title">
            Give your AI
            <span className="about-cta-highlight"> persistent memory</span>
          </h2>
          <p className="about-cta-desc">
            Join the developers building context-aware AI systems with Memron.
          </p>
          <div className="about-cta-buttons">
            <Link href="/login" className="about-cta-primary">
              Get Early Access
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <a
              href="https://github.com/Priyank911/Memron.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="about-cta-secondary"
            >
              View on GitHub
            </a>
          </div>
        </div>
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
            <a href="https://github.com/memron-ai" target="_blank" rel="noopener noreferrer" className="footer-link">Docs</a>
            <a href="https://github.com/memron-ai" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
            <a href="https://x.com/memron_ai" target="_blank" rel="noopener noreferrer" className="footer-link">Twitter</a>
            <a href="#" className="footer-link">Discord</a>
          </div>
          <div className="footer-right">
            <p className="footer-copy">&copy; 2026 Memron. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
