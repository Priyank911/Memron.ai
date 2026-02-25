'use client';

import { useState, useEffect } from 'react';

const COOKIE_CONSENT_KEY = 'memron_cookie_consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner only if user hasn't accepted yet
    const consent = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE_CONSENT_KEY}=`));
    if (!consent) {
      // Small delay so the banner slides in after page load
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    document.cookie = `${COOKIE_CONSENT_KEY}=accepted; path=/; max-age=31536000; SameSite=Lax`;
    setVisible(false);
  };

  const decline = () => {
    document.cookie = `${COOKIE_CONSENT_KEY}=declined; path=/; max-age=31536000; SameSite=Lax`;
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '24px',
        zIndex: 9999,
        maxWidth: '420px',
        width: 'calc(100% - 48px)',
        background: 'rgba(9, 9, 11, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        borderRadius: '16px',
        padding: '20px 22px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.04)',
        fontFamily: "'Inter', sans-serif",
        animation: 'cookieSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Icon + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
            <path d="M8.5 8.5v.01" />
            <path d="M16 15.5v.01" />
            <path d="M12 12v.01" />
            <path d="M11 17v.01" />
            <path d="M7 14v.01" />
          </svg>
        </div>
        <span
          style={{
            fontSize: '0.88rem',
            fontWeight: 600,
            color: '#f4f4f5',
            letterSpacing: '-0.01em',
          }}
        >
          Cookie Preferences
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: '0.8rem',
          lineHeight: 1.55,
          color: '#a1a1aa',
          margin: '0 0 16px 0',
        }}
      >
        We use essential cookies for authentication and security. Optional analytics cookies help us improve your experience.
        By clicking &ldquo;Accept&rdquo;, you consent to all cookies.
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={decline}
          style={{
            flex: 1,
            height: '38px',
            borderRadius: '10px',
            border: '1px solid rgba(63, 63, 70, 0.6)',
            background: 'transparent',
            color: '#a1a1aa',
            fontSize: '0.8rem',
            fontWeight: 500,
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(39, 39, 42, 0.5)';
            e.currentTarget.style.color = '#e4e4e7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#a1a1aa';
          }}
        >
          Decline
        </button>
        <button
          onClick={accept}
          style={{
            flex: 1,
            height: '38px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            color: '#ffffff',
            fontSize: '0.8rem',
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.35)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.25)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Accept
        </button>
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes cookieSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
