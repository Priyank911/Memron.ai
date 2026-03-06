// Firebase Configuration - Backup Database
// Uses Firebase Admin SDK for server-side operations
// Firestore is used as a backup/fallback storage for user data

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';

// ─── Firebase Admin Initialization ──────────────────────────

let firebaseApp: App | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variables
 */
export function getFirebaseAdmin(): { app: App; db: Firestore } | null {
    // Return cached instances if available
    if (firebaseApp && db) {
        return { app: firebaseApp, db };
    }

    // Check for required environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    // If no Firebase config, return null (Firebase will be skipped gracefully)
    if (!projectId || !clientEmail || !privateKey) {
        console.warn('[Firebase] Missing credentials - Firebase sync disabled');
        console.warn('[Firebase] Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
        return null;
    }

    try {
        // Check if already initialized
        if (getApps().length === 0) {
            firebaseApp = initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
                projectId,
            });
        } else {
            firebaseApp = getApps()[0];
        }

        db = getFirestore(firebaseApp);
        return { app: firebaseApp, db };

    } catch (error: any) {
        console.error('[Firebase] Initialization failed:', error.message);
        return null;
    }
}

// ─── Types ──────────────────────────────────────────────────

export interface FirebaseUser {
    clerkId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    imageUrl: string | null;
    provider: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date;
}

// ─── User Operations ────────────────────────────────────────

/**
 * Save or update a user in Firebase Firestore (upsert)
 */
