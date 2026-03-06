// Dual Database Service
// Orchestrates concurrent writes to PostgreSQL (primary) and Firebase (backup)
// Implements failover reads with auto-repair: PostgreSQL first → Firebase fallback
// When a read finds data in only one DB, it backfills the other asynchronously

import { saveUserToPostgres, getUserFromPostgres, getUserByEmailFromPostgres } from './postgres';
import { saveUserToFirebase, getUserFromFirebase, getUserByEmailFromFirebase } from './firebase';
import { syncUserToSupabase } from './supabase-sync';

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

// ─── Config ─────────────────────────────────────────────────

/** Timeout for individual DB operations (ms). Prevents one slow DB from blocking the entire sync. */
const DB_TIMEOUT_MS = 8000;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * `ms` milliseconds, rejects with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        promise
            .then((val) => { clearTimeout(timer); resolve(val); })
            .catch((err) => { clearTimeout(timer); reject(err); });
    });
}

// ─── Write Operations (Concurrent Dual-Write) ──────────────

/**
 * Save user to BOTH databases concurrently with timeout protection.
 *
 * Strategy: "Write to both, succeed if at least one works"
 * - Best case: Both succeed → data is fully redundant
 * - Acceptable: One succeeds → data is in at least one DB
 * - Worst case: Both fail → returns error with details from both
 *
 * Each write has an independent timeout so a slow/hung connection
 * to one database does not block the other.
 */
