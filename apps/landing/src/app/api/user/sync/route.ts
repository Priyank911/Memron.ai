// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Direct user sync API endpoint
// Called after successful sign-up/login to sync user data to both databases
// This is a simpler alternative to webhooks — works immediately on the client side

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { getFirebaseUser } from '@/lib/firebase-admin';
import { syncUser } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        // Authenticate the request via Firebase session cookie
        const authUser = await auth(req);

        if (!authUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get full user data from Firebase
        const firebaseUser = await getFirebaseUser(authUser.uid);

        if (!firebaseUser) {
            return NextResponse.json(
                { error: 'User not found in Firebase' },
                { status: 404 }
            );
        }

        if (!firebaseUser.email) {
            return NextResponse.json(
                { error: 'User has no email address' },
                { status: 400 }
            );
        }

        // Parse name from Firebase display name
        const displayName = firebaseUser.displayName || '';
        const [firstName = '', ...lastNameParts] = displayName.split(' ');
        const lastName = lastNameParts.join(' ');
        
        // Determine provider from Firebase
        const providerData = firebaseUser.providerData?.[0];
        const provider = providerData?.providerId?.replace('.com', '') || 'email';

        // Sync to both databases
        const result = await syncUser({
            firebaseUid: authUser.uid,
            email: firebaseUser.email,
            firstName: firstName || null,
            lastName: lastName || null,
            fullName: displayName || null,
            imageUrl: firebaseUser.photoURL || null,
            provider: provider,
        });

        return NextResponse.json({
            success: result.success,
            synced: result.source,
            details: {
                postgres: result.postgres.success,
                firebase: result.firebase.success,
            },
        });

    } catch (error: any) {
        console.error('[API] User sync failed:', error.message);
        return NextResponse.json(
            { error: 'Sync failed' },
            { status: 500 }
        );
    }
}
