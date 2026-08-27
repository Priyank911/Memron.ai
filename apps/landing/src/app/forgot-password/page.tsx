'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  // ─── Shared styles ─────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    flex: 1, border: 'none', background: 'transparent', fontSize: '0.9rem',
    color: '#09090b', outline: 'none', fontFamily: "'Inter', sans-serif", width: '100%',
  };

  const inputWrapStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px', background: '#fafafa',
    border: '1.5px solid #e4e4e7', borderRadius: '10px', padding: '0 14px', height: '48px',
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem', fontWeight: 600, color: '#3f3f46', letterSpacing: '0.02em', fontFamily: "'Inter', sans-serif",
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', height: '48px', border: 'none', borderRadius: '10px', background: '#09090b',
    color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: '0.92rem', fontWeight: 600,
    cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1,
    transition: 'background 0.25s, box-shadow 0.25s',
  };

  const errorBoxStyle: React.CSSProperties = {
    padding: '10px 14px', marginBottom: '1rem', background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: '10px', color: '#dc2626', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif",
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);
      setError('');

      await sendPasswordReset(email.trim());
      setEmailSent(true);

    } catch (err: any) {
      console.error('[ForgotPassword] Error:', err);
      setError(err?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render different stages ──────────────────────────────
  const renderForm = () => {
    if (emailSent) {
      return (
        <div style={{ textAlign: 'center' }}>
          {/* Success icon */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', marginBottom: '1.5rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 5L2 7" />
            </svg>
          </div>

          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem' }}>
            Check Your Email
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '2rem', fontFamily: "'Inter', sans-serif" }}>
            We've sent a password reset link to <span style={{ color: '#09090b', fontWeight: 600 }}>{email}</span>. Click the link in the email to reset your password.
          </p>

          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1.5rem', fontFamily: "'Inter', sans-serif" }}>
            Didn't receive the email? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => { setEmailSent(false); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontFamily: "'Inter', sans-serif", fontSize: 'inherit' }}
            >
              try again
            </button>
          </p>

          <a href="/login" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '48px', borderRadius: '10px', background: '#09090b', color: '#fff',
            fontFamily: "'Inter', sans-serif", fontSize: '0.92rem', fontWeight: 600, textDecoration: 'none',
            transition: 'background 0.25s',
          }}>
            Back to Sign In
          </a>
        </div>
      );
    }

    // Email entry form
    return (
      <>
        {/* Lock icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', background: '#eef2ff', borderRadius: '50%',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem', textAlign: 'center' }}>
          Reset your password
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '2rem', fontFamily: "'Inter', sans-serif", textAlign: 'center' }}>
          Enter your email and we'll send you a link to reset your password.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={labelStyle}>Email</label>
            <div style={inputWrapStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 5L2 7" />
              </svg>
              <input
                suppressHydrationWarning
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={inputStyle}
              />
            </div>
          </div>

          <button suppressHydrationWarning type="submit" disabled={isLoading} style={btnStyle}>
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="/login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem', fontFamily: "'Inter', sans-serif" }}>
            ← Back to Sign In
          </a>
        </div>
      </>
    );
  };

  // ─── MAIN RENDER ───────────────────────────────────────────
  return (
    <div className="forgot-page auth-split-wrapper">
      {/* ===================== LEFT PANEL — WHITE ===================== */}
      <div className="auth-form-panel">
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="auth-form-inner" style={{ animation: 'loginFadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2.5rem' }}>
            <Image src="/logo_b.png" alt="Memron" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#09090b', letterSpacing: '-0.025em' }}>Memron</span>
          </div>

          {renderForm()}
        </div>
      </div>

      {/* ===================== RIGHT PANEL — BLACK ===================== */}
      <div className="auth-hero-panel">
        {/* Gradient orbs */}
        <div style={{ position: 'absolute', top: '-25%', right: '-15%', width: '550px', height: '550px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)', animation: 'loginFloat 9s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', animation: 'loginFloat 12s ease-in-out infinite reverse', pointerEvents: 'none' }} />

        {/* Watermark */}
        <Image src="/logo_w.png" alt="" width={380} height={380} aria-hidden="true" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
          objectFit: 'contain', opacity: 0.07, pointerEvents: 'none', animation: 'loginPulse 8s ease-in-out infinite',
        }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '520px', animation: 'loginFadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '0.6rem', fontFamily: "'Inter', sans-serif" }}>Memron AI</div>

          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2.25rem', fontWeight: 700, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.75rem' }}>
            Your memory is safe<br />with us.
          </h2>

          <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.7, marginBottom: '2.25rem', maxWidth: '440px', fontFamily: "'Inter', sans-serif" }}>
            Hardware-backed zero-trust encryption ensures your AI memories are
            always secure. Reset your password and get back to building.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '2.5rem', marginBottom: '2.25rem' }}>
            {[
              { val: 'AES-256', label: 'Encryption' },
              { val: 'E2E', label: 'Encrypted' },
              { val: 'SOC 2', label: 'Compliant' },
            ].map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#fafafa' }}>{stat.val}</div>
                <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Card */}
          <div style={{
            background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '1.5rem 1.75rem', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #6366f1, transparent)', opacity: 0.4 }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 600, color: '#fafafa', marginBottom: '0.4rem' }}>
              Zero-trust security by default
            </h3>
            <p style={{ fontSize: '0.83rem', color: '#71717a', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
              Every memory is encrypted end-to-end with user-controlled keys. No central authority can access your data ever.
            </p>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(12px, -16px) scale(1.04); }
        }
        @keyframes loginPulse {
          0%, 100% { opacity: 0.07; }
          50%      { opacity: 0.11; }
        }
        .forgot-page input::placeholder { color: #a1a1aa !important; }
        .forgot-page input:focus { outline: none !important; }
        .forgot-page * { -webkit-tap-highlight-color: transparent !important; }
        @media (max-width: 1024px) {
          .forgot-page > div:nth-child(2) { display: none !important; }
          .forgot-page > div:first-child { flex: none !important; min-height: 100vh !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
