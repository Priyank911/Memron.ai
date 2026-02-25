'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';

// Loading spinner component
function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg 
      className="loading-spinner" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none"
    >
      <circle 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="0"
      />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div className={`hamburger-icon ${open ? 'open' : ''}`}>
      <span></span>
      <span></span>
      <span></span>
    </div>
  );
}

const researchDropdown = [
  { href: '#papers', label: 'Papers', desc: 'Our published research', icon: 'doc' },
  { href: '#experiments', label: 'Experiments', desc: 'Ongoing AI experiments', icon: 'flask' },
  { href: '#benchmarks', label: 'Benchmarks', desc: 'Performance metrics', icon: 'chart' },
];

const resourcesDropdown = {
  main: [
    { href: '#docs', label: 'Docs', desc: 'Integrate Memron into your product', icon: 'doc' },
    { href: '#api', label: 'API Reference', desc: 'Set of APIs to integrate memory', icon: 'code' },
    { href: '#security', label: 'Security', desc: 'Enterprise-grade security for AI', icon: 'shield' },
    { href: '#support', label: 'Support', desc: 'Get help anytime for setup', icon: 'support' },
  ],
  quicklinks: [
    { href: '#careers', label: 'Careers' },
    { href: '#status', label: 'Status' },
    { href: '#trust', label: 'Trust Center' },
    { href: 'https://discord.gg/memron', label: 'Discord' },
  ],
};

function DropdownIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    doc: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    flask: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 3v6l-4 8a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-4-8V3M9 3h6" />
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18M7 16v-4m4 4V9m4 7v-6m4 6V7" />
      </svg>
    ),
    code: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
    shield: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    support: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01" />
      </svg>
    ),
  };
  return <span className="dropdown-icon">{icons[type]}</span>;
}

