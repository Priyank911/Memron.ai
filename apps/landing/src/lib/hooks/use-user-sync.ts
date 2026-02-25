// Hook to automatically sync user data to databases after login
// Call this in any authenticated page to ensure the user's data
// is stored in both PostgreSQL and Firebase
//
// Features:
// - Syncs once per session using sessionStorage (persists across page navigations)
// - Retries up to 2 times on failure with exponential backoff
// - Silent fallback — the webhook handles sync as backup
// - Also checks onboarding status and sets cookie

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1500;
const SYNC_KEY = 'memron_user_synced';

// Helper to set cookie
function setCookie(name: string, value: string, days: number) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// Helper to get cookie
function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

/**
 * Returns { isReady } — `false` until we have confirmed this user
 * is onboarded and belongs on the dashboard.  The dashboard should
 * show a loading spinner while isReady === false to prevent any
 * flash of content before a potential redirect to /onboarding.
 */
export function useUserSync(): { isReady: boolean } {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const retryCount = useRef(0);
    const isSyncing = useRef(false);
    // Tracks whether the onboarding check has completed and confirmed
    // this user is onboarded (i.e. the dashboard may render).
    const [isReady, setIsReady] = useState(() => {
        // Fast path: if the onboarded cookie already exists we can
        // render immediately — the server middleware already validated it.
        if (typeof document !== 'undefined') {
            return document.cookie.includes('memron_onboarded=true');
        }
        return false;
    });

    const syncUser = useCallback(async () => {
        // Prevent concurrent syncs
        if (isSyncing.current) return;
        
        // Check sessionStorage to prevent duplicate syncs across navigations
        const syncedUserId = typeof window !== 'undefined' ? sessionStorage.getItem(SYNC_KEY) : null;
        if (syncedUserId === user?.id) {
            return; // Already synced this session
        }

        isSyncing.current = true;

        try {
            const response = await fetch('/api/user/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`[UserSync] ✅ Synced to: ${data.synced}`);
                // Mark as synced in sessionStorage
                if (typeof window !== 'undefined' && user?.id) {
                    sessionStorage.setItem(SYNC_KEY, user.id);
                }
                
                // Check onboarding status and set cookie
                await checkOnboardingStatus();
                
                retryCount.current = 0;
            } else if (response.status >= 500 && retryCount.current < MAX_RETRIES) {
                // Server error — retry with exponential backoff
                retryCount.current++;
                const delay = BASE_DELAY_MS * Math.pow(2, retryCount.current - 1);
                console.warn(`[UserSync] ⚠️ Server error (${response.status}), retrying in ${delay}ms`);
                setTimeout(() => {
                    isSyncing.current = false;
                    syncUser();
                }, delay);
                return; // Don't reset isSyncing yet
            } else {
                console.warn(`[UserSync] Sync failed with status ${response.status}`);
            }
        } catch (error) {
            if (retryCount.current < MAX_RETRIES) {
                retryCount.current++;
                const delay = BASE_DELAY_MS * Math.pow(2, retryCount.current - 1);
                console.warn(`[UserSync] ⚠️ Network error, retrying in ${delay}ms`);
                setTimeout(() => {
                    isSyncing.current = false;
                    syncUser();
                }, delay);
                return; // Don't reset isSyncing yet
            } else {
                // Silent fail — the webhook will handle sync as backup
                console.warn('[UserSync] Could not sync user after retries');
            }
        }

        isSyncing.current = false;
    }, [user?.id]);

    const checkOnboardingStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/onboarding', {
                credentials: 'include',
            });

            // Guard: ensure we got JSON back, not an HTML error page
            if (!res.ok) {
                console.warn('[UserSync] Onboarding check returned', res.status, '— skipping redirect');
                return;
            }
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.warn('[UserSync] Onboarding check returned non-JSON — skipping redirect');
                return;
            }

            const data = await res.json();

            if (data.isOnboarded) {
                // Returning user — heal cookie in case it was cleared, then stay put
                setCookie('memron_onboarded', 'true', 365);
                setIsReady(true);
            } else {
                // Genuinely new user — send them through onboarding
                if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/onboarding')) {
                    router.replace('/onboarding');
                }
            }
        } catch (err) {
            console.error('[UserSync] Failed to check onboarding:', err);
            // On network error, allow rendering to avoid infinite loading.
            // The middleware is the primary guard; this is defense-in-depth.
            setIsReady(true);
        }
    }, [router]);

    useEffect(() => {
        // Only run after user is loaded
        if (!isLoaded || !user) return;

        const syncedUserId = typeof window !== 'undefined' ? sessionStorage.getItem(SYNC_KEY) : null;

        if (syncedUserId === user.id) {
            // Already synced this browser session, but cookie may have been cleared.
            // If no onboarding cookie, re-run the status check so the server can heal it.
            const hasOnboardedCookie = getCookie('memron_onboarded') === 'true';
            if (!hasOnboardedCookie) {
                checkOnboardingStatus();
            } else {
                setIsReady(true);
            }
            return;
        }

        syncUser();
    }, [isLoaded, user, syncUser, checkOnboardingStatus]);

    return { isReady };
}