export async function syncUser(userData: UserData): Promise<SyncResult> {
    // Fire both writes concurrently, each with its own timeout
    const [pgResult, fbResult] = await Promise.allSettled([
        withTimeout(saveUserToPostgres(userData), DB_TIMEOUT_MS, 'PostgreSQL write'),
        withTimeout(saveUserToFirebase(userData), DB_TIMEOUT_MS, 'Firebase write'),
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
        // success — silent
    } else if (source !== 'none') {
        console.warn(`[DualDB] ⚠️ User ${userData.clerkId} synced to ${source} only`);
        if (!postgres.success) console.warn(`[DualDB] PostgreSQL error: ${postgres.error}`);
        if (!firebase.success) console.warn(`[DualDB] Firebase error: ${firebase.error}`);
    } else {
        console.error(`[DualDB] ❌ User ${userData.clerkId} failed to sync to ANY database`);
        console.error(`[DualDB] PostgreSQL: ${postgres.error}`);
        console.error(`[DualDB] Firebase: ${firebase.error}`);
    }

    // ── Supabase mirror (non-blocking) ──────────────────────
    // Fire-and-forget: ensures the MCP server's Supabase DB always has the
    // latest user record, even when the primary PG is a different instance.
    if (success) {
        syncUserToSupabase({
            clerkId: userData.clerkId,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            fullName: userData.fullName,
            imageUrl: userData.imageUrl,
            provider: userData.provider,
        }).catch((err: any) => {
            console.warn(`[DualDB] Supabase sync (non-fatal): ${err.message}`);
        });
    }

    return { success, postgres, firebase, source };
}

// ─── Read Operations (Failover + Auto-Repair) ───────────────

/**
 * Backfill the missing database asynchronously.
 * Called when a read finds data in only one DB — writes to the other
 * in the background so both DBs converge without blocking the response.
 */
function scheduleBackfill(userData: UserData, missingIn: 'postgres' | 'firebase'): void {
    const task =
        missingIn === 'postgres'
            ? withTimeout(saveUserToPostgres(userData), DB_TIMEOUT_MS, 'Backfill PostgreSQL')
            : withTimeout(saveUserToFirebase(userData), DB_TIMEOUT_MS, 'Backfill Firebase');

    task
        .then((r) => {
            if (r.success) {
                console.log(`[DualDB] 🔧 Auto-repaired: backfilled user ${userData.clerkId} to ${missingIn}`);
            } else {
                console.warn(`[DualDB] 🔧 Backfill to ${missingIn} returned failure: ${r.error}`);
            }
        })
        .catch((err) => {
            console.warn(`[DualDB] 🔧 Backfill to ${missingIn} failed: ${err.message}`);
        });
}

/**
 * Normalize user data from either source into a common shape for backfill.
 */
function toUserData(raw: any): UserData | null {
    if (!raw) return null;
    return {
        clerkId: raw.clerkId || raw.clerk_id,
        email: raw.email,
        firstName: raw.firstName ?? raw.first_name ?? null,
        lastName: raw.lastName ?? raw.last_name ?? null,
        fullName: raw.fullName ?? raw.full_name ?? null,
        imageUrl: raw.imageUrl ?? raw.image_url ?? null,
        provider: raw.provider ?? 'email',
    };
}

/**
 * Get user by clerkId with failover and auto-repair.
 *
 * Strategy: "Read from primary (PostgreSQL), fallback to Firebase"
 * - PostgreSQL is always tried first (source of truth)
 * - If PostgreSQL fails or returns null, try Firebase
 * - When data is only in one DB, schedules a background backfill to the other
 */
export async function getUser(clerkId: string): Promise<{
    user: any | null;
    source: 'postgres' | 'firebase' | null;
}> {
    let pgUser: any = null;
    let pgFailed = false;

    // Try PostgreSQL first (primary)
    try {
        pgUser = await withTimeout(getUserFromPostgres(clerkId), DB_TIMEOUT_MS, 'PostgreSQL read');
    } catch (error: any) {
        pgFailed = true;
        console.warn(`[DualDB] PostgreSQL read failed for ${clerkId}: ${error.message}`);
    }

    if (pgUser) {
        // Got data from Postgres — check if Firebase also has it (async, non-blocking)
        getUserFromFirebase(clerkId)
            .then((fbUser) => {
                if (!fbUser) {
                    const userData = toUserData(pgUser);
                    if (userData) scheduleBackfill(userData, 'firebase');
                }
            })
            .catch(() => { /* silent — best effort */ });

        return { user: pgUser, source: 'postgres' };
    }

    // Fallback to Firebase
    let fbUser: any = null;
    try {
        fbUser = await withTimeout(getUserFromFirebase(clerkId), DB_TIMEOUT_MS, 'Firebase read');
    } catch (error: any) {
        console.error(`[DualDB] Firebase read also failed for ${clerkId}: ${error.message}`);
    }

    if (fbUser) {
        console.info(`[DualDB] 🔄 Served user ${clerkId} from Firebase (PostgreSQL ${pgFailed ? 'error' : 'empty'})`);
        // Auto-repair: backfill to PostgreSQL
        const userData = toUserData(fbUser);
        if (userData) scheduleBackfill(userData, 'postgres');
        return { user: fbUser, source: 'firebase' };
    }

    return { user: null, source: null };
}

/**
 * Get user by email with failover and auto-repair.
 */
export async function getUserByEmail(email: string): Promise<{
    user: any | null;
    source: 'postgres' | 'firebase' | null;
}> {
    let pgUser: any = null;
    let pgFailed = false;

    // Try PostgreSQL first
    try {
        pgUser = await withTimeout(getUserByEmailFromPostgres(email), DB_TIMEOUT_MS, 'PostgreSQL read');
    } catch (error: any) {
        pgFailed = true;
        console.warn(`[DualDB] PostgreSQL read failed for email ${email}: ${error.message}`);
    }

    if (pgUser) {
        // Async backfill check for Firebase
        getUserByEmailFromFirebase(email)
            .then((fbUser) => {
                if (!fbUser) {
                    const userData = toUserData(pgUser);
                    if (userData) scheduleBackfill(userData, 'firebase');
                }
            })
            .catch(() => { /* silent */ });

        return { user: pgUser, source: 'postgres' };
    }

    // Fallback to Firebase
    let fbUser: any = null;
    try {
        fbUser = await withTimeout(getUserByEmailFromFirebase(email), DB_TIMEOUT_MS, 'Firebase read');
    } catch (error: any) {
        console.error(`[DualDB] Firebase read also failed for email ${email}: ${error.message}`);
    }

    if (fbUser) {
        console.info(`[DualDB] 🔄 Served user by email from Firebase (PostgreSQL ${pgFailed ? 'error' : 'empty'})`);
        const userData = toUserData(fbUser);
        if (userData) scheduleBackfill(userData, 'postgres');
        return { user: fbUser, source: 'firebase' };
    }

    return { user: null, source: null };
}

// ─── Delete / Deactivate (Dual-Write) ──────────────────────

/**
 * Soft-delete a user from both databases.
 * Sets `is_active = false` in PostgreSQL and `isActive = false` in Firebase.
 */
export async function deactivateUser(clerkId: string): Promise<SyncResult> {
    const [pgResult, fbResult] = await Promise.allSettled([
        withTimeout((async () => {
            const { query } = await import('./postgres');
            await query('UPDATE users SET is_active = false, updated_at = NOW() WHERE clerk_id = $1', [clerkId]);
            return { success: true };
        })(), DB_TIMEOUT_MS, 'PostgreSQL deactivate'),
        withTimeout((async () => {
            const { getFirebaseAdmin } = await import('./firebase');
            const fb = getFirebaseAdmin();
            if (!fb) throw new Error('Firebase not configured');
            await fb.db.collection('users').doc(clerkId).update({
                isActive: false,
                updatedAt: new Date(),
            });
            return { success: true };
        })(), DB_TIMEOUT_MS, 'Firebase deactivate'),
    ]);

    const postgres = pgResult.status === 'fulfilled'
        ? pgResult.value
        : { success: false, error: (pgResult as PromiseRejectedResult).reason?.message || 'PostgreSQL deactivate failed' };

    const firebase = fbResult.status === 'fulfilled'
        ? fbResult.value
        : { success: false, error: (fbResult as PromiseRejectedResult).reason?.message || 'Firebase deactivate failed' };

    let source: SyncResult['source'] = 'none';
    if (postgres.success && firebase.success) source = 'both';
    else if (postgres.success) source = 'postgres_only';
    else if (firebase.success) source = 'firebase_only';

    const success = postgres.success || firebase.success;

    if (success) {
        console.log(`[DualDB] 🗑️ User ${clerkId} deactivated in ${source}`);
    } else {
        console.error(`[DualDB] ❌ Failed to deactivate user ${clerkId} in any database`);
    }

    return { success, postgres, firebase, source };
}

// ─── Last Login Update (Dual-Write) ─────────────────────────

/**
 * Update `last_login_at` in both databases.
 * Called on session.created webhook to track login activity.
 */
export async function updateLastLogin(clerkId: string): Promise<SyncResult> {
    const [pgResult, fbResult] = await Promise.allSettled([
        withTimeout((async () => {
            const { query } = await import('./postgres');
            await query('UPDATE users SET last_login_at = NOW() WHERE clerk_id = $1', [clerkId]);
            return { success: true };
        })(), DB_TIMEOUT_MS, 'PostgreSQL updateLastLogin'),
        withTimeout((async () => {
            const { getFirebaseAdmin } = await import('./firebase');
            const fb = getFirebaseAdmin();
            if (!fb) throw new Error('Firebase not configured');
            await fb.db.collection('users').doc(clerkId).update({
                lastLoginAt: new Date(),
            });
            return { success: true };
        })(), DB_TIMEOUT_MS, 'Firebase updateLastLogin'),
    ]);

    const postgres = pgResult.status === 'fulfilled'
        ? pgResult.value
        : { success: false, error: (pgResult as PromiseRejectedResult).reason?.message || 'PostgreSQL updateLastLogin failed' };

    const firebase = fbResult.status === 'fulfilled'
        ? fbResult.value
        : { success: false, error: (fbResult as PromiseRejectedResult).reason?.message || 'Firebase updateLastLogin failed' };

    let source: SyncResult['source'] = 'none';
    if (postgres.success && firebase.success) source = 'both';
    else if (postgres.success) source = 'postgres_only';
    else if (firebase.success) source = 'firebase_only';

    return { success: postgres.success || firebase.success, postgres, firebase, source };
}

// ─── Health Check ────────────────────────────────────────────

/**
 * Check the health of both databases concurrently with timeouts.
 * Returns connection status and latency for monitoring.
 */
export async function checkHealth(): Promise<{
    postgres: { connected: boolean; latencyMs?: number; error?: string };
    firebase: { connected: boolean; latencyMs?: number; error?: string };
}> {
    const [pgHealth, fbHealth] = await Promise.allSettled([
        // PostgreSQL health with timeout
        withTimeout((async () => {
            const start = Date.now();
            const { testConnection } = await import('./postgres');
            const connected = await testConnection();
            return { connected, latencyMs: Date.now() - start };
        })(), DB_TIMEOUT_MS, 'PostgreSQL health'),
        // Firebase health with timeout
        withTimeout((async () => {
            const start = Date.now();
            const { getFirebaseAdmin } = await import('./firebase');
            const fb = getFirebaseAdmin();
            if (!fb) throw new Error('Firebase not configured');
            try {
                await fb.db.collection('_health').doc('ping').get();
                return { connected: true, latencyMs: Date.now() - start };
            } catch (error: any) {
                if (error.code === 'permission-denied') {
                    return { connected: true, latencyMs: Date.now() - start };
                }
                throw error;
            }
        })(), DB_TIMEOUT_MS, 'Firebase health'),
    ]);

    return {
        postgres: pgHealth.status === 'fulfilled'
            ? pgHealth.value
            : { connected: false, error: (pgHealth as PromiseRejectedResult).reason?.message || 'Health check failed' },
        firebase: fbHealth.status === 'fulfilled'
            ? fbHealth.value
            : { connected: false, error: (fbHealth as PromiseRejectedResult).reason?.message || 'Health check failed' },
    };
}
