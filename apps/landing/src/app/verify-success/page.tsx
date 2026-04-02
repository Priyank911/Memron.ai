'use client';

import { useEffect } from 'react';
import Image from 'next/image';

export default function VerifySuccessPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.close();
      setTimeout(() => { window.location.href = '/login'; }, 500);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', fontFamily: "'Inter', sans-serif",
      background: '#fff', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', width: '400px', height: '400px',
        borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)',
        animation: 'pulse 2s ease-in-out infinite',
      }} />

      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '1.5rem', padding: '3rem', animation: 'fadeUp 0.6s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
          <Image src="/logo_b.png" alt="Memron" width={48} height={48} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#09090b' }}>
            Memron
          </span>
        </div>

        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'bounce 0.8s ease',
        }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2rem', fontWeight: 700, color: '#09090b', margin: 0 }}>
          Email verified!
        </h1>

        <p style={{ fontSize: '0.95rem', color: '#71717a', textAlign: 'center', maxWidth: '400px', margin: 0 }}>
          Your email has been verified successfully.
          <br />
          You can close this tab and continue in your original window.
        </p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: '8px', marginTop: '0.5rem',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#16a34a' }}>
            This tab will close automatically...
          </span>
        </div>

        <button
          onClick={() => { window.close(); setTimeout(() => { window.location.href = '/login'; }, 500); }}
          style={{
            marginTop: '1rem', padding: '10px 24px', border: '1.5px solid #e4e4e7',
            borderRadius: '8px', background: 'transparent', color: '#71717a',
            fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          Close tab manually
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
    </div>
  );
}