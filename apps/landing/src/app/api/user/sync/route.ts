// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Direct user sync API endpoint
// Called after successful sign-up/login to sync user data to both databases
// This is a simpler alternative to webhooks — works immediately on the client side

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { syncUser } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        // Authenticate the request via Clerk
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get full user data from Clerk
        const user = await currentUser();

        if (!user) {
            return NextResponse.json(
                { error: 'User not found in Clerk' },
                { status: 404 }
            );
        }

        const primaryEmail = user.emailAddresses.find(
            (e) => e.id === user.primaryEmailAddressId
        )?.emailAddress || user.emailAddresses[0]?.emailAddress;

        if (!primaryEmail) {
            return NextResponse.json(
                { error: 'User has no email address' },
                { status: 400 }
            );
        }

        // Sync to both databases
        const result = await syncUser({
            clerkId: user.id,
            email: primaryEmail,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            imageUrl: user.imageUrl,
            provider: user.externalAccounts?.[0]?.provider || 'email',
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
            { error: 'Sync failed', message: error.message },
            { status: 500 }
        );
    }
}
