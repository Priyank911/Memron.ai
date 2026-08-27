// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Direct user sync API endpoint
// Called after successful sign-up/login to sync user data to both databases.
// Identity claims come from the WorkOS sealed session — no external lookup.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { isOAuthProvider } from '@/lib/workos';
import { syncUser } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        // Authenticate the request via the sealed session cookie
        const session = await getSessionFromRequest(req);

        if (!session?.sub) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        if (!session.email) {
            return NextResponse.json(
                { error: 'User has no email address' },
                { status: 400 }
            );
        }

        // OAuth users (Google/GitHub) are auto-verified by WorkOS.
        const provider = isOAuthProvider(session.provider)
            ? session.provider
            : 'email';

        // Sync to both databases. `workosUserId` maps onto the same identity
        // column used by previous providers, so lookups keep working.
        const result = await syncUser({
            workosUserId: session.sub,
            email: session.email,
            firstName: session.firstName,
            lastName: session.lastName,
            fullName: session.fullName,
            imageUrl: session.imageUrl,
            provider,
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