function ChevronDown() {
  return (
    <svg className="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function NavDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={ref}
      className={`nav-dropdown ${open ? 'open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="navbar-link dropdown-trigger">
        {label}
        <ChevronDown />
      </button>
      <div className="dropdown-menu">
        {children}
      </div>
    </div>
  );
}

function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/Priyank911/Memron.ai')
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count !== undefined) {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => setStars(null));
  }, []);

  const formatStars = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return count.toString();
  };

  return (
    <a
      href="https://github.com/Priyank911/Memron.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="github-stars-btn"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="github-icon">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
      <span className="github-star-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </span>
      <span className="github-stars-count">{stars !== null ? formatStars(stars) : '—'}</span>
    </a>
  );
}

function MemronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export function Navbar() {
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDropdown, setMobileDropdown] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // Handle navigation with loading state
  const handleLoginClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsNavigating(true);
    // Small delay to show loading state before navigation
    router.push('/login');
  }, [router]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-16px)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
      });
    });
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
        setMobileDropdown(null);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const toggleMobileDropdown = (name: string) => {
    setMobileDropdown(mobileDropdown === name ? null : name);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobileDropdown(null);
  };

  return (
    <>
      <nav ref={navRef} className="navbar">
        <div className="navbar-pill">
          {/* Logo */}
          <Link href="/" className="navbar-logo">
            <span className="logo-wrapper">
              <Image 
                src="/logo_w.png" 
                alt="Memron" 
                width={28} 
                height={28} 
                className="logo-light"
                priority
              />
              <Image 
                src="/logo_b.png" 
                alt="Memron" 
                width={28} 
                height={28} 
                className="logo-dark"
                priority
              />
            </span>
            <span>Memron</span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="navbar-links desktop-only">
            <Link href="#about" className="navbar-link">About</Link>
            
            <NavDropdown label="Research">
              <div className="dropdown-section">
                {researchDropdown.map((item) => (
                  <Link key={item.href} href={item.href} className="dropdown-item">
                    <DropdownIcon type={item.icon} />
                    <div className="dropdown-item-content">
                      <span className="dropdown-item-label">{item.label}</span>
                      <span className="dropdown-item-desc">{item.desc}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </NavDropdown>

            <NavDropdown label="Resources">
              <div className="dropdown-columns">
                <div className="dropdown-section">
                  <span className="dropdown-section-title">Resources</span>
                  {resourcesDropdown.main.map((item) => (
                    <Link key={item.href} href={item.href} className="dropdown-item">
                      <DropdownIcon type={item.icon} />
                      <div className="dropdown-item-content">
                        <span className="dropdown-item-label">{item.label}</span>
                        <span className="dropdown-item-desc">{item.desc}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="dropdown-section quicklinks">
                  <span className="dropdown-section-title">Quicklinks</span>
                  {resourcesDropdown.quicklinks.map((item) => (
                    item.href.startsWith('http') ? (
                      <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="dropdown-quicklink">
                        {item.label}
                      </a>
                    ) : (
                      <Link key={item.href} href={item.href} className="dropdown-quicklink">
                        {item.label}
                      </Link>
                    )
                  ))}
                </div>
              </div>
            </NavDropdown>

            <Link href="#team" className="navbar-link">Team</Link>
            <Link href="#pricing" className="navbar-link">Pricing</Link>
            <Link href="#blog" className="navbar-link">Blog</Link>
          </div>

          {/* Spacer */}
          <div className="navbar-spacer desktop-only"></div>

          {/* Desktop Actions */}
          <div className="navbar-actions desktop-only">
            <GitHubStars />
            <ThemeToggle />
            <button 
              onClick={handleLoginClick} 
              className={`signin-btn ${isNavigating ? 'loading' : ''}`}
              disabled={isNavigating}
            >
              <span className="signin-btn-bg"></span>
              <span className="signin-btn-text">
                {isNavigating ? (
                  <>
                    <LoadingSpinner size={14} />
                    <span>Loading...</span>
                  </>
                ) : (
                  'Get Early Access'
                )}
              </span>
              {!isNavigating && (
                <span className="signin-btn-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </span>
              )}
            </button>
          </div>

          {/* Mobile Actions */}
          <div className="navbar-actions mobile-only">
            <ThemeToggle />
            <button 
              className="hamburger-btn" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <HamburgerIcon open={mobileMenuOpen} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={closeMobileMenu}></div>
      
      {/* Mobile Sidebar Menu */}
      <aside className={`mobile-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo" onClick={closeMobileMenu}>
            <MemronIcon />
            <span>Memron</span>
          </Link>
          <button className="sidebar-close" onClick={closeMobileMenu} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <Link href="#about" className="sidebar-link" onClick={closeMobileMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4m0-4h.01"/>
              </svg>
              About
            </Link>
            <Link href="#team" className="sidebar-link" onClick={closeMobileMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/>
              </svg>
              Team
            </Link>
            <Link href="#pricing" className="sidebar-link" onClick={closeMobileMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              Pricing
            </Link>
            <Link href="#blog" className="sidebar-link" onClick={closeMobileMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
              </svg>
              Blog
            </Link>
          </div>

          {/* Research Section */}
          <div className="sidebar-section">
            <button 
              className={`sidebar-section-toggle ${mobileDropdown === 'research' ? 'open' : ''}`}
              onClick={() => toggleMobileDropdown('research')}
            >
              <span className="sidebar-section-title">Research</span>
              <ChevronDown />
            </button>
            <div className={`sidebar-section-content ${mobileDropdown === 'research' ? 'open' : ''}`}>
              {researchDropdown.map((item) => (
                <Link key={item.href} href={item.href} className="sidebar-sublink" onClick={closeMobileMenu}>
                  <DropdownIcon type={item.icon} />
                  <div className="sidebar-sublink-content">
                    <span className="sidebar-sublink-label">{item.label}</span>
                    <span className="sidebar-sublink-desc">{item.desc}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Resources Section */}
          <div className="sidebar-section">
            <button 
              className={`sidebar-section-toggle ${mobileDropdown === 'resources' ? 'open' : ''}`}
              onClick={() => toggleMobileDropdown('resources')}
            >
              <span className="sidebar-section-title">Resources</span>
              <ChevronDown />
            </button>
            <div className={`sidebar-section-content ${mobileDropdown === 'resources' ? 'open' : ''}`}>
              {resourcesDropdown.main.map((item) => (
                <Link key={item.href} href={item.href} className="sidebar-sublink" onClick={closeMobileMenu}>
                  <DropdownIcon type={item.icon} />
                  <div className="sidebar-sublink-content">
                    <span className="sidebar-sublink-label">{item.label}</span>
                    <span className="sidebar-sublink-desc">{item.desc}</span>
                  </div>
                </Link>
              ))}
              <div className="sidebar-quicklinks">
                {resourcesDropdown.quicklinks.map((item) => (
                  item.href.startsWith('http') ? (
                    <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="sidebar-quicklink" onClick={closeMobileMenu}>
                      {item.label}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                      </svg>
                    </a>
                  ) : (
                    <Link key={item.href} href={item.href} className="sidebar-quicklink" onClick={closeMobileMenu}>
                      {item.label}
                    </Link>
                  )
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
            <GitHubStars />
            <ThemeToggle />
          </div>
          <button 
            onClick={(e) => { closeMobileMenu(); handleLoginClick(e); }} 
            className={`sidebar-cta ${isNavigating ? 'loading' : ''}`}
            disabled={isNavigating}
          >
            {isNavigating ? (
              <>
                <LoadingSpinner size={16} />
                <span>Loading...</span>
              </>
            ) : (
              <>
                Get Early Access
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
