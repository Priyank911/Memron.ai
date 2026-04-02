/**
 * Firebase Admin SDK Configuration
 * 
 * Server-side Firebase authentication using Admin SDK.
 * Used for:
 * - Verifying ID tokens
 * - Creating/verifying session cookies
 * - Revoking tokens
 * 
 * This is separate from firebase.ts (which is for Firestore backup database).
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

// ─── Singleton ───────────────────────────────────────────────────────────────

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variables
 */
function initializeFirebaseAdmin(): { app: App; auth: Auth } | null {
  // Return cached instances if available
  if (adminApp && adminAuth) {
    return { app: adminApp, auth: adminAuth };
  }

  // Check for required environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase Admin] Missing credentials - server auth disabled');
    console.warn('[Firebase Admin] Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    return null;
  }

  try {
    // Check if already initialized (e.g., by another module)
    const existingApps = getApps();
    
    // Look for an existing admin app
    const existingApp = existingApps.find(app => app.name === '[DEFAULT]' || app.name === 'admin');
    
    if (existingApp) {
      adminApp = existingApp;
    } else {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    }

    adminAuth = getAuth(adminApp);
    return { app: adminApp, auth: adminAuth };
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
    return null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Get Firebase Admin Auth instance
 * Returns null if not properly configured
 */
export function getFirebaseAdminAuth(): Auth | null {
  const firebase = initializeFirebaseAdmin();
  return firebase?.auth || null;
}

/**
 * Get Firebase Admin App instance
 * Returns null if not properly configured
 */
export function getFirebaseAdminApp(): App | null {
  const firebase = initializeFirebaseAdmin();
  return firebase?.app || null;
}

/**
 * Verify a Firebase ID token
 * Returns decoded token or null if invalid
 */
export async function verifyIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
} | null> {
  const auth = getFirebaseAdminAuth();
  if (!auth) return null;

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
  } catch (error: any) {
    console.error('[Firebase Admin] Token verification failed:', error.message);
    return null;
  }
}

/**
 * Verify a Firebase session cookie
 * Returns decoded claims or null if invalid
 * @param checkRevoked - If true, checks if token has been revoked
 */
export async function verifySessionCookie(
  sessionCookie: string,
  checkRevoked = true
): Promise<{
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
} | null> {
  const auth = getFirebaseAdminAuth();
  if (!auth) return null;

  try {
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, checkRevoked);
    return {
      uid: decodedClaims.uid,
      email: decodedClaims.email,
      emailVerified: decodedClaims.email_verified,
      name: decodedClaims.name,
      picture: decodedClaims.picture,
    };
  } catch (error: any) {
    const msg = error.message || '';
    // Don't log for expected/known errors (stale cookies, expiry, aud mismatch)
    const isExpected = msg.includes('expired') || msg.includes('aud') || msg.includes('audience');
    if (!isExpected) {
      console.error('[Firebase Admin] Session verification failed:', msg);
    }
    return null;
  }
}

/**
 * Get user by UID from Firebase Auth
 */
export async function getFirebaseUser(uid: string) {
  const auth = getFirebaseAdminAuth();
  if (!auth) return null;

  try {
    return await auth.getUser(uid);
  } catch (error: any) {
    console.error('[Firebase Admin] Get user failed:', error.message);
    return null;
  }
}

/**
 * Get user by email from Firebase Auth
 */
export async function getFirebaseUserByEmail(email: string) {
  const auth = getFirebaseAdminAuth();
  if (!auth) return null;

  try {
    return await auth.getUserByEmail(email);
  } catch (error: any) {
    if (error.code !== 'auth/user-not-found') {
      console.error('[Firebase Admin] Get user by email failed:', error.message);
    }
    return null;
  }
}
