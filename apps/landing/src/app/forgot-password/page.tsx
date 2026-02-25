'use client';

import { useSignIn } from '@clerk/nextjs';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const { isLoaded, signIn } = useSignIn();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetStage, setResetStage] = useState<'email' | 'code' | 'complete'>('email');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpError, setOtpError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ─── OTP helpers ─────────────────────────────────────────────
  const otpValue = otp.join('');

  const handleOtpChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtp(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setOtpError('');
    setError('');
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); otpRefs.current[index - 1]?.focus(); }
    if (e.key === 'ArrowRight' && index < 5) { e.preventDefault(); otpRefs.current[index + 1]?.focus(); }
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
    setTimeout(() => otpRefs.current[Math.min(pasted.length, 5)]?.focus(), 0);
  }, []);

  // Focus first OTP box when entering code stage
  useEffect(() => {
    if (resetStage === 'code') {
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    }
  }, [resetStage]);

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

  const successBoxStyle: React.CSSProperties = {
    padding: '10px 14px', marginBottom: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0',
    borderRadius: '10px', color: '#16a34a', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif",
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      setError('');
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email });
      setSuccess('Check your email for a verification code');
      setResetStage('code');
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      setError('');
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: otpValue,
        password: newPassword,
      });

      if (result.status === 'complete') {
        setSuccess('Password reset successfully!');
        setResetStage('complete');
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render different stages ──────────────────────────────
  const renderForm = () => {
    if (resetStage === 'complete') {
      return (
        <div style={{ textAlign: 'center' }}>
          {/* Success icon */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', marginBottom: '1.5rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem' }}>
            Password Reset!
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#71717a', marginBottom: '2rem', fontFamily: "'Inter', sans-serif" }}>
            Your password has been reset successfully. Sign in with your new password.
          </p>

          <a href="/login" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '48px', borderRadius: '10px', background: '#09090b', color: '#fff',
            fontFamily: "'Inter', sans-serif", fontSize: '0.92rem', fontWeight: 600, textDecoration: 'none',
            transition: 'background 0.25s',
          }}>
            Continue to Sign In
          </a>
        </div>
      );
    }

    if (resetStage === 'code') {
      return (
        <>
          {/* Key icon */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '64px', height: '64px', background: '#eef2ff', borderRadius: '50%', marginBottom: '1rem',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>

            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.65rem', fontWeight: 700, color: '#09090b', marginBottom: '0.4rem' }}>
              Reset Password
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#71717a', fontFamily: "'Inter', sans-serif" }}>
              Enter the code sent to <span style={{ color: '#09090b', fontWeight: 600 }}>{email}</span>
            </p>
          </div>

          {success && <div style={successBoxStyle}>{success}</div>}
          {error && <div style={errorBoxStyle}>{error}</div>}
          {otpError && (
            <div style={errorBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                {otpError}
              </div>
            </div>
          )}

          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    disabled={isLoading}
                    style={{
                      width: 48, height: 56, textAlign: 'center' as const,
                      fontSize: '1.35rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                      color: '#09090b', background: isLoading ? '#f4f4f5' : '#fafafa',
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ ...inputWrapStyle, position: 'relative' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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

            <button type="submit" disabled={isLoading || otpValue.length !== 6} style={btnStyle}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => { setResetStage('email'); setError(''); setSuccess(''); setOtp(Array(6).fill('')); setOtpError(''); }}
              style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
            >
              ← Back
            </button>
          </form>
        </>
      );
    }

    // ─── Email stage (default) ───────────────────────────────
    return (
      <>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.85rem', fontWeight: 700, color: '#09090b', letterSpacing: '-0.03em', marginBottom: '0.4rem' }}>
          Forgot Password?
        </h1>
        <p style={{ fontSize: '0.92rem', color: '#71717a', lineHeight: 1.55, marginBottom: '2rem', fontFamily: "'Inter', sans-serif" }}>
          No worries! Enter your email and we'll send you a reset code.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={labelStyle}>Email Address</label>
            <div style={inputWrapStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 5L2 7" />
              </svg>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={inputStyle}
              />
            </div>
          </div>

          <button type="submit" disabled={isLoading} style={btnStyle}>
            {isLoading ? 'Sending...' : 'Send Reset Code'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <a href="/login" style={{ fontSize: '0.85rem', color: '#6366f1', textDecoration: 'none', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
              ← Back to sign in
            </a>
          </div>
        </form>
      </>
    );
  };

  // ─── MAIN RENDER ───────────────────────────────────────────
  return (
    <div className="forgot-page" style={{
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
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: '400px', animation: 'loginFadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2.5rem' }}>
            <Image src="/logo_b.png" alt="Memron" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#09090b', letterSpacing: '-0.025em' }}>Memron</span>
          </div>

          {renderForm()}
        </div>
      </div>

      {/* ===================== RIGHT PANEL — BLACK ===================== */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        alignItems: 'flex-start', background: '#09090b', position: 'relative', padding: '3rem', overflow: 'hidden',
      }}>
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
