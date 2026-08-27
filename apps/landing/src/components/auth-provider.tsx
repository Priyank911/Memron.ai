'use client';

/**
 * WorkOS AuthKit Authentication Provider
 *
 * Provides authentication context throughout the application.
 * Replaces the previous Clerk → Firebase providers with WorkOS.
 *
 * Features:
 * - Session state hydrated from /api/auth (sealed httpOnly cookie)
 * - Same hook shape as previous providers (drop-in for consumers)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  getSession,
  signOut as apiSignOut,
  signInWithEmail,
  signUp,
  sendPasswordReset,
  resendVerificationEmail,
  verifyEmailCode,
  signInWithProvider,
  type SessionUser,
} from '@/lib/auth-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  /** 'password' for email users; 'google'/'github' for OAuth users. */
  providerId: string;
}

export interface AuthContextValue {
  // State
  user: AuthUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;

  // Actions
  signInWithGoogle: () => void;
  signInWithGithub: () => void;
  /** Resolves to 'verification_required' when the emailed code must be entered. */
  signInWithEmail: (email: string, password: string) => Promise<'verification_required' | 'success'>;
  /** Returns 'verification_required' when the emailed code must be entered. */
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<'verification_required' | 'success'>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;

  // Helpers
  refreshSession: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(u: SessionUser): AuthUser {
  return {
    uid: u.uid,
    email: u.email ?? null,
    emailVerified: Boolean(u.emailVerified),
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    providerId: u.providerId || 'password',
  };
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate session state from the server on mount (and when tab refocuses).
  useEffect(() => {
    let active = true;

    const load = async () => {
      const result = await getSession();
      if (!active) return;
      setSessionUser(result.data.authenticated && result.data.user ? result.data.user : null);
      setIsLoaded(true);
    };

    load();

    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  // Derived state
  const user = useMemo(() => (sessionUser ? toAuthUser(sessionUser) : null), [sessionUser]);
  const isSignedIn = useMemo(() => !!sessionUser, [sessionUser]);

  const applySessionResult = useCallback(
    (result: Awaited<ReturnType<typeof getSession>>) => {
      setSessionUser(result.data.authenticated && result.data.user ? result.data.user : null);
      setIsLoaded(true);
    },
    [],
  );

  const refresh = useCallback(async () => {
    applySessionResult(await getSession());
  }, [applySessionResult]);

  // ─── Auth Actions ──────────────────────────────────────────────────────────

  const handleSignInWithGoogle = useCallback(() => signInWithProvider('google'), []);
  const handleSignInWithGithub = useCallback(() => signInWithProvider('github'), []);

  const handleSignInWithEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmail(email, password);
    if (!result.ok || result.data.error) {
      throw new Error(result.data.error || 'Failed to sign in');
    }
    // Server may have established a limited (unverified) session.
    await refresh();
    return result.data.verificationRequired ? 'verification_required' : 'success';
  }, [refresh]);

  const handleSignUp = useCallback(async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => {
    const result = await signUp({ email, password, firstName, lastName });
    if (!result.ok || result.data.error) {
      throw new Error(result.data.error || 'Failed to create account');
    }
    await refresh();
    return (result.data.status === 'verification_required' ? 'verification_required' : 'success');
  }, [refresh]);

  const handleSignOut = useCallback(async () => {
    await apiSignOut();
    setSessionUser(null);
    setIsLoaded(true);
  }, []);

  const handleSendPasswordReset = useCallback(async (email: string) => {
    const result = await sendPasswordReset(email);
    if (!result.ok || result.data.error) {
      throw new Error(result.data.error || 'Failed to send reset email');
    }
  }, []);

  const handleResendVerification = useCallback(async () => {
    const result = await resendVerificationEmail();
    if (!result.ok || result.data.error) {
      throw new Error(result.data.error || 'Failed to resend verification email');
    }
  }, []);

  const handleVerifyEmailCode = useCallback(async (code: string) => {
    const result = await verifyEmailCode(code);
    if (!result.ok || result.data.error) {
      throw new Error(result.data.error || 'Invalid verification code');
    }
    await refresh();
  }, [refresh]);

  const refreshSession = refresh;

  // ─── Context Value ─────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoaded,
    isSignedIn,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGithub: handleSignInWithGithub,
    signInWithEmail: handleSignInWithEmail,
    signUp: handleSignUp,
    signOut: handleSignOut,
    sendPasswordReset: handleSendPasswordReset,
    resendVerificationEmail: handleResendVerification,
    verifyEmailCode: handleVerifyEmailCode,
    refreshSession,
  }), [
    user,
    isLoaded,
    isSignedIn,
    handleSignInWithGoogle,
    handleSignInWithGithub,
    handleSignInWithEmail,
    handleSignUp,
    handleSignOut,
    handleSendPasswordReset,
    handleResendVerification,
    handleVerifyEmailCode,
    refreshSession,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Hook to access authentication context
 * Throws if used outside of AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook for user data (similar to Clerk's useUser)
 */
export function useUser() {
  const { user, isLoaded, isSignedIn } = useAuth();

  return {
    user,
    isLoaded,
    isSignedIn,
  };
}
