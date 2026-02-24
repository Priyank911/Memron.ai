'use client';

import { useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();

  useEffect(() => {
    handleRedirectCallback({
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/dashboard',
      redirectUrl: '/dashboard',
    }).then(() => {
      router.replace('/dashboard');
    }).catch((err) => {
      console.error('SSO callback error:', err);
      router.replace('/login');
    });
  }, [handleRedirectCallback, router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#09090b',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          width: '48px',
          height: '48px',
          border: '3px solid transparent',
          borderTop: '3px solid #6366f1',
          borderBottom: '3px solid #6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '16px',
        }} />
        <p style={{ color: '#a1a1aa', fontSize: '0.95rem' }}>Completing sign in...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
