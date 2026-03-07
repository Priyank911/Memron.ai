'use client';

import { useSignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Transition phases after clicking "Sign in" ──────────────
type LoginPhase = 'form' | 'authenticating' | 'syncing' | 'ready';

const PHASE_LABELS: Record<Exclude<LoginPhase, 'form'>, string> = {
  authenticating: 'Verifying credentials…',
  syncing:        'Preparing your workspace…',
  ready:          'Dashboard ready!',
};

const PHASE_STEPS = [
  { key: 'authenticating', label: 'Authenticate' },
  { key: 'syncing',        label: 'Sync account' },
  { key: 'ready',          label: 'Launch dashboard' },
] as const;

// ─── Animated transition overlay ──────────────────────────────
function LoginTransition({ phase }: { phase: Exclude<LoginPhase, 'form'> }) {
  const activeIdx = PHASE_STEPS.findIndex(s => s.key === phase);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#09090b',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', 'Space Grotesk', sans-serif",
      animation: 'ltFadeIn 0.35s ease',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        position: 'relative', marginBottom: 40,
        animation: 'ltLogoIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        <Image src="/logo_w.png" alt="Memron" width={56} height={56} style={{ objectFit: 'contain' }} />
      </div>

      {/* Animated ring */}
      <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 36 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ animation: 'ltSpin 1.2s linear infinite' }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth="3" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="#6366f1" strokeWidth="3"
            strokeLinecap="round" strokeDasharray="160" strokeDashoffset={phase === 'ready' ? '0' : '120'}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        {phase === 'ready' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'ltCheckPop 0.35s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}
      </div>

      {/* Phase label */}
      <p style={{
        fontSize: '1.05rem', fontWeight: 600, color: '#f4f4f5',
        letterSpacing: '-0.01em', marginBottom: 32,
        animation: 'ltTextFade 0.3s ease', fontFamily: "'Space Grotesk', sans-serif",
      }} key={phase}>
        {PHASE_LABELS[phase]}
      </p>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 28 }}>
        {PHASE_STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={step.key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              opacity: done || active ? 1 : 0.35,
              transition: 'opacity 0.3s ease',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'rgba(34,197,94,0.15)' : active ? 'rgba(99,102,241,0.18)' : 'rgba(63,63,70,0.2)',
                border: `1.5px solid ${done ? 'rgba(34,197,94,0.4)' : active ? 'rgba(99,102,241,0.5)' : 'rgba(63,63,70,0.3)'}`,
                transition: 'all 0.3s ease',
              }}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    color: active ? '#818cf8' : '#52525b',
                  }}>{i + 1}</span>
                )}
              </div>
              <span style={{
                fontSize: '0.68rem', fontWeight: 500,
                color: done ? '#86efac' : active ? '#c7d2fe' : '#52525b',
                transition: 'color 0.3s ease', whiteSpace: 'nowrap',
              }}>{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Bottom bar animation */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 3,
        background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
        borderRadius: '0 2px 0 0',
        width: phase === 'authenticating' ? '30%' : phase === 'syncing' ? '70%' : '100%',
        transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
      }} />

      <style>{`
        @keyframes ltFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ltLogoIn  { from { opacity: 0; transform: scale(0.8) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes ltSpin    { to { transform: rotate(360deg); } }
        @keyframes ltCheckPop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes ltTextFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Main login component ─────────────────────────────────────
export default function LoginPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('form');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaStrategy, setMfaStrategy] = useState<'totp' | 'backup_code'>('totp');
  const [mfaAttempts, setMfaAttempts] = useState(0);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [emailOtpMode, setEmailOtpMode] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const router = useRouter();
  const redirectingRef = useRef(false);

  // Redirect if user lands on this page already signed in
  useEffect(() => {
    if (!isSignedIn || redirectingRef.current) return;
    redirectingRef.current = true;
    setLoginPhase('syncing');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    (async () => {
      // Fast path: cookie present
      if (document.cookie.includes('memron_onboarded=true')) {
        clearTimeout(timeout);
        setLoginPhase('ready');
        await delay(600);
        router.replace('/dashboard');
        return;
      }

      // Cookie absent — check the API before deciding
      try {
        const res = await fetch('/api/onboarding', {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const data = await res.json();
            if (data.isOnboarded) {
              document.cookie = 'memron_onboarded=true; path=/; max-age=31536000; SameSite=Lax';
              setLoginPhase('ready');
              await delay(600);
              router.replace('/dashboard');
              return;
            }
          }
        }
      } catch {
        clearTimeout(timeout);
        // Timeout or network error — assume onboarded if cookie check failed,
        // dashboard will re-check anyway
      }
      router.replace('/onboarding');
    })();

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [isSignedIn, router]);

  /**
   * Resolve destination after login — sets cookie before navigating
   * so the middleware never bounces through /onboarding.
   */
  const resolveAndNavigate = async () => {
    // Quick check: cookie already present
    if (document.cookie.includes('memron_onboarded=true')) {
      return '/dashboard';
    }

    setLoginPhase('syncing');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      // Sync user record
      await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });

      // Check onboarding status — the /api/onboarding response also sets
      // the cookie via Set-Cookie header, and we double-set client-side
      const res = await fetch('/api/onboarding', {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          if (data.isOnboarded) {
            document.cookie = 'memron_onboarded=true; path=/; max-age=31536000; SameSite=Lax';
            return '/dashboard';
          }
        }
      }
    } catch {
      clearTimeout(timeout);
      // Timeout or network error — try dashboard anyway, middleware will redirect if needed
      if (document.cookie.includes('memron_onboarded=true')) {
        return '/dashboard';
      }
    }

    return '/onboarding';
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      setError('');
      setLoginPhase('authenticating');

      let result = await signIn.create({
        identifier: email,
        password,
      });

      // Handle multi-step auth — Clerk may require explicit first-factor verification
      if (result.status === 'needs_first_factor') {
        result = await signIn.attemptFirstFactor({
          strategy: 'password',
          password,
        });
      }

      if (result.status === 'needs_second_factor') {
        setLoginPhase('form');
        setMfaRequired(true);
        setMfaCode('');
        setError('');
        return;
      }

      if (result.status === 'complete') {
        redirectingRef.current = true;
        await setActive({ session: result.createdSessionId });

        const dest = await resolveAndNavigate();

        // Show "ready" phase briefly before navigating
        setLoginPhase('ready');
        await delay(700);

        // Navigate — cookie is already set, middleware will pass through
        router.replace(dest);
      } else {
        // Unexpected status — don't leave the user stuck
        setLoginPhase('form');
        setError('Sign-in could not be completed. Please try again.');
      }
    } catch (err: any) {
      setLoginPhase('form');
      setError(err.errors?.[0]?.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = async (strategy: 'oauth_google' | 'oauth_github') => {
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/dashboard',
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Failed to sign in');
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    try {
      setIsLoading(true);
      setError('');
      setLoginPhase('authenticating');

      const result = await signIn.attemptSecondFactor({
        strategy: mfaStrategy,
        code: mfaCode.trim(),
      });

      if (result.status === 'complete') {
        redirectingRef.current = true;
        await setActive({ session: result.createdSessionId });

        const dest = await resolveAndNavigate();
        setLoginPhase('ready');
        await delay(700);
        router.replace(dest);
      } else {
        setLoginPhase('form');
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: any) {
      setLoginPhase('form');
      const msg = err.errors?.[0]?.message || 'Invalid verification code.';
      setMfaAttempts((p) => p + 1);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetMfa = async () => {
    if (!isLoaded || !signIn) return;
    try {
      setResettingMfa(true);
      setError('');

      // Try to remove TOTP via backend
      const res = await fetch('/api/auth/reset-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // TOTP removed — restart sign-in from scratch
        setMfaRequired(false);
        setMfaCode('');
        setMfaAttempts(0);
        setMfaStrategy('totp');
        setLoginPhase('authenticating');

        let result = await signIn.create({ identifier: email, password });
        if (result.status === 'needs_first_factor') {
          result = await signIn.attemptFirstFactor({ strategy: 'password', password });
        }

        if (result.status === 'complete') {
          redirectingRef.current = true;
          await setActive({ session: result.createdSessionId });
          const dest = await resolveAndNavigate();
          setLoginPhase('ready');
          await delay(700);
          router.replace(dest);
          return;
        }
      }

      // TOTP removal failed (Pro restriction) — use email OTP as fallback
      // This starts a completely fresh sign-in using email_code strategy
      // which doesn't trigger MFA at all
      setMfaRequired(false);
      setMfaCode('');
      setMfaAttempts(0);
      setLoginPhase('authenticating');

      const freshSignIn = await signIn.create({ identifier: email });

      // Find the email address ID for preparing the email code
      const emailFactor = freshSignIn.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'email_code',
      ) as any;

      if (!emailFactor?.emailAddressId) {
        throw new Error('Email code sign-in is not available. Please contact support.');
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      });

      // Switch to email OTP mode
      setLoginPhase('form');
      setMfaRequired(false);
      setEmailOtpMode(true);
      setEmailOtpCode('');
      setError('');
      setResettingMfa(false);
    } catch (err: any) {
      setLoginPhase('form');
      setResettingMfa(false);
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  const handleEmailOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    try {
      setIsLoading(true);
      setError('');
      setLoginPhase('authenticating');

      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: emailOtpCode.trim(),
      });

      if (result.status === 'complete') {
        redirectingRef.current = true;
        await setActive({ session: result.createdSessionId });
        const dest = await resolveAndNavigate();
        setLoginPhase('ready');
        await delay(700);
        router.replace(dest);
      } else if (result.status === 'needs_second_factor') {
        // Even email OTP triggered 2FA — this shouldn't happen usually
        // but handle it by completing the sign-in directly
        setLoginPhase('form');
        setEmailOtpMode(false);
        setMfaRequired(true);
        setError('');
      } else {
        setLoginPhase('form');
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: any) {
      setLoginPhase('form');
      setError(err.errors?.[0]?.message || 'Invalid code. Check your email and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!isLoaded || !signIn) return;
    try {
      setError('');
      const freshSignIn = await signIn.create({ identifier: email });
      const emailFactor = freshSignIn.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'email_code',
      ) as any;
      if (emailFactor?.emailAddressId) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });
      }
      setError('');
      setEmailOtpCode('');
    } catch {
      setError('Failed to resend code. Try again.');
    }
  };

  const handleBackToLogin = () => {
    setMfaRequired(false);
    setMfaCode('');
    setError('');
    setMfaStrategy('totp');
    setMfaAttempts(0);
    setEmailOtpMode(false);
    setEmailOtpCode('');
  };

  // Show transition overlay when not in form phase
  if (loginPhase !== 'form') {
    return <LoginTransition phase={loginPhase} />;
  }

  return (
    <div className="login-page" style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2.5rem' }}>
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
          {mfaRequired ? (
            <>
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.85rem',
                fontWeight: 700,
                color: '#09090b',
                letterSpacing: '-0.03em',
                marginBottom: '0.4rem',
              }}>Two-factor verification</h1>
              <p style={{
                fontSize: '0.92rem',
                color: '#71717a',
                lineHeight: 1.55,
                marginBottom: '2rem',
                fontFamily: "'Inter', sans-serif",
              }}>
                {mfaStrategy === 'totp'
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Enter one of your backup codes.'}
              </p>

              {/* Error message */}
              {error && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  fontFamily: "'Inter', sans-serif",
                }}>{error}</div>
              )}

              {mfaAttempts >= 1 && (
                <div style={{
                  padding: '12px 14px',
                  marginBottom: '0.5rem',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  color: '#92400e',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  fontFamily: "'Inter', sans-serif",
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <span>2FA isn&apos;t working? Sign in with an email verification code instead.</span>
                  <button
                    type="button"
                    onClick={handleResetMfa}
                    disabled={resettingMfa}
                    style={{
                      width: '100%',
                      height: '40px',
                      border: '1.5px solid #f59e0b',
                      borderRadius: '8px',
                      background: '#fffbeb',
                      color: '#92400e',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: resettingMfa ? 'not-allowed' : 'pointer',
                      opacity: resettingMfa ? 0.6 : 1,
                      outline: 'none',
                    }}
                  >
                    {resettingMfa ? 'Setting up...' : 'Sign in with email code'}
                  </button>
                </div>
              )}

              <form onSubmit={handleMfaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="mfa-code" style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#3f3f46',
                    letterSpacing: '0.02em',
                    fontFamily: "'Inter', sans-serif",
                  }}>{mfaStrategy === 'totp' ? 'Verification code' : 'Backup code'}</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#fafafa',
                    border: '1.5px solid #e4e4e7',
                    borderRadius: '10px',
                    padding: '0 14px',
                    height: '48px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <input
                      id="mfa-code"
                      type="text"
                      inputMode={mfaStrategy === 'totp' ? 'numeric' : undefined}
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={mfaStrategy === 'totp' ? 6 : 24}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(mfaStrategy === 'totp' ? /\D/g : /\s/g, ''))}
                      placeholder={mfaStrategy === 'totp' ? '000000' : 'xxxx-xxxx-xxxx'}
                      required
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        fontSize: mfaStrategy === 'totp' ? '1.2rem' : '0.9rem',
                        color: '#09090b',
                        outline: 'none',
                        fontFamily: mfaStrategy === 'totp' ? "'JetBrains Mono', 'Fira Code', monospace" : "'Inter', sans-serif",
                        letterSpacing: mfaStrategy === 'totp' ? '0.35em' : 'normal',
                        textAlign: mfaStrategy === 'totp' ? 'center' : 'left',
                        boxShadow: 'none',
                      }}
                      onFocus={(e) => e.target.style.boxShadow = 'none'}
                    />
                  </div>
                </div>

                {/* Verify button */}
                <button
                  type="submit"
                  disabled={isLoading || (mfaStrategy === 'totp' ? mfaCode.length !== 6 : mfaCode.length < 4)}
                  style={{
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
                    opacity: isLoading || (mfaStrategy === 'totp' ? mfaCode.length !== 6 : mfaCode.length < 4) ? 0.6 : 1,
                    outline: 'none',
                  }}
                  onMouseOver={(e) => { if (!isLoading) { (e.target as HTMLElement).style.background = '#18181b'; } }}
                  onMouseOut={(e) => { (e.target as HTMLElement).style.background = '#09090b'; }}
                  onFocus={(e) => { (e.target as HTMLElement).style.outline = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
                >
                  {isLoading ? 'Verifying...' : 'Verify'}
                </button>

                {/* Toggle TOTP / backup code */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaStrategy(mfaStrategy === 'totp' ? 'backup_code' : 'totp');
                      setMfaCode('');
                      setError('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      fontSize: '0.84rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      padding: '4px 0',
                    }}
                  >
                    {mfaStrategy === 'totp' ? 'Use a backup code instead' : 'Use authenticator app instead'}
                  </button>
                </div>
              </form>

              {/* Back link */}
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6366f1',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    padding: 0,
                  }}
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          ) : emailOtpMode ? (
            <>
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.85rem',
                fontWeight: 700,
                color: '#09090b',
                letterSpacing: '-0.03em',
                marginBottom: '0.4rem',
              }}>Check your email</h1>
              <p style={{
                fontSize: '0.92rem',
                color: '#71717a',
                lineHeight: 1.55,
                marginBottom: '2rem',
                fontFamily: "'Inter', sans-serif",
              }}>
                We sent a verification code to <strong style={{ color: '#09090b' }}>{email}</strong>. Enter it below to sign in.
              </p>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  fontFamily: "'Inter', sans-serif",
                }}>{error}</div>
              )}

              <form onSubmit={handleEmailOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="email-otp" style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#3f3f46',
                    letterSpacing: '0.02em',
                    fontFamily: "'Inter', sans-serif",
                  }}>Verification code</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#fafafa',
                    border: '1.5px solid #e4e4e7',
                    borderRadius: '10px',
                    padding: '0 14px',
                    height: '48px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 5L2 7" />
                    </svg>
                    <input
                      id="email-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={6}
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      required
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        fontSize: '1.2rem',
                        color: '#09090b',
                        outline: 'none',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        letterSpacing: '0.35em',
                        textAlign: 'center',
                        boxShadow: 'none',
                      }}
                      onFocus={(e) => e.target.style.boxShadow = 'none'}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || emailOtpCode.length !== 6}
                  style={{
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
                    opacity: isLoading || emailOtpCode.length !== 6 ? 0.6 : 1,
                    outline: 'none',
                  }}
                  onMouseOver={(e) => { if (!isLoading) { (e.target as HTMLElement).style.background = '#18181b'; } }}
                  onMouseOut={(e) => { (e.target as HTMLElement).style.background = '#09090b'; }}
                  onFocus={(e) => { (e.target as HTMLElement).style.outline = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
                >
                  {isLoading ? 'Verifying...' : 'Verify & Sign in'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                  <button
                    type="button"
                    onClick={handleResendEmailOtp}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      fontSize: '0.84rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      padding: '4px 0',
                    }}
                  >
                    Resend code
                  </button>
                </div>
              </form>

              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6366f1',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    padding: 0,
                  }}
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '1.85rem',
            fontWeight: 700,
            color: '#09090b',
            letterSpacing: '-0.03em',
            marginBottom: '0.4rem',
          }}>Sign in</h1>
          <p style={{
            fontSize: '0.92rem',
            color: '#71717a',
            lineHeight: 1.55,
            marginBottom: '2rem',
            fontFamily: "'Inter', sans-serif",
          }}>
            The unified memory layer for the AI era.
          </p>

          {/* Error message */}
          {error && (
            <div style={{
              padding: '10px 14px',
              marginBottom: '1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '0.85rem',
              fontFamily: "'Inter', sans-serif",
            }}>{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="email" style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#3f3f46',
                letterSpacing: '0.02em',
                fontFamily: "'Inter', sans-serif",
              }}>Email</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#fafafa',
                border: '1.5px solid #e4e4e7',
                borderRadius: '10px',
                padding: '0 14px',
                height: '48px',
                transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-10 5L2 7" />
                </svg>
                <input
                  suppressHydrationWarning
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.9rem',
                    color: '#09090b',
                    outline: 'none',
                    fontFamily: "'Inter', sans-serif",
                    boxShadow: 'none',
                  }}
                  onFocus={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="password" style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#3f3f46',
                letterSpacing: '0.02em',
                fontFamily: "'Inter', sans-serif",
              }}>Password</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#fafafa',
                border: '1.5px solid #e4e4e7',
                borderRadius: '10px',
                padding: '0 14px',
                height: '48px',
                transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  suppressHydrationWarning
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.9rem',
                    color: '#09090b',
                    outline: 'none',
                    fontFamily: "'Inter', sans-serif",
                    boxShadow: 'none',
                  }}
                  onFocus={(e) => e.target.style.boxShadow = 'none'}
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

            {/* Remember / Forgot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '0.84rem',
                color: '#3f3f46',
                cursor: 'pointer',
                userSelect: 'none',
                fontFamily: "'Inter', sans-serif",
              }}>
                <input
                  suppressHydrationWarning
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer', outline: 'none', boxShadow: 'none' }}
                  onFocus={(e) => e.target.style.boxShadow = 'none'}
                />
                Remember me
              </label>
              <a href="/forgot-password" style={{
                fontSize: '0.82rem',
                color: '#6366f1',
                textDecoration: 'none',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
              }}>Forgot Password</a>
            </div>

            {/* Submit */}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={isLoading}
              style={{
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
                outline: 'none',
              }}
              onMouseOver={(e) => { if (!isLoading) { (e.target as HTMLElement).style.background = '#18181b'; (e.target as HTMLElement).style.boxShadow = '0 4px 18px rgba(0,0,0,0.18)'; } }}
              onMouseOut={(e) => { (e.target as HTMLElement).style.background = '#09090b'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              onFocus={(e) => { (e.target as HTMLElement).style.outline = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
            >
              {isLoading ? 'Signing in...' : 'Log in to Memron'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
              <span style={{
                fontSize: '0.75rem',
                color: '#a1a1aa',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
                fontFamily: "'Inter', sans-serif",
              }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
            </div>

            {/* Social buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => handleOAuthSignIn('oauth_google')}
                disabled={isLoading}
                style={{
                  flex: 1,
                  height: '46px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '10px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#09090b',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  position: 'relative',
                  opacity: isLoading ? 0.6 : 1,
                  outline: 'none',
                }}
                onMouseOver={(e) => { if (!isLoading) { (e.target as HTMLElement).style.borderColor = '#d4d4d8'; (e.target as HTMLElement).style.background = '#fafafa'; } }}
                onMouseOut={(e) => { (e.target as HTMLElement).style.borderColor = '#e4e4e7'; (e.target as HTMLElement).style.background = '#fff'; }}
                onFocus={(e) => { (e.target as HTMLElement).style.outline = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              >
                {/* "Last used" badge */}
                <span style={{
                  position: 'absolute',
                  top: '-9px',
                  right: '-6px',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  letterSpacing: '0.03em',
                  lineHeight: 1.4,
                  boxShadow: '0 1px 4px rgba(16,185,129,0.3)',
                }}>Last used</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <button
                suppressHydrationWarning
                type="button"
                onClick={() => handleOAuthSignIn('oauth_github')}
                disabled={isLoading}
                style={{
                  flex: 1,
                  height: '46px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '10px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#09090b',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  outline: 'none',
                }}
                onMouseOver={(e) => { if (!isLoading) { (e.target as HTMLElement).style.borderColor = '#d4d4d8'; (e.target as HTMLElement).style.background = '#fafafa'; } }}
                onMouseOut={(e) => { (e.target as HTMLElement).style.borderColor = '#e4e4e7'; (e.target as HTMLElement).style.background = '#fff'; }}
                onFocus={(e) => { (e.target as HTMLElement).style.outline = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#09090b">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Continue with Github
              </button>
            </div>
          </form>

          {/* Footer */}
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <p style={{
              fontSize: '0.82rem',
              color: '#a1a1aa',
              lineHeight: 1.5,
              fontFamily: "'Inter', sans-serif",
            }}>
              By continuing, you agree to our{' '}
              <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Terms</a>
              {' '}and{' '}
              <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>.
            </p>
            <p style={{ fontSize: '0.85rem', color: '#71717a', marginTop: '0.75rem', fontFamily: "'Inter', sans-serif" }}>
              Don't have an account?{' '}
              <a href="/sign-up" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Sign up</a>
            </p>
          </div>
            </>
          )}
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
        {/* Animated gradient orbs */}
        <div style={{
          position: 'absolute',
          top: '-25%',
          right: '-15%',
          width: '550px',
          height: '550px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
          animation: 'loginFloat 9s ease-in-out infinite',
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
          animation: 'loginFloat 12s ease-in-out infinite reverse',
          pointerEvents: 'none',
        }} />

        {/* Watermark logo */}
        <Image
          src="/logo_w.png"
          alt=""
          width={380}
          height={380}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
            objectFit: 'contain',
            opacity: 0.07,
            pointerEvents: 'none',
            animation: 'loginPulse 8s ease-in-out infinite',
          }}
        />

        {/* Content */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '520px',
          animation: 'loginFadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          {/* Brand label */}
          <div style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#6366f1',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            marginBottom: '0.6rem',
            fontFamily: "'Inter', sans-serif",
          }}>Memron AI</div>

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
            Persistent memory for<br />AI agents.
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
            Retain context across conversations, learn from every interaction,
            and transfer knowledge seamlessly between platforms all encrypted
            and owned by you.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '2.5rem', marginBottom: '2.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>
                89-95<span style={{ color: '#6366f1' }}>%</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>
                Token Compression
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>
                10-100<span style={{ color: '#6366f1' }}>x</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>
                Cost Reduction
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#fafafa' }}>
                Zero<span style={{ color: '#6366f1' }}>-</span>Trust
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>
                Encryption
              </div>
            </div>
          </div>

          {/* Feature card */}
          <div style={{
            background: 'rgba(255,255,255,0.035)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '18px',
            padding: '1.5rem 1.75rem',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Top accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #6366f1, transparent)',
              opacity: 0.4,
            }} />

            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#fafafa',
              marginBottom: '0.4rem',
            }}>
              Stop building retrieval from scratch.
            </h3>
            <p style={{
              fontSize: '0.83rem',
              color: '#71717a',
              lineHeight: 1.6,
              marginBottom: '1.1rem',
              fontFamily: "'Inter', sans-serif",
            }}>
              Start a project in Cursor, continue in Claude, share with your
              team on Copilot. Your memory follows you everywhere.
            </p>

            {/* Platform pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {['Cursor', 'Claude', 'Copilot', 'Windsurf'].map((name, i) => (
                <span key={name}>
                  {i > 0 && <span style={{
                    display: 'inline-block',
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: '#3f3f46',
                    margin: '0 4px',
                    verticalAlign: 'middle',
                  }} />}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '5px 12px',
                    borderRadius: '100px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    color: '#d4d4d8',
                    fontFamily: "'Inter', sans-serif",
                  }}>{name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Keyframes */}
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
        .login-page input::placeholder {
          color: #a1a1aa !important;
        }
        .login-page * {
          -webkit-tap-highlight-color: transparent !important;
        }
        .login-page input:focus,
        .login-page button:focus,
        .login-page a:focus,
        .login-page input[type="checkbox"]:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        .login-page input:active,
        .login-page button:active {
          background-color: inherit !important;
        }
        @media (max-width: 1024px) {
          .login-page > div:last-of-type:not(style) {
            display: none !important;
          }
          .login-page > div:first-of-type {
            flex: none !important;
            min-height: 100vh !important;
            width: 100% !important;
          }
        }
      `}</style>
      {/* Clerk CAPTCHA widget mount point */}
      <div id="clerk-captcha" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }} />
    </div>
  );
}
