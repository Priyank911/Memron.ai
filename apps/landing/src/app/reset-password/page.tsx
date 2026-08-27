'use client';

/**
 * Reset Password — completes a WorkOS password reset.
 *
 * Reached via the link in the password-reset email:
 *   /reset-password?token=...
 *
 * On success the user is signed in automatically (the API re-seals the
 * session) and routed to onboarding or dashboard.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Read the token from the query string once on mount
  useEffect(() => {
    setToken(searchParams.get('token') ?? '');
  }, [searchParams]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(async () => {
      await refreshSession();
      const isOnboarded = document.cookie.includes('memron_onboarded=true');
      router.replace(isOnboarded ? '/dashboard' : '/onboarding');
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Missing reset token. Please use the link from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to reset your password. The link may have expired.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Shared styles (match login/sign-up pages) ──────────────────────────────
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

  return (
    <div className="reset-page auth-split-wrapper">
      {/* ===================== LEFT PANEL — WHITE ===================== */}
      <div className="auth-form-panel">
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="auth-form-inner" style={{ animation: 'loginFadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2.5rem' }}>
            <Image src="/logo_b.png" alt="Memron" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#09090b', letterSpacing: '-0.025em' }}>Memron</span>
          </div>

          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', marginBottom: '1.5rem',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem' }}>
                Password updated
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '1.5rem', fontFamily: "'Inter', sans-serif" }}>
                Your password has been changed successfully. Taking you to your workspace…
              </p>
              <a href="/login" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '48px', borderRadius: '10px', background: '#09090b', color: '#fff',
                fontFamily: "'Inter', sans-serif", fontSize: '0.92rem', fontWeight: 600, textDecoration: 'none',
              }}>
                Continue
              </a>
            </div>
          ) : (
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
                Choose a new password
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '2rem', fontFamily: "'Inter', sans-serif", textAlign: 'center' }}>
                Enter a new password for your account.
              </p>

              {!token && (
                <div style={{
                  padding: '10px 14px', marginBottom: '1rem', background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: '10px', color: '#b45309', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif",
                }}>
                  This page needs a valid reset link. Check your email for the link, or request a new one from{' '}
                  <a href="/forgot-password" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Forgot Password</a>.
                </div>
              )}

              {error && <div style={errorBoxStyle}>{error}</div>}

              <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>New password</label>
                  <div style={inputWrapStyle}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <input
                      suppressHydrationWarning
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px', display: 'flex' }}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Confirm new password</label>
                  <div style={inputWrapStyle}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <input
                      suppressHydrationWarning
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      minLength={8}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <button suppressHydrationWarning type="submit" disabled={isLoading || !token} style={{ ...btnStyle, opacity: isLoading || !token ? 0.6 : 1 }}>
                  {isLoading ? 'Updating...' : 'Update password'}
                </button>
              </form>

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <a href="/login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem', fontFamily: "'Inter', sans-serif" }}>
                  ← Back to Sign In
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===================== RIGHT PANEL — BLACK ===================== */}
      <div className="auth-hero-panel">
        <div style={{ position: 'absolute', top: '-25%', right: '-15%', width: '550px', height: '550px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)', animation: 'loginFloat 9s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', animation: 'loginFloat 12s ease-in-out infinite reverse', pointerEvents: 'none' }} />

        <Image src="/logo_w.png" alt="" width={380} height={380} aria-hidden="true" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
          objectFit: 'contain', opacity: 0.07, pointerEvents: 'none', animation: 'loginPulse 8s ease-in-out infinite',
        }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '520px', animation: 'loginFadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '0.6rem', fontFamily: "'Inter', sans-serif" }}>Memron AI</div>

          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2.25rem', fontWeight: 700, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.75rem' }}>
            Security first,<br />always.
          </h2>

          <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.7, marginBottom: '2.25rem', maxWidth: '440px', fontFamily: "'Inter', sans-serif" }}>
            Your memories are protected with zero-trust encryption. Choose a strong,
            unique password to keep it that way.
          </p>

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
        .reset-page input::placeholder { color: #a1a1aa !important; }
        .reset-page input:focus { outline: none !important; }
        .reset-page * { -webkit-tap-highlight-color: transparent !important; }
        @media (max-width: 1024px) {
          .reset-page > div:nth-child(2) { display: none !important; }
          .reset-page > div:first-child { flex: none !important; min-height: 100vh !important; width: 100% !important; }
        }
        @media (max-width: 480px) {
          .reset-page > div:first-child { padding: 2rem 1.5rem !important; }
        }
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#ffffff', fontFamily: "'Inter', sans-serif" }}>
        <span style={{ color: '#71717a', fontSize: '0.9rem' }}>Loading…</span>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
