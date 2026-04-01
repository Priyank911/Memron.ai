'use client';

import { useEffect, useState } from 'react';
import { useClerk, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<'processing' | 'ready' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Wait for Clerk to load before doing anything
    if (!isLoaded) return;

    const processCallback = async () => {
      // If user is already signed in, skip handleRedirectCallback entirely
      // This handles the case where Clerk already processed the OAuth callback
      if (isSignedIn) {
        await syncAndNavigate();
        return;
      }

      // User not signed in yet - try to complete the OAuth callback
      try {
        await handleRedirectCallback({
          afterSignInUrl: '/dashboard',
          afterSignUpUrl: '/onboarding',
        });
        
        // After successful callback, sync and navigate
        await syncAndNavigate();
      } catch (err: any) {
        console.error('SSO callback error:', err);
        
        // Check if this is a "session already exists" or similar benign error
        const message = err?.message?.toLowerCase() || '';
        const code = err?.errors?.[0]?.code || '';
        
        if (
          message.includes('session already exists') ||
          message.includes('session_exists') ||
          code === 'session_exists' ||
          message.includes('already signed in')
        ) {
          // User is already authenticated, proceed normally
          await syncAndNavigate();
          return;
        }
        
        // Genuine error - show error UI instead of redirecting to login
        setPhase('error');
        setErrorMessage(
          err?.errors?.[0]?.longMessage ||
          err?.errors?.[0]?.message ||
          err?.message ||
          'Authentication failed. Please try again.'
        );
      }
    };

    const syncAndNavigate = async () => {
      // Sync user to databases
      try {
        await fetch('/api/user/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      } catch {
        // Non-blocking — onboarding page retries this
      }

      // Determine destination based on onboarding status
      let destination = '/onboarding';

      // Check cookie first (fast path)
      if (document.cookie.includes('memron_onboarded=true')) {
        destination = '/dashboard';
      } else {
        // Check API for onboarding status
        try {
          const statusRes = await fetch('/api/onboarding', { credentials: 'include' });
          if (statusRes.ok) {
            const ct = statusRes.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const statusData = await statusRes.json();
              if (statusData.isOnboarded) {
                document.cookie = 'memron_onboarded=true; path=/; max-age=31536000; SameSite=Lax';
                destination = '/dashboard';
              }
            }
          }
        } catch {
          // Network error — default to onboarding; it self-corrects
        }
      }

      // Show success animation before navigating
      if (destination === '/dashboard') {
        setPhase('ready');
        await delay(600);
      }

      router.replace(destination);
    };

    processCallback();
  }, [isLoaded, isSignedIn, handleRedirectCallback, router]);

  const handleRetry = () => {
    router.replace('/login');
  };

  // Error state UI
  if (phase === 'error') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#09090b',
        fontFamily: "'Inter', 'Space Grotesk', sans-serif",
        padding: '2rem',
      }}>
        {/* Ambient glow - red tinted for error */}
        <div style={{
          position: 'absolute', width: 350, height: 350, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239,68,68,0.10) 0%, transparent 70%)',
          filter: 'blur(50px)', pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', marginBottom: 32,
          animation: 'ssoLogoIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        }}>
          <Image src="/logo_w.png" alt="Memron" width={48} height={48} style={{ objectFit: 'contain' }} />
        </div>

        {/* Error icon */}
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(239,68,68,0.12)',
          border: '2px solid rgba(239,68,68,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <p style={{
          color: '#f4f4f5', fontSize: '1rem', fontWeight: 600, position: 'relative',
          fontFamily: "'Space Grotesk', sans-serif",
          marginBottom: 12,
          textAlign: 'center',
        }}>
          Authentication failed
        </p>

        {errorMessage && (
          <p style={{
            color: '#a1a1aa', fontSize: '0.85rem', position: 'relative',
            textAlign: 'center',
            maxWidth: 400,
            marginBottom: 24,
          }}>
            {errorMessage}
          </p>
        )}

        <button
          onClick={handleRetry}
          style={{
            padding: '12px 24px',
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#4f46e5')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#6366f1')}
        >
          Try again
        </button>

        <style>{`
          @keyframes ssoLogoIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  // Processing/Ready state UI
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#09090b',
      fontFamily: "'Inter', 'Space Grotesk', sans-serif",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', marginBottom: 32,
        animation: 'ssoLogoIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        <Image src="/logo_w.png" alt="Memron" width={48} height={48} style={{ objectFit: 'contain' }} />
      </div>

      {phase === 'processing' ? (
        <>
          <div style={{
            width: '48px', height: '48px',
            border: '3px solid transparent',
            borderTop: '3px solid #6366f1',
            borderBottom: '3px solid #6366f1',
            borderRadius: '50%',
            animation: 'ssoSpin 0.8s linear infinite',
            marginBottom: '16px',
          }} />
          <p style={{ color: '#a1a1aa', fontSize: '0.95rem', position: 'relative' }}>
            Completing sign in…
          </p>
        </>
      ) : (
        <>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            border: '2px solid rgba(34,197,94,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            animation: 'ssoCheckPop 0.35s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p style={{
            color: '#f4f4f5', fontSize: '1rem', fontWeight: 600, position: 'relative',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Dashboard ready!
          </p>
        </>
      )}

      {/* Bottom progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 3,
        background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
        width: phase === 'processing' ? '60%' : '100%',
        transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
      }} />

      <style>{`
        @keyframes ssoSpin     { to { transform: rotate(360deg); } }
        @keyframes ssoLogoIn   { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes ssoCheckPop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
