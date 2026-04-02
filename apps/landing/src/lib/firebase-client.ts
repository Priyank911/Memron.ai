/**
 * Firebase Client SDK Configuration
 * 
 * This module initializes Firebase for client-side authentication.
 * Uses environment variables for configuration (set in .env.local).
 * 
 * Supports:
 * - Email/Password authentication with email link verification
 * - Google OAuth
 * - GitHub OAuth
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';

// ─── Firebase Configuration ──────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ─── Singleton Initialization ────────────────────────────────────────────────

let app: FirebaseApp;
let auth: Auth;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

// ─── OAuth Providers ─────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

const githubProvider = new GithubAuthProvider();
githubProvider.addScope('user:email');

// ─── Authentication Functions ────────────────────────────────────────────────

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithPopup(auth, googleProvider);
}

/**
 * Sign in with GitHub OAuth
 */
export async function signInWithGithub(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithPopup(auth, githubProvider);
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new account with email and password
 * Automatically sends verification email and sets display name
 */
export async function createAccountWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Set display name if provided
  if (credential.user && displayName) {
    const { updateProfile } = await import('firebase/auth');
    await updateProfile(credential.user, { displayName });
  }
  
  // Send verification email - redirect to verification success page (not onboarding)
  if (credential.user) {
    await sendEmailVerification(credential.user, {
      url: `${window.location.origin}/verify-success`,
      handleCodeInApp: false,
    });
  }
  
  return credential;
}

/**
 * Resend verification email to current user
 */
export async function resendVerificationEmail(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('No user signed in');
  }
  
  await sendEmailVerification(user, {
    url: `${window.location.origin}/verify-success`,
    handleCodeInApp: false,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email, {
    url: `${window.location.origin}/login`,
  });
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  
  // First, invalidate the server session
  try {
    await fetch('/api/auth', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch (e) {
    console.warn('[Firebase Client] Failed to invalidate server session:', e);
  }
  
  // Then sign out from Firebase
  await firebaseSignOut(auth);
}

/**
 * Get the current user's ID token for API authentication
 * Forces refresh to ensure token is valid
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  
  if (!user) {
    return null;
  }
  
  return user.getIdToken(forceRefresh);
}

/**
 * Create a session cookie by exchanging the ID token with the server
 * Call this after successful sign-in
 */
export async function createSession(): Promise<{ success: boolean; error?: string }> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  
  if (!user) {
    return { success: false, error: 'No user signed in' };
  }
  
  try {
    const idToken = await user.getIdToken(true);
    
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || 'Failed to create session' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('[Firebase Client] Session creation failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current user synchronously (may be null if not loaded)
 */
export function getCurrentUser(): User | null {
  const auth = getFirebaseAuth();
  return auth.currentUser;
}

// ─── Type Exports ────────────────────────────────────────────────────────────

export type { User, UserCredential };
