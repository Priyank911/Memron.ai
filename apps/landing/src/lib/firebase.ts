// Firebase Configuration - Secondary/Backup Database
// Used for redundant storage and real-time sync capabilities

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

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
        const userRef = doc(db, 'users', userData.clerkId);
        const existingUser = await getDoc(userRef);

        if (existingUser.exists()) {
            // Update existing user
            await updateDoc(userRef, {
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
            });
        } else {
            // Create new user
            await setDoc(userRef, {
                clerkId: userData.clerkId,
                email: userData.email,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                fullName: userData.fullName || null,
                imageUrl: userData.imageUrl || null,
                provider: userData.provider || 'email',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
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
        const userRef = doc(db, 'users', clerkId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
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
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnap = await getDocs(q);

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
