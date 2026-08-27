'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';
import { signInWithProvider } from '@/lib/auth-client';
import { useCallback } from 'react';

export default function SignUpPage() {
  const { user, isLoaded, signUp, resendVerificationEmail, verifyEmailCode } = useAuth();
  const authLoading = !isLoaded;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Track sign-up phase: 'form' | 'verifying' | 'verified'
  // IMPORTANT: keep SSR/client initial render identical to avoid hydration mismatch.
  const [phase, setPhase] = useState<'form' | 'verifying' | 'verified'>('form');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [code, setCode] = useState('');

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Track whether we're handling post-auth redirect ourselves
  const redirectingRef = useRef(false);

  const isOAuthUser = (providerId?: string | null) => Boolean(providerId && providerId !== 'password');

  // Arriving from login with an unverified account (?verify=<email>):
  // enter the code-entry phase immediately — the server already re-sent the code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyEmailParam = params.get('verify');
    if (!verifyEmailParam) return;

    params.delete('verify');
    const clean = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${clean ? `?${clean}` : ''}`);

    setVerifyEmail(verifyEmailParam);
    setPhase('verifying');
    document.cookie = 'memron_email_verified=false; path=/; max-age=432000; SameSite=Lax';
    setResendCooldown(30);
  }, []);

  // Restore persisted verification state on client after hydration.
  useEffect(() => {
    if (!isLoaded) return;

    const savedPhase = localStorage.getItem('memron_verification_phase');
    const savedEmail = localStorage.getItem('memron_verification_email') || '';

    if (user && (savedPhase === 'verifying' || savedPhase === 'verified')) {
      // Only restore when the account still needs verification.
      if (!user.emailVerified && savedPhase === 'verifying') {
        setPhase('verifying');
        if (savedEmail) setVerifyEmail(savedEmail);
      } else if (user.emailVerified) {
        localStorage.removeItem('memron_verification_phase');
        localStorage.removeItem('memron_verification_email');
        document.cookie = 'memron_email_verified=true; path=/; max-age=432000; SameSite=Lax';
      }
    } else if (!user) {
      // User signed out - clear any stale verification state
      localStorage.removeItem('memron_verification_phase');
      localStorage.removeItem('memron_verification_email');
      setPhase('form');
      setVerifyEmail('');
    }
  }, [isLoaded, user]);

  // Persist phase and email to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (phase === 'verifying' || phase === 'verified') {
        localStorage.setItem('memron_verification_phase', phase);
      } else {
        localStorage.removeItem('memron_verification_phase');
      }
    }
  }, [phase]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (verifyEmail) {
        localStorage.setItem('memron_verification_email', verifyEmail);
      } else {
        localStorage.removeItem('memron_verification_email');
      }
    }
  }, [verifyEmail]);

  // Sync user to database after successful auth
  const syncUserToDb = useCallback(async () => {
    try {
      await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {
      // Non-blocking — onboarding page retries this anyway
    }
  }, []);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Redirect if already signed in (and verified for email users)
  useEffect(() => {
    if (user && !redirectingRef.current && !authLoading) {
      // IMPORTANT: If we're on the verification phase, DON'T redirect
      if (phase === 'verifying') {
        return; // Stay on verification page
      }

      // Only redirect if the user is OAuth or their email is verified
      if (isOAuthUser(user.providerId) || user.emailVerified) {
        const isOnboarded = document.cookie.includes('memron_onboarded=true');
        router.replace(isOnboarded ? '/dashboard' : '/onboarding');
      }
    }
  }, [user, authLoading, router, phase]);

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);
      setError('');

      // Create the WorkOS user — the server emails a one-time code and
      // establishes a limited session so we can complete verification here.
      await signUp(email.trim(), password, firstName.trim() || undefined, lastName.trim() || undefined);

      // Store email for verification page
      setVerifyEmail(email.trim());

      // Show verification page - don't redirect yet
      setPhase('verifying');
      document.cookie = 'memron_email_verified=false; path=/; max-age=432000; SameSite=Lax';
      setResendCooldown(60); // Start with 60s cooldown since email was just sent

    } catch (err: any) {
      // Expected errors are surfaced as friendly messages by the API layer.
      setError(err?.message || 'Failed to create your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify the one-time code entered by the user
  const handleVerifyCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim() || verifyingCode) return;

    try {
      setVerifyingCode(true);
      setError('');
      await verifyEmailCode(code.trim());

      // Verified! Clean up localStorage and move to success state
      setPhase('verified');
      redirectingRef.current = true;
      localStorage.removeItem('memron_verification_phase');
      localStorage.removeItem('memron_verification_email');
      document.cookie = 'memron_email_verified=true; path=/; max-age=432000; SameSite=Lax';

      await syncUserToDb();
      setTimeout(() => {
        router.replace('/onboarding');
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Invalid code. Please check your email and try again.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Resend verification email handler
  const handleResendVerification = async () => {
    if (resendCooldown > 0 || resending) return;
    
    try {
      setResending(true);
      setError('');
      await resendVerificationEmail();
      setResendCooldown(60);
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleOAuthSignUp = (provider: 'google' | 'github') => {
    try {
      setIsLoading(true);
      setError('');

      // Full-page redirect into the WorkOS hosted OAuth flow.
      signInWithProvider(provider);
    } catch (err: any) {
      console.error('[SignUp] OAuth sign-up failed:', err);
      setError(`Could not start ${provider} sign-in. Please try again.`);
      setIsLoading(false);
    }
  };

  // ─── Shared styles ─────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '0.9rem',
    color: '#09090b',
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
    width: '100%',
  };

  const inputWrapStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#fafafa',
    border: '1.5px solid #e4e4e7',
    borderRadius: '10px',
    padding: '0 14px',
    height: '48px',
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#3f3f46',
    letterSpacing: '0.02em',
    fontFamily: "'Inter', sans-serif",
  };

  const btnPrimaryStyle: React.CSSProperties = {
    width: '100%',
    height: '48px',
    border: 'none',
    borderRadius: '10px',
    background: '#09090b',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    letterSpacing: '0.01em',
    opacity: isLoading ? 0.6 : 1,
    transition: 'background 0.25s, box-shadow 0.25s, transform 0.2s',
  };

  const errorBoxStyle: React.CSSProperties = {
    padding: '10px 14px',
    marginBottom: '1rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    color: '#dc2626',
    fontSize: '0.85rem',
    fontFamily: "'Inter', sans-serif",
  };

  // ─── VERIFICATION PAGE (Compact, White Theme) ────────────────────────────────────
  if (phase === 'verifying' || phase === 'verified') {
    const isVerified = phase === 'verified';
    
    return (
      <div className="verify-page auth-split-wrapper">
        {/* ===================== LEFT PANEL — WHITE ===================== */}
        <div className="auth-form-panel">
          {/* Subtle corner glow */}
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: isVerified 
              ? 'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div className="auth-form-inner" style={{
            animation: 'verifyFadeUp 0.5s ease',
          }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <Image src="/logo_b.png" alt="Memron" width={36} height={36} style={{ objectFit: 'contain' }} />
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#09090b',
                letterSpacing: '-0.025em',
              }}>Memron</span>
            </div>

            {/* Icon + Heading */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              marginBottom: '0.75rem' 
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: isVerified ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isVerified ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 7l-10 5L2 7" />
                  </svg>
                )}
              </div>
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#09090b',
                letterSpacing: '-0.02em',
                margin: 0,
              }}>
                {isVerified ? 'Email verified!' : 'Check your email'}
              </h1>
            </div>

            {/* Description */}
            <p style={{
              fontSize: '0.88rem',
              color: '#71717a',
              lineHeight: 1.5,
              marginBottom: '1.25rem',
            }}>
              {isVerified 
                ? 'Your email has been verified successfully. Redirecting you now...'
                : <>We sent a verification code to <strong style={{ color: '#3f3f46' }}>{verifyEmail}</strong></>
              }
            </p>

            {/* Status badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: isVerified ? 'rgba(34,197,94,0.08)' : '#fafafa',
              border: isVerified ? '1px solid rgba(34,197,94,0.2)' : '1px solid #e4e4e7',
              borderRadius: '8px',
              marginBottom: '1.25rem',
            }}>
              {isVerified ? (
                <>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#22c55e',
                  }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#16a34a' }}>
                    Verified — redirecting...
                  </span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'verifySpin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="#e4e4e7" strokeWidth="2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#52525b' }}>
                    Enter your code to continue
                  </span>
                </>
              )}
            </div>

            {/* Code entry (only show when not verified) */}
            {!isVerified && (
              <form onSubmit={handleVerifyCode} style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#3f3f46',
                  letterSpacing: '0.02em',
                  fontFamily: "'Inter', sans-serif",
                  display: 'block',
                  marginBottom: '6px',
                }}>Verification code</label>
                <input
                  suppressHydrationWarning
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                  placeholder="Paste or type the code"
                  maxLength={16}
                  style={{
                    width: '100%',
                    height: '48px',
                    border: '1.5px solid #e4e4e7',
                    borderRadius: '10px',
                    padding: '0 14px',
                    fontSize: '1rem',
                    letterSpacing: '0.08em',
                    color: '#09090b',
                    background: '#fafafa',
                    outline: 'none',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'border-color 0.2s',
                    marginBottom: '10px',
                  }}
                />
                <button
                  type="submit"
                  disabled={!code.trim() || verifyingCode}
                  style={{
                    width: '100%',
                    height: 42,
                    border: 'none',
                    borderRadius: '8px',
                    background: !code.trim() || verifyingCode ? '#e4e4e7' : '#09090b',
                    color: !code.trim() || verifyingCode ? '#71717a' : '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: !code.trim() || verifyingCode ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    marginBottom: '10px',
                  }}
                >
                  {verifyingCode ? 'Verifying...' : 'Verify email'}
                </button>
              </form>
            )}

            {/* Instructions (only show when not verified) */}
            {!isVerified && (
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '1.25rem',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { num: '1', text: 'Open the email from Memron' },
                    { num: '2', text: 'Copy the verification code' },
                    { num: '3', text: 'Paste it above and hit verify' },
                  ].map((step) => (
                    <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#e4e4e7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: '#71717a',
                        flexShrink: 0,
                      }}>{step.num}</div>
                      <span style={{ fontSize: '0.82rem', color: '#52525b' }}>{step.text}</span>
                    </div>
                  ))}
                </div>
                <p style={{
                  fontSize: '0.75rem',
                  color: '#a1a1aa',
                  marginTop: '10px',
                  marginBottom: 0,
                }}>
                  💡 Can't find it? Check your spam folder.
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div style={errorBoxStyle}>{error}</div>
            )}

            {/* Actions (only show when not verified) */}
            {!isVerified && (
              <div style={{ display: 'flex' }}>
                <button
                  onClick={handleResendVerification}
                  disabled={resendCooldown > 0 || resending}
                  style={{
                    width: '100%',
                    height: 42,
                    border: 'none',
                    borderRadius: '8px',
                    background: resendCooldown > 0 ? '#e4e4e7' : '#09090b',
                    color: resendCooldown > 0 ? '#71717a' : '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: resendCooldown > 0 || resending ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {resending ? 'Sending...' : resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend email'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===================== RIGHT PANEL — DARK ===================== */}
        <div className="auth-hero-panel" style={{ justifyContent: 'center' }}>
          {/* Animated gradient orbs */}
          <div style={{
            position: 'absolute',
            top: '-25%',
            right: '-15%',
            width: '550px',
            height: '550px',
            borderRadius: '50%',
            background: isVerified
              ? 'radial-gradient(circle, rgba(34,197,94,0.10) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
            animation: 'verifyFloat 9s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-20%',
            left: '-10%',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
            animation: 'verifyFloat 12s ease-in-out infinite reverse',
            pointerEvents: 'none',
          }} />

          {/* Watermark logo */}
          <Image
            src="/logo_w.png"
            alt=""
            width={280}
            height={280}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              objectFit: 'contain',
              opacity: 0.06,
              pointerEvents: 'none',
            }}
          />

          {/* Content */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: '520px',
            animation: 'verifyFadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            {/* Brand label */}
            <div style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: isVerified ? '#22c55e' : '#6366f1',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: '0.6rem',
              fontFamily: "'Inter', sans-serif",
            }}>
              {isVerified ? 'Verification Complete' : 'Email Verification'}
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '2.25rem',
              fontWeight: 700,
              color: '#fafafa',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              marginBottom: '0.75rem',
            }}>
              {isVerified 
                ? 'Welcome to Memron!' 
                : 'Check your inbox'}
            </h2>

            {/* Description */}
            <p style={{
              fontSize: '0.9rem',
              color: '#a1a1aa',
              lineHeight: 1.7,
              marginBottom: '2.25rem',
              maxWidth: '440px',
              fontFamily: "'Inter', sans-serif",
            }}>
              {isVerified
                ? 'Your email has been verified. We\'re setting up your workspace now...'
                : 'Click the verification link we sent to complete your account setup and start building with AI memory.'}
            </p>

            {/* Feature highlights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                  title: 'Secure & Encrypted',
                  desc: 'AES-256 encryption for all your data',
                },
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
                  title: 'Lightning Fast',
                  desc: 'Sub-100ms retrieval with vector search',
                },
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>,
                  title: 'Smart Context',
                  desc: 'Automatic relevance ranking for agents',
                },
              ].map((feature, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  opacity: 0,
                  animation: `verifyFadeUp 0.5s ${0.3 + i * 0.1}s cubic-bezier(0.16,1,0.3,1) forwards`,
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                    flexShrink: 0,
                  }}>
                    {feature.icon}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: '#fafafa',
                      marginBottom: '2px',
                      fontFamily: "'Inter', sans-serif",
                    }}>{feature.title}</div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#71717a',
                      fontFamily: "'Inter', sans-serif",
                    }}>{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Styles */}
        <style>{`
          @keyframes verifyFadeUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes verifySpin {
            to { transform: rotate(360deg); }
          }
          @keyframes verifyPulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
          }
          @keyframes verifyCheckPop {
            0% { opacity: 0; transform: scale(0.5); }
            50% { transform: scale(1.1); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes verifyFloat {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(30px, -30px); }
            66% { transform: translate(-20px, 20px); }
          }
        `}</style>
      </div>
    );
  }

  // ─── MAIN SIGN UP FORM ────────────────────────────────────
  return (
    <div className="signup-page auth-split-wrapper">
      {/* ===================== LEFT PANEL — WHITE ===================== */}
      <div className="auth-form-panel">
        {/* Subtle corner glow */}
        <div style={{
          position: 'absolute',
          top: '-80px',
          right: '-80px',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="auth-form-inner" style={{
          animation: 'loginFadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards',
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
            <Image src="/logo_b.png" alt="Memron" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '1.35rem',
              fontWeight: 700,
              color: '#09090b',
              letterSpacing: '-0.025em',
            }}>Memron</span>
          </div>

          {/* Heading */}
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '1.85rem',
            fontWeight: 700,
            color: '#09090b',
            letterSpacing: '-0.03em',
            marginBottom: '0.4rem',
          }}>Create your account</h1>
          <p style={{
            fontSize: '0.92rem',
            color: '#71717a',
            lineHeight: 1.55,
            marginBottom: '1.75rem',
            fontFamily: "'Inter', sans-serif",
          }}>
            Get started with Memron AI memory infrastructure.
          </p>

          {error && <div style={errorBoxStyle}>{error}</div>}

          {/* Form */}
          <form onSubmit={handleEmailSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Name row */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={labelStyle}>First Name</label>
                <div style={inputWrapStyle}>
                  <input
                    suppressHydrationWarning
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={labelStyle}>Last Name</label>
                <div style={inputWrapStyle}>
                  <input
                    suppressHydrationWarning
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Email */}
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

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={labelStyle}>Password</label>
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

            {/* Submit */}
            <button suppressHydrationWarning type="submit" disabled={isLoading} style={btnPrimaryStyle}>
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
              <span style={{ fontSize: '0.75rem', color: '#a1a1aa', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
            </div>

            {/* Social buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => handleOAuthSignUp('google')}
                disabled={isLoading}
                style={{
                  flex: 1, height: '46px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontFamily: "'Inter', sans-serif", fontSize: '0.84rem', fontWeight: 600, color: '#09090b',
                  cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: isLoading ? 0.6 : 1, position: 'relative',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>

              <button
                suppressHydrationWarning
                type="button"
                onClick={() => handleOAuthSignUp('github')}
                disabled={isLoading}
                style={{
                  flex: 1, height: '46px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontFamily: "'Inter', sans-serif", fontSize: '0.84rem', fontWeight: 600, color: '#09090b',
                  cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: isLoading ? 0.6 : 1,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#09090b">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Github
              </button>
            </div>
          </form>

          {/* Footer */}
          <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#71717a', fontFamily: "'Inter', sans-serif" }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Sign in</a>
            </p>
            <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.75rem', fontFamily: "'Inter', sans-serif" }}>
              By continuing, you agree to our{' '}
              <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Terms</a>
              {' '}and{' '}
              <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>

      {/* ===================== RIGHT PANEL — BLACK ===================== */}
      <div className="auth-hero-panel">
        {/* Gradient orbs */}
        <div style={{
          position: 'absolute', top: '-25%', right: '-15%', width: '550px', height: '550px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)', animation: 'loginFloat 9s ease-in-out infinite', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', left: '-10%', width: '450px', height: '450px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', animation: 'loginFloat 12s ease-in-out infinite reverse', pointerEvents: 'none',
        }} />

        {/* Watermark logo */}
        <Image src="/logo_w.png" alt="" width={380} height={380} aria-hidden="true" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
          objectFit: 'contain', opacity: 0.07, pointerEvents: 'none', animation: 'loginPulse 8s ease-in-out infinite',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '520px', animation: 'loginFadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '0.6rem', fontFamily: "'Inter', sans-serif" }}>Memron AI</div>

          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2.25rem', fontWeight: 700, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.75rem' }}>
            Give your AI<br />persistent memory.
          </h2>

          <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.7, marginBottom: '2.25rem', maxWidth: '440px', fontFamily: "'Inter', sans-serif" }}>
            Build intelligent applications with sovereign memory that learns from every interaction,
            maintains context across platforms, and delivers personalized AI experiences.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '2.5rem', marginBottom: '2.25rem' }}>
            {[
              { val: '89-95', unit: '%', label: 'Token Compression' },
              { val: '10-100', unit: 'x', label: 'Cost Reduction' },
              { val: 'Zero', unit: '-', label: 'Trust Encryption' },
            ].map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>
                  {stat.val}<span style={{ color: '#6366f1' }}>{stat.unit}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Feature card */}
          <div style={{
            background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '1.5rem 1.75rem', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #6366f1, transparent)', opacity: 0.4 }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 600, color: '#fafafa', marginBottom: '0.4rem' }}>
              Cross-platform memory that truly remembers
            </h3>
            <p style={{ fontSize: '0.83rem', color: '#71717a', lineHeight: 1.6, marginBottom: '1.1rem', fontFamily: "'Inter', sans-serif" }}>
              Start a project in Cursor, continue in Claude, share with your team on Copilot. Your memory follows you everywhere.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {['Cursor', 'Claude', 'Copilot', 'Windsurf'].map((name, i) => (
                <span key={name}>
                  {i > 0 && <span style={{ display: 'inline-block', width: '3px', height: '3px', borderRadius: '50%', background: '#3f3f46', margin: '0 4px', verticalAlign: 'middle' }} />}
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.74rem', fontWeight: 500, color: '#d4d4d8', fontFamily: "'Inter', sans-serif" }}>{name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Styles and CAPTCHA */}
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
        .signup-page input::placeholder { color: #a1a1aa !important; }
        .signup-page input:focus { outline: none !important; }
        .signup-page * { -webkit-tap-highlight-color: transparent !important; }
        @media (max-width: 1024px) {
          .signup-page > div:nth-child(2) { display: none !important; }
          .signup-page > div:first-child { flex: none !important; min-height: 100vh !important; width: 100% !important; }
        }
        @media (max-width: 480px) {
          .signup-page > div:first-child { padding: 2rem 1.5rem !important; }
        }
      `}</style>
    </div>
  );
}
