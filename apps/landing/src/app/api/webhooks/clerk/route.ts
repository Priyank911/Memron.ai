// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Clerk Webhook Handler
// Automatically syncs user data to both PostgreSQL and Firebase
// when users sign up, sign in, or update their profiles via Clerk

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { syncUser, deactivateUser, updateLastLogin } from '@/lib/db';

// Clerk sends webhooks signed with Svix
// Verify the webhook signature to prevent spoofing
async function verifyWebhook(req: NextRequest) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        throw new Error('CLERK_WEBHOOK_SECRET is not set in environment variables');
    }

    const headerPayload = await headers();
    const svixId = headerPayload.get('svix-id');
    const svixTimestamp = headerPayload.get('svix-timestamp');
    const svixSignature = headerPayload.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Missing Svix headers');
    }

    const body = await req.text();
    const wh = new Webhook(WEBHOOK_SECRET);

    return wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
    }) as any;
}

export async function POST(req: NextRequest) {
    try {
        const payload = await verifyWebhook(req);
        const eventType = payload.type;

        console.log(`[Webhook] Received Clerk event: ${eventType}`);

        // ─── User Creation & Updates ─────────────────────
        if (
            eventType === 'user.created' ||
            eventType === 'user.updated'
        ) {
            const { id, email_addresses, first_name, last_name, image_url } = payload.data;

            const primaryEmail = email_addresses?.find(
                (e: any) => e.id === payload.data.primary_email_address_id
            )?.email_address || email_addresses?.[0]?.email_address;

            if (!primaryEmail) {
                console.warn(`[Webhook] User ${id} has no email address, skipping sync`);
                return NextResponse.json({ received: true, synced: false });
            }

            // Determine auth provider
            const provider = email_addresses?.[0]?.verification?.strategy || 'email';

            // Sync to both databases concurrently with timeout protection
            const result = await syncUser({
                clerkId: id,
                email: primaryEmail,
                firstName: first_name,
                lastName: last_name,
                fullName: [first_name, last_name].filter(Boolean).join(' ') || null,
                imageUrl: image_url,
                provider: provider,
            });

            console.log(`[Webhook] User sync result: ${result.source} (pg: ${result.postgres.success}, fb: ${result.firebase.success})`);

            return NextResponse.json({
                received: true,
                synced: result.success,
                source: result.source,
            });
        }

        // ─── User Deletion ───────────────────────────────
        if (eventType === 'user.deleted') {
            const { id } = payload.data;
            console.log(`[Webhook] User ${id} deleted — deactivating in both databases`);

            const result = await deactivateUser(id);

            console.log(`[Webhook] Deactivation result: ${result.source} (pg: ${result.postgres.success}, fb: ${result.firebase.success})`);

            return NextResponse.json({
                received: true,
                action: 'deactivated',
                success: result.success,
                source: result.source,
            });
        }

        // ─── Session Created (Login Tracking) ────────────
        if (eventType === 'session.created') {
            const userId = payload.data?.user_id;
            if (userId) {
                console.log(`[Webhook] Session created for user ${userId} — updating last login`);

                const result = await updateLastLogin(userId);

                console.log(`[Webhook] Last login update: ${result.source} (pg: ${result.postgres.success}, fb: ${result.firebase.success})`);

                return NextResponse.json({
                    received: true,
                    action: 'last_login_updated',
                    success: result.success,
                    source: result.source,
                });
            }
            return NextResponse.json({ received: true });
        }

        // Unhandled event type
        return NextResponse.json({ received: true, handled: false });

    } catch (error: any) {
        console.error('[Webhook] Error processing webhook:', error.message);
        return NextResponse.json(
            { error: 'Webhook processing failed', message: error.message },
            { status: 400 }
        );
    }
}
