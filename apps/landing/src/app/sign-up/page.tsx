'use client';

import { useSignUp, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpError, setOtpError] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { isSignedIn } = useAuth();

  // Track whether we're handling the post-verification redirect ourselves
  // to prevent the isSignedIn effect from racing with the verify redirect
  const redirectingRef = useRef(false);

  // Redirect if already signed in (client-side fallback; middleware handles server-side)
  useEffect(() => {
    if (isSignedIn && !redirectingRef.current && !verifying) {
      // User is signed in but landed on sign-up page.
      // Check onboarding cookie: if onboarded → dashboard, otherwise → onboarding
      const isOnboarded = document.cookie.includes('memron_onboarded=true');
      router.replace(isOnboarded ? '/dashboard' : '/onboarding');
    }
  }, [isSignedIn, verifying, router]);

  // ─── OTP helpers ───────────────────────────────────────────
  const otpValue = otp.join('');

  const handleOtpChange = useCallback((index: number, value: string) => {
    // Allow only digits
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtp(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setOtpError('');
    setError('');
    // Auto-focus next box
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  }, [otp]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setOtp(prev => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] || '';
      return next;
    });
    setOtpError('');
    setError('');
    // Focus the last filled box or the next empty one
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => otpRefs.current[focusIdx]?.focus(), 0);
  }, []);

  // Auto-verify when all 6 digits are filled
  useEffect(() => {
    if (otpValue.length !== 6 || !verifying || !isLoaded || otpVerifying) return;

    const verify = async () => {
      setOtpVerifying(true);
      setError('');
      setOtpError('');
      try {
        const completeSignUp = await signUp.attemptEmailAddressVerification({ code: otpValue });
        if (completeSignUp.status === 'complete') {
          // Prevent the isSignedIn effect from firing a competing redirect
          redirectingRef.current = true;
          await setActive({ session: completeSignUp.createdSessionId });

          // Sync user to our databases before navigating so that the
          // onboarding page can find the user record immediately
          try {
            await fetch('/api/user/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });
          } catch {
            // Non-blocking — onboarding page retries this anyway
          }

          // New sign-up always needs onboarding; go there directly
          // (avoids the brief dashboard flash)
          router.replace('/onboarding');
        }
      } catch (err: any) {
        const msg = err.errors?.[0]?.message || 'Invalid verification code';
        const code = err.errors?.[0]?.code || '';

        // "Session already exists" means the sign-up actually succeeded and
        // Clerk already activated a session. Treat this as success.
        if (
          msg.toLowerCase().includes('session already exists') ||
          msg.toLowerCase().includes('session_exists') ||
          code === 'session_exists'
        ) {
          redirectingRef.current = true;

          // Sync user to our databases
          try {
            await fetch('/api/user/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });
          } catch {
            // Non-blocking
          }

          router.replace('/onboarding');
          return;
        }

        setOtpError(msg);
        // Clear all boxes and refocus the first one so user can retry
        setOtp(Array(6).fill(''));
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } finally {
        setOtpVerifying(false);
      }
    };

    verify();
  }, [otpValue, verifying, isLoaded, otpVerifying, router, setActive, signUp]);

  // Focus first OTP box on mount
  useEffect(() => {
    if (verifying) {
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    }
  }, [verifying]);

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      setError('');
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
      });

      // Send verification email
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifying(true);
      setOtp(Array(6).fill(''));
      setOtpError('');
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignUp = async (strategy: 'oauth_google' | 'oauth_github') => {
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/onboarding',
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Failed to sign up');
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

  // ─── VERIFICATION SCREEN ──────────────────────────────────
  if (verifying) {
    return (
      <div className="signup-page" style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
        background: '#ffffff',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#ffffff',
          padding: '3rem 2.5rem',
        }}>
          <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center', animation: 'loginFadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '2rem' }}>
              <Image src="/logo_b.png" alt="Memron" width={40} height={40} style={{ objectFit: 'contain' }} />
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#09090b' }}>Memron</span>
            </div>

            {/* Email icon */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              background: '#eef2ff',
              borderRadius: '50%',
              marginBottom: '1.5rem',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 5L2 7" />
              </svg>
            </div>

            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem' }}>
              Check your email
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '2rem', fontFamily: "'Inter', sans-serif" }}>
              We sent a verification code to <span style={{ color: '#09090b', fontWeight: 600 }}>{email}</span>
            </p>

            {error && <div style={errorBoxStyle}>{error}</div>}
            {otpError && (
              <div style={errorBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                  {otpError}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={labelStyle}>Verification Code</label>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      maxLength={1}
                      disabled={otpVerifying}
                      style={{
                        width: 48, height: 56, textAlign: 'center' as const,
                        fontSize: '1.35rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                        color: '#09090b', background: otpVerifying ? '#f4f4f5' : '#fafafa',
                        border: `1.5px solid ${otpError ? '#fca5a5' : digit ? '#6366f1' : '#e4e4e7'}`,
                        borderRadius: 10, outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        caretColor: '#6366f1',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = digit ? '#6366f1' : '#e4e4e7'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  ))}
                </div>
              </div>

              {/* Auto-verifying indicator */}
              {otpVerifying && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6366f1', fontSize: '0.85rem', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".2"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Verifying...
                </div>
              )}

              <button
                type="button"
                onClick={() => { setVerifying(false); setError(''); setOtpError(''); setOtp(Array(6).fill('')); }}
                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              >
                ← Back to sign up
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes loginFadeUp {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .signup-page input::placeholder { color: #a1a1aa !important; }
          .signup-page input:focus { outline: none !important; }
        `}</style>
        <div id="clerk-captcha" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }} />
      </div>
    );
  }

  // ─── MAIN SIGN UP FORM ────────────────────────────────────
  return (
    <div className="signup-page" style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100%',
      fontFamily: "'Inter', 'Space Grotesk', system-ui, -apple-system, sans-serif",
      overflow: 'hidden',
      background: '#ffffff',
    }}>

      {/* ===================== LEFT PANEL — WHITE ===================== */}
      <div style={{
        flex: '0 0 48%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#ffffff',
        padding: '3rem 2.5rem',
        position: 'relative',
        zIndex: 10,
      }}>
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

        <div style={{
          width: '100%',
          maxWidth: '400px',
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
                onClick={() => handleOAuthSignUp('oauth_google')}
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
                onClick={() => handleOAuthSignUp('oauth_github')}
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
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        background: '#09090b',
        position: 'relative',
        padding: '3rem',
        overflow: 'hidden',
      }}>
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
      <div id="clerk-captcha" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }} />
    </div>
  );
}
