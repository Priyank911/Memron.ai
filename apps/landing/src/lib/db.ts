// Dual Database Service
// Orchestrates concurrent writes to PostgreSQL (primary) and Firebase (backup)
// Implements failover reads: PostgreSQL first → Firebase fallback

import { saveUserToPostgres, getUserFromPostgres, getUserByEmailFromPostgres } from './postgres';
import { saveUserToFirebase, getUserFromFirebase, getUserByEmailFromFirebase } from './firebase';

// ─── Types ──────────────────────────────────────────────────

export interface UserData {
    clerkId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    imageUrl?: string | null;
    provider?: string;
}

export interface SyncResult {
    success: boolean;
    postgres: { success: boolean; error?: string };
    firebase: { success: boolean; error?: string };
    source: 'both' | 'postgres_only' | 'firebase_only' | 'none';
}

// ─── Write Operations (Concurrent Dual-Write) ──────────────

/**
 * Save user to BOTH databases concurrently.
 * 
 * Strategy: "Write to both, succeed if at least one works"
 * - Best case: Both succeed → data is fully redundant
 * - Acceptable: One succeeds → data is in at least one DB
 * - Worst case: Both fail → returns error with details
 * 
 * This ensures maximum availability — even if one database is
 * temporarily down, the user's data is still persisted.
 */
export async function syncUser(userData: UserData): Promise<SyncResult> {
    // Fire both writes concurrently for speed
    const [pgResult, fbResult] = await Promise.allSettled([
        saveUserToPostgres(userData),
        saveUserToFirebase(userData),
    ]);

    const postgres = pgResult.status === 'fulfilled'
        ? pgResult.value
        : { success: false, error: (pgResult as PromiseRejectedResult).reason?.message || 'PostgreSQL write failed' };

    const firebase = fbResult.status === 'fulfilled'
        ? fbResult.value
        : { success: false, error: (fbResult as PromiseRejectedResult).reason?.message || 'Firebase write failed' };

    // Determine which databases received the data
    let source: SyncResult['source'] = 'none';
    if (postgres.success && firebase.success) source = 'both';
    else if (postgres.success) source = 'postgres_only';
    else if (firebase.success) source = 'firebase_only';

    const success = postgres.success || firebase.success;

    // Log sync status for monitoring
    if (source === 'both') {
        console.log(`[DualDB] ✅ User ${userData.clerkId} synced to BOTH databases`);
    } else if (source !== 'none') {
        console.warn(`[DualDB] ⚠️ User ${userData.clerkId} synced to ${source} only`);
        if (!postgres.success) console.warn(`[DualDB] PostgreSQL error: ${postgres.error}`);
        if (!firebase.success) console.warn(`[DualDB] Firebase error: ${firebase.error}`);
    } else {
        console.error(`[DualDB] ❌ User ${userData.clerkId} failed to sync to ANY database`);
        console.error(`[DualDB] PostgreSQL: ${postgres.error}`);
        console.error(`[DualDB] Firebase: ${firebase.error}`);
    }

    return { success, postgres, firebase, source };
}

// ─── Read Operations (Failover Pattern) ─────────────────────

/**
 * Get user by clerkId with failover.
 * 
 * Strategy: "Read from primary (PostgreSQL), fallback to Firebase"
 * - PostgreSQL is always tried first (source of truth)
 * - If PostgreSQL fails or returns null, try Firebase
 * - Returns the user data with source info for debugging
 */
export async function getUser(clerkId: string): Promise<{
    user: any | null;
    source: 'postgres' | 'firebase' | null;
}> {
    // Try PostgreSQL first (primary)
    try {
        const pgUser = await getUserFromPostgres(clerkId);
        if (pgUser) {
            return { user: pgUser, source: 'postgres' };
        }
    } catch (error: any) {
        console.warn(`[DualDB] PostgreSQL read failed for ${clerkId}: ${error.message}`);
    }

    // Fallback to Firebase
    try {
        const fbUser = await getUserFromFirebase(clerkId);
        if (fbUser) {
            console.info(`[DualDB] 🔄 Served user ${clerkId} from Firebase (PostgreSQL unavailable)`);
            return { user: fbUser, source: 'firebase' };
        }
    } catch (error: any) {
        console.error(`[DualDB] Firebase read also failed for ${clerkId}: ${error.message}`);
    }

    return { user: null, source: null };
}

/**
 * Get user by email with failover.
 */
export async function getUserByEmail(email: string): Promise<{
    user: any | null;
    source: 'postgres' | 'firebase' | null;
}> {
    // Try PostgreSQL first
    try {
        const pgUser = await getUserByEmailFromPostgres(email);
        if (pgUser) {
            return { user: pgUser, source: 'postgres' };
        }
    } catch (error: any) {
        console.warn(`[DualDB] PostgreSQL read failed for email ${email}: ${error.message}`);
    }

    // Fallback to Firebase
    try {
        const fbUser = await getUserByEmailFromFirebase(email);
        if (fbUser) {
            return { user: fbUser, source: 'firebase' };
        }
    } catch (error: any) {
        console.error(`[DualDB] Firebase read also failed for email ${email}: ${error.message}`);
    }

    return { user: null, source: null };
}

// ─── Health Check ────────────────────────────────────────────

/**
 * Check the health of both databases
 * Useful for monitoring and admin dashboard
 */
export async function checkHealth(): Promise<{
    postgres: { connected: boolean; latencyMs?: number; error?: string };
    firebase: { connected: boolean; latencyMs?: number; error?: string };
}> {
    // Check PostgreSQL
    let pgHealth: any = { connected: false };
    try {
        const start = Date.now();
        const { testConnection } = await import('./postgres');
        const connected = await testConnection();
        pgHealth = { connected, latencyMs: Date.now() - start };
    } catch (error: any) {
        pgHealth = { connected: false, error: error.message };
    }

    // Check Firebase
    let fbHealth: any = { connected: false };
    try {
        const start = Date.now();
        const { db } = await import('./firebase');
        // Try to read a non-existent doc (fast operation to verify connectivity)
        await db.collection('_health').doc('ping').get();
        fbHealth = { connected: true, latencyMs: Date.now() - start };
    } catch (error: any) {
        // Firebase Admin throws if truly disconnected; permission errors mean it's connected
        if (error.code === 'permission-denied') {
            fbHealth = { connected: true, latencyMs: 0 };
        } else {
            fbHealth = { connected: false, error: error.message };
        }
    }

    return { postgres: pgHealth, firebase: fbHealth };
}
