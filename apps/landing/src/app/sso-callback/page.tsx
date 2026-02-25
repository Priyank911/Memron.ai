'use client';

import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();
  const [phase, setPhase] = useState<'processing' | 'ready'>('processing');

  useEffect(() => {
    handleRedirectCallback({
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/onboarding',
    })
      .then(async () => {
        // Ensure user record exists in our databases
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
        } catch {
          // Non-blocking — onboarding page retries this
        }

        // Route based on onboarding status.
        // Always heal the cookie client-side before navigating.
        let destination = '/onboarding';

        if (document.cookie.includes('memron_onboarded=true')) {
          destination = '/dashboard';
        } else {
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

        if (destination === '/dashboard') {
          setPhase('ready');
          await delay(600);
        }

        router.replace(destination);
      })
      .catch((err) => {
        console.error('SSO callback error:', err);
        router.replace('/login');
      });
  }, [handleRedirectCallback, router]);

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
