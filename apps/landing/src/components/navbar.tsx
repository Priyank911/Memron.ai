'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';

function LoadingSpinner({ size = 14 }: { size?: number }) {
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

export function Navbar() {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Switches to floating rounded pill on scroll (> 20px)
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleGetStartedClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    setIsNavigating(true);
    router.push('/login');
  }, [router]);

  return (
    <header className={`navbar-header ${isScrolled ? 'is-scrolled' : 'at-top'}`}>
      <nav className="navbar-pill">
        {/* Left Section: Logo + GitHub + Docs */}
        <div className="navbar-left">
          <Link href="/" className="navbar-logo" aria-label="Memron Home" onClick={() => setMobileMenuOpen(false)}>
            <span className="logo-wrapper">
              <Image 
                src="/logo_w.png" 
                alt="Memron" 
                width={26} 
                height={26} 
                className="logo-light"
                priority
                style={{ objectFit: 'contain' }}
              />
              <Image 
                src="/logo_b.png" 
                alt="Memron" 
                width={26} 
                height={26} 
                className="logo-dark"
                priority
                style={{ objectFit: 'contain' }}
              />
            </span>
            <span className="navbar-brand-name">Memron</span>
          </Link>

          <a
            href="https://github.com/Priyank911/Memron.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="navbar-icon-link hidden sm:inline-flex"
            aria-label="GitHub repository"
            title="GitHub repository"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="github-icon" width="18" height="18">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>

          <Link 
            href="/docs" 
            className="navbar-docs-link hidden sm:inline-flex"
          >
            Docs
          </Link>
        </div>

        {/* Dynamic spacer that contracts when scrolled */}
        <div className="navbar-spacer" />

        {/* Right Section: Theme Toggle + Get Started + Mobile Menu Toggle */}
        <div className="navbar-right">
          <ThemeToggle />

          <button 
            onClick={handleGetStartedClick}
            className={`navbar-cta ${isNavigating ? 'loading' : ''}`}
            disabled={isNavigating}
          >
            <span className="navbar-cta-text">
              {isNavigating ? (
                <>
                  <LoadingSpinner size={13} />
                  <span>Loading...</span>
                </>
              ) : (
                'Get started'
              )}
            </span>
          </button>

          {/* Mobile Hamburger Toggle (shows strictly on mobile) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="navbar-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-dropdown">
          <div className="mobile-dropdown-inner">
            <Link 
              href="/docs" 
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="mobile-link-badge">New</span>
              <span>Documentation</span>
              <span className="mobile-link-arrow">→</span>
            </Link>

            <Link 
              href="/#architecture" 
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>7-Layer Architecture</span>
              <span className="mobile-link-arrow">→</span>
            </Link>

            <Link 
              href="/#agents" 
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>Context Backbone</span>
              <span className="mobile-link-arrow">→</span>
            </Link>

            <Link 
              href="/#team" 
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>How It Works</span>
              <span className="mobile-link-arrow">→</span>
            </Link>

            <a 
              href="https://github.com/Priyank911/Memron.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>GitHub Repository</span>
              <span className="mobile-link-arrow">↗</span>
            </a>

            <div className="mobile-nav-divider" />

            <button 
              onClick={handleGetStartedClick}
              className="mobile-nav-cta"
              disabled={isNavigating}
            >
              {isNavigating ? 'Loading...' : 'Get started'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