export async function saveUserToFirebase(userData: {
    clerkId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    imageUrl?: string | null;
    provider?: string;
}): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
    const firebase = getFirebaseAdmin();
    
    if (!firebase) {
        return { 
            success: false, 
            error: 'Firebase not configured - missing credentials' 
        };
    }

    try {
        const { db } = firebase;
        const userRef = db.collection('users').doc(userData.clerkId);
        const existingDoc = await userRef.get();

        const now = Timestamp.now();
        
        if (existingDoc.exists) {
            // Update existing user
            const updateData = {
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                updatedAt: now,
                lastLoginAt: now,
            };
            
            await userRef.update(updateData);
            
            const updatedDoc = await userRef.get();
            const data = updatedDoc.data();
            
            return {
                success: true,
                user: {
                    clerkId: userData.clerkId,
                    email: data?.email,
                    firstName: data?.firstName,
                    lastName: data?.lastName,
                    fullName: data?.fullName,
                    imageUrl: data?.imageUrl,
                    provider: data?.provider || 'email',
                    isActive: data?.isActive ?? true,
                    createdAt: data?.createdAt?.toDate() || new Date(),
                    updatedAt: now.toDate(),
                    lastLoginAt: now.toDate(),
                },
            };
        } else {
            // Create new user
            const newUser = {
                clerkId: userData.clerkId,
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                provider: userData.provider || 'email',
                isActive: true,
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now,
            };
            
            await userRef.set(newUser);
            
            return {
                success: true,
                user: {
                    ...newUser,
                    createdAt: now.toDate(),
                    updatedAt: now.toDate(),
                    lastLoginAt: now.toDate(),
                },
            };
        }
    } catch (error: any) {
        console.error('[Firebase] Failed to save user:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get a user from Firebase by clerkId
 */
export async function getUserFromFirebase(clerkId: string): Promise<FirebaseUser | null> {
    const firebase = getFirebaseAdmin();
    
    if (!firebase) {
        return null;
    }

    try {
        const { db } = firebase;
        const userDoc = await db.collection('users').doc(clerkId).get();

        if (!userDoc.exists) {
            return null;
        }

        const data = userDoc.data()!;
        return {
            clerkId: data.clerkId,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            fullName: data.fullName,
            imageUrl: data.imageUrl,
            provider: data.provider || 'email',
            isActive: data.isActive ?? true,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
        };
    } catch (error: any) {
        console.error('[Firebase] Failed to get user:', error.message);
        return null;
    }
}

/**
 * Get a user from Firebase by email
 */
export async function getUserByEmailFromFirebase(email: string): Promise<FirebaseUser | null> {
    const firebase = getFirebaseAdmin();
    
    if (!firebase) {
        return null;
    }

    try {
        const { db } = firebase;
        const querySnapshot = await db
            .collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            return null;
        }

        const doc = querySnapshot.docs[0];
        const data = doc.data();
        
        return {
            clerkId: data.clerkId,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            fullName: data.fullName,
            imageUrl: data.imageUrl,
            provider: data.provider || 'email',
            isActive: data.isActive ?? true,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
        };
    } catch (error: any) {
        console.error('[Firebase] Failed to get user by email:', error.message);
        return null;
    }
}

/**
 * Save or update an organization in Firebase under the user's document.
 * Written during Step 1 (create-organization) so the data is mirrored immediately.
 */
export async function saveOrganizationToFirebase(data: {
    clerkId: string;
    orgId: string;           // UUID from PostgreSQL
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
}): Promise<{ success: boolean; error?: string }> {
    const firebase = getFirebaseAdmin();
    if (!firebase) return { success: false, error: 'Firebase not configured' };

    try {
        const { db } = firebase;
        // Store under subcollection: users/{clerkId}/organizations/{orgId}
        await db
            .collection('users')
            .doc(data.clerkId)
            .collection('organizations')
            .doc(data.orgId)
            .set({
                orgId: data.orgId,
                name: data.name,
                slug: data.slug,
                description: data.description,
                createdAt: Timestamp.fromDate(data.createdAt),
                updatedAt: Timestamp.now(),
            });
        // Also stamp a summary field on the parent user doc for quick reads
        await db.collection('users').doc(data.clerkId).set(
            {
                workspace: {
                    orgId: data.orgId,
                    name: data.name,
                    slug: data.slug,
                },
            },
            { merge: true }
        );
        return { success: true };
    } catch (error: any) {
        console.error('[Firebase] Failed to save organization:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Save an API key record (prefix + metadata, NEVER the hash) to Firebase
 * under the user's document. Written during Step 2 (generate-api-key).
 */
export async function saveApiKeyToFirebase(data: {
    clerkId: string;
    keyId: string;           // UUID from PostgreSQL
    keyPrefix: string;       // e.g. "mm_live_ab1c"
    keyName: string;
    orgId: string;           // org UUID
    scopes: string[];
    createdAt: Date;
}): Promise<{ success: boolean; error?: string }> {
    const firebase = getFirebaseAdmin();
    if (!firebase) return { success: false, error: 'Firebase not configured' };

    try {
        const { db } = firebase;
        // Store under subcollection: users/{clerkId}/apiKeys/{keyId}
        await db
            .collection('users')
            .doc(data.clerkId)
            .collection('apiKeys')
            .doc(data.keyId)
            .set({
                keyId: data.keyId,
                keyPrefix: data.keyPrefix,
                keyName: data.keyName,
                orgId: data.orgId,
                scopes: data.scopes,
                isActive: true,
                createdAt: Timestamp.fromDate(data.createdAt),
            });
        // Stamp latest key prefix on parent doc for quick lookups
        await db.collection('users').doc(data.clerkId).set(
            { latestApiKeyPrefix: data.keyPrefix },
            { merge: true }
        );
        return { success: true };
    } catch (error: any) {
        console.error('[Firebase] Failed to save API key:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Save structured onboarding profile to Firebase.
 * Called once when the user completes the onboarding flow.
 */
export async function saveOnboardingProfile(data: {
    clerkId: string;
    universalId: string;
    email: string;
    fullName: string | null;
    workspaceName: string;
    workspaceSlug: string;
    workspaceId: string;
    apiKeyPrefix: string;
    onboardedAt: Date;
}): Promise<{ success: boolean; error?: string }> {
    const firebase = getFirebaseAdmin();

    if (!firebase) {
        return { success: false, error: 'Firebase not configured' };
    }

    try {
        const { db } = firebase;
        await db.collection('users').doc(data.clerkId).set(
            {
                isOnboarded: true,
                onboardedAt: Timestamp.fromDate(data.onboardedAt),
                onboarding: {
                    universalId: data.universalId,
                    email: data.email,
                    fullName: data.fullName,
                    workspaceName: data.workspaceName,
                    workspaceSlug: data.workspaceSlug,
                    workspaceId: data.workspaceId,
                    apiKeyPrefix: data.apiKeyPrefix,
                    completedAt: Timestamp.fromDate(data.onboardedAt),
                },
            },
            { merge: true }
        );
        return { success: true };
    } catch (error: any) {
        console.error('[Firebase] Failed to save onboarding profile:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test Firebase connection
 */
export async function testFirebaseConnection(): Promise<boolean> {
    const firebase = getFirebaseAdmin();
    
    if (!firebase) {
        console.warn('[Firebase] Not configured - skipping connection test');
        return false;
    }

    try {
        // Try to access the users collection
        const { db } = firebase;
        await db.collection('users').limit(1).get();
        console.log('[Firebase] Connection test successful');
        return true;
    } catch (error: any) {
        console.error('[Firebase] Connection test failed:', error.message);
        return false;
    }
}
