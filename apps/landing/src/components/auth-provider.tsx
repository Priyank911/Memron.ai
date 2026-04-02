'use client';

/**
 * Firebase Authentication Provider
 * 
 * Provides authentication context throughout the application.
 * Replaces ClerkProvider with Firebase Auth.
 * 
 * Features:
 * - Automatic session management
 * - User state synchronization
 * - Loading states
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  onAuthChange,
  createSession,
  signOut as firebaseSignOut,
  signInWithGoogle,
  signInWithGithub,
  signInWithEmail,
  createAccountWithEmail,
  sendPasswordReset,
  resendVerificationEmail,
  type User,
} from '@/lib/firebase-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
  isAnonymous: boolean;
}

export interface AuthContextValue {
  // State
  user: AuthUser | null;
  firebaseUser: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  
  // Actions
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  
  // Helpers
  refreshSession: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helper: Convert Firebase User to AuthUser ───────────────────────────────

function toAuthUser(firebaseUser: User): AuthUser {
  // Determine provider (first non-password provider, or 'email')
  const providers = firebaseUser.providerData.map((p) => p.providerId);
  const providerId =
    providers.find((p) => p !== 'password') ||
    providers[0] ||
    'email';

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    providerId,
    isAnonymous: firebaseUser.isAnonymous,
  };
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sessionCreated, setSessionCreated] = useState(false);

  // Subscribe to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setFirebaseUser(user);
      
      if (user && !sessionCreated) {
        // Create server session when user signs in
        const result = await createSession();
        if (result.success) {
          setSessionCreated(true);
        } else {
          console.warn('[AuthProvider] Failed to create session:', result.error);
        }
      } else if (!user) {
        setSessionCreated(false);
      }
      
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [sessionCreated]);

  // Derived state
  const user = useMemo(() => {
    return firebaseUser ? toAuthUser(firebaseUser) : null;
  }, [firebaseUser]);

  const isSignedIn = useMemo(() => {
    return !!firebaseUser;
  }, [firebaseUser]);

  // ─── Auth Actions ──────────────────────────────────────────────────────────

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      await signInWithGoogle();
      // Session will be created automatically by the auth state listener
    } catch (error: any) {
      console.error('[AuthProvider] Google sign-in error:', error);
      throw error;
    }
  }, []);

  const handleSignInWithGithub = useCallback(async () => {
    try {
      await signInWithGithub();
    } catch (error: any) {
      console.error('[AuthProvider] GitHub sign-in error:', error);
      throw error;
    }
  }, []);

  const handleSignInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmail(email, password);
    } catch (error: any) {
      console.error('[AuthProvider] Email sign-in error:', error);
      throw error;
    }
  }, []);

  const handleSignUp = useCallback(async (email: string, password: string) => {
    try {
      await createAccountWithEmail(email, password);
    } catch (error: any) {
      console.error('[AuthProvider] Sign-up error:', error);
      throw error;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await firebaseSignOut();
      setSessionCreated(false);
    } catch (error: any) {
      console.error('[AuthProvider] Sign-out error:', error);
      throw error;
    }
  }, []);

  const handleSendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordReset(email);
    } catch (error: any) {
      console.error('[AuthProvider] Password reset error:', error);
      throw error;
    }
  }, []);

  const handleResendVerification = useCallback(async () => {
    try {
      await resendVerificationEmail();
    } catch (error: any) {
      console.error('[AuthProvider] Resend verification error:', error);
      throw error;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (firebaseUser) {
      const result = await createSession();
      if (!result.success) {
        console.warn('[AuthProvider] Session refresh failed:', result.error);
      }
    }
  }, [firebaseUser]);

  // ─── Context Value ─────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(() => ({
    user,
    firebaseUser,
    isLoaded,
    isSignedIn,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGithub: handleSignInWithGithub,
    signInWithEmail: handleSignInWithEmail,
    signUp: handleSignUp,
    signOut: handleSignOut,
    sendPasswordReset: handleSendPasswordReset,
    resendVerificationEmail: handleResendVerification,
    refreshSession,
  }), [
    user,
    firebaseUser,
    isLoaded,
    isSignedIn,
    handleSignInWithGoogle,
    handleSignInWithGithub,
    handleSignInWithEmail,
    handleSignUp,
    handleSignOut,
    handleSendPasswordReset,
    handleResendVerification,
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
 * Throws if used outside of FirebaseAuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within a FirebaseAuthProvider');
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
