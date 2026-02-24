// Firebase Admin Configuration - Secondary/Backup Database
// Uses Firebase Admin SDK for server-side operations (bypasses Firestore security rules)

import * as admin from 'firebase-admin';

// Parse service account from environment variable
function getServiceAccount(): admin.ServiceAccount | undefined {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) return undefined;
    try {
        return JSON.parse(raw) as admin.ServiceAccount;
    } catch {
        // Try base64-encoded JSON
        try {
            return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as admin.ServiceAccount;
        } catch {
            console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY');
            return undefined;
        }
    }
}

// Initialize Firebase Admin (prevent duplicate initialization)
if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } else if (projectId) {
        // Fallback: initialize with project ID only (works in Google Cloud environments)
        admin.initializeApp({
            projectId,
        });
    } else {
        console.warn('[Firebase] No service account or project ID configured. Firebase will not work.');
    }
}

const app = admin.apps[0]!;
const db = admin.firestore();

// ─── User Operations ────────────────────────────────────────

export interface FirebaseUser {
    clerkId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    imageUrl: string | null;
    provider: string;
    createdAt: any;
    updatedAt: any;
    lastLoginAt: any;
    isActive: boolean;
}

/**
 * Save or update a user in Firebase Firestore
 * Uses clerkId as the document ID for easy lookup
 */
export async function saveUserToFirebase(userData: {
    clerkId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    imageUrl?: string | null;
    provider?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const userRef = db.collection('users').doc(userData.clerkId);
        const existingUser = await userRef.get();

        if (existingUser.exists) {
            // Update existing user
            await userRef.update({
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            // Create new user
            await userRef.set({
                clerkId: userData.clerkId,
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                provider: userData.provider || 'email',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
                isActive: true,
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error('[Firebase] Failed to save user:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get a user from Firebase by clerkId
 * Used as fallback when PostgreSQL is unavailable
 */
export async function getUserFromFirebase(
    clerkId: string
): Promise<FirebaseUser | null> {
    try {
        const userRef = db.collection('users').doc(clerkId);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
            return userSnap.data() as FirebaseUser;
        }
        return null;
    } catch (error: any) {
        console.error('[Firebase] Failed to get user:', error.message);
        return null;
    }
}

/**
 * Get a user from Firebase by email
 */
export async function getUserByEmailFromFirebase(
    email: string
): Promise<FirebaseUser | null> {
    try {
        const usersRef = db.collection('users');
        const querySnap = await usersRef.where('email', '==', email).get();

        if (!querySnap.empty) {
            return querySnap.docs[0].data() as FirebaseUser;
        }
        return null;
    } catch (error: any) {
        console.error('[Firebase] Failed to get user by email:', error.message);
        return null;
    }
}

export { db, app };
