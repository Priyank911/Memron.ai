// Hook to automatically sync user data to databases after login
// Call this in any authenticated page to ensure the user's data
// is stored in both PostgreSQL and Firebase

'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';

export function useUserSync() {
    const { user, isLoaded } = useUser();
    const hasSynced = useRef(false);

    useEffect(() => {
        // Only sync once per session, after user is loaded
        if (!isLoaded || !user || hasSynced.current) return;

        const syncUser = async () => {
            try {
                const response = await fetch('/api/user/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`[UserSync] Synced to: ${data.synced}`, data.details);
                    hasSynced.current = true;
                } else {
                    console.warn('[UserSync] Sync failed:', response.status);
                }
            } catch (error) {
                // Silent fail — the webhook will handle sync as backup
                console.warn('[UserSync] Could not sync user:', error);
            }
        };

        syncUser();
    }, [isLoaded, user]);
}
