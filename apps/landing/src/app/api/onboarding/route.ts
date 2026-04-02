import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { getFirebaseUser } from '@/lib/firebase-admin';
import { 
    getUserFromPostgres, 
    createOrganization, 
    checkOrgSlugExists,
    markUserOnboarded,
    saveApiKey,
    getOrganizationByUserId,
    getApiKeysByUserId,
    createMainBucket,
} from '@/lib/postgres';
import { generateApiKey, generateOrgSlug, hashApiKey } from '@/lib/api-key';
import { saveOnboardingProfile, saveOrganizationToFirebase, saveApiKeyToFirebase } from '@/lib/firebase';
import { syncUser } from '@/lib/db';
import {
    syncOrgToSupabase,
    syncApiKeyToSupabase,
    fullOnboardingSyncToSupabase,
} from '@/lib/supabase-sync';

// POST /api/onboarding - Complete onboarding process
export async function POST(request: NextRequest) {
    try {
        const authUser = await auth(request);
        
        if (!authUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }
        const firebaseUid = authUser.uid;

        // Get full user details from Firebase
        const firebaseUser = await getFirebaseUser(firebaseUid);
        if (!firebaseUser) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // SECURITY: Block unverified email users from onboarding
        // OAuth users (Google, GitHub) are auto-verified
        const providerData = firebaseUser.providerData?.[0];
        const isOAuthUser = providerData?.providerId && providerData.providerId !== 'password';
        
        if (!isOAuthUser && !firebaseUser.emailVerified) {
            return NextResponse.json(
                { error: 'Email verification required. Please verify your email before onboarding.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { step, data } = body;

        // Get user from database — auto-sync on first visit (covers brand-new registrations
        // where the background /api/user/sync hasn't fired yet)
        let dbUser = await getUserFromPostgres(firebaseUid);
        if (!dbUser) {
            if (firebaseUser.email) {
                // Parse name from Firebase display name
                const displayName = firebaseUser.displayName || '';
                const [firstName = '', ...lastNameParts] = displayName.split(' ');
                const lastName = lastNameParts.join(' ');
                
                // Determine provider from Firebase
                const providerData = firebaseUser.providerData?.[0];
                const provider = providerData?.providerId?.replace('.com', '') || 'email';
                
                // Try syncing with retry logic (2 attempts)
                for (let attempt = 1; attempt <= 2; attempt++) {
                    const syncResult = await syncUser({
                        firebaseUid: firebaseUid,
                        email: firebaseUser.email,
                        firstName: firstName || null,
                        lastName: lastName || null,
                        fullName: displayName || null,
                        imageUrl: firebaseUser.photoURL || null,
                        provider: provider,
                    });
                    
                    if (syncResult.success) {
                        break;
                    }
                    
                    // If first attempt fails, wait 1s before retry
                    if (attempt === 1 && !syncResult.success) {
                        console.log('[Onboarding API] First sync attempt failed, retrying in 1s...');
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                
                dbUser = await getUserFromPostgres(firebaseUid);
            }
        }
        if (!dbUser) {
            return NextResponse.json(
                { error: 'Could not create user record. Database may be temporarily unavailable. Please try again in a moment.' },
                { status: 503 }
            );
        }

        switch (step) {
            case 'create-organization': {
                const { orgName, orgDescription } = data;

                if (!orgName || orgName.trim().length < 2) {
                    return NextResponse.json(
                        { error: 'Organization name must be at least 2 characters' },
                        { status: 400 }
                    );
                }

                // Generate unique slug
                let slug = generateOrgSlug(orgName);
                let attempts = 0;
                while (await checkOrgSlugExists(slug) && attempts < 5) {
                    slug = generateOrgSlug(orgName);
                    attempts++;
                }

                // Create organization
                const orgResult = await createOrganization({
                    name: orgName.trim(),
                    slug,
                    ownerId: dbUser.id,
                    description: orgDescription?.trim() || null,
                });

                if (!orgResult.success) {
                    return NextResponse.json(
                        { error: orgResult.error || 'Failed to create organization' },
                        { status: 500 }
                    );
                }

                // Mirror organization to Firebase immediately (Step 1 sync)
                saveOrganizationToFirebase({
                    clerkId: firebaseUid, // Using firebaseUid in place of clerkId for compatibility
                    orgId: orgResult.organization!.org_id,
                    name: orgResult.organization!.name,
                    slug: orgResult.organization!.slug,
                    description: orgDescription?.trim() || null,
                    createdAt: orgResult.organization!.created_at,
                }).catch((e: any) => console.warn('[Onboarding API] Firebase org sync (non-fatal):', e.message));

                // Mirror organization to Supabase (non-blocking)
                syncOrgToSupabase({
                    name: orgResult.organization!.name,
                    slug: orgResult.organization!.slug,
                    ownerClerkId: firebaseUid, // Using firebaseUid
                    orgUuid: orgResult.organization!.org_id,
                    description: orgDescription?.trim() || null,
                }).catch((e: any) => console.warn('[Onboarding API] Supabase org sync (non-fatal):', e.message));

                return NextResponse.json({
                    success: true,
                    organization: {
                        id: orgResult.organization!.org_id,
                        name: orgResult.organization!.name,
                        slug: orgResult.organization!.slug,
                    },
                });
            }

            case 'generate-api-key': {
                // Get user's organization
                const org = await getOrganizationByUserId(dbUser.id);
                if (!org) {
                    return NextResponse.json(
                        { error: 'Organization not found. Please create one first.' },
                        { status: 400 }
                    );
                }

                // Guard: if key already exists, never generate a second one.
                // The full key is shown exactly once — returning a new one would be a
                // security mistake and would create duplicate keys.
                const existingKeys = await getApiKeysByUserId(dbUser.id);
                if (existingKeys.length > 0) {
                    return NextResponse.json({
                        success: true,
                        alreadyExists: true,
                        apiKey: {
                            prefix:    existingKeys[0].key_prefix,
                            name:      existingKeys[0].name,
                            createdAt: existingKeys[0].created_at,
                        },
                    });
                }

                // Generate API key
                const apiKey = generateApiKey('live');

                // Save to database (only hash, never the full key)
                const saveResult = await saveApiKey({
                    keyPrefix: apiKey.prefix,
                    keyHash: apiKey.hash,
                    name: data.keyName || 'Default API Key',
                    userId: dbUser.id,
                    orgId: org.id,
                    scopes: ['memory:read', 'memory:write', 'memory:delete'],
                });

                if (!saveResult.success) {
                    return NextResponse.json(
                        { error: saveResult.error || 'Failed to generate API key' },
                        { status: 500 }
                    );
                }

                // Mirror API key metadata to Firebase immediately (Step 2 sync)
                // NOTE: only prefix is stored — NEVER hash or full key
                saveApiKeyToFirebase({
                    clerkId: firebaseUid, // Using firebaseUid
                    keyId: saveResult.apiKey!.key_id,
                    keyPrefix: apiKey.prefix,
                    keyName: data.keyName || 'Default API Key',
                    orgId: org.org_id,
                    scopes: ['memory:read', 'memory:write', 'memory:delete'],
                    createdAt: saveResult.apiKey!.created_at,
                }).catch((e: any) => console.warn('[Onboarding API] Firebase key sync (non-fatal):', e.message));

                // Mirror API key to Supabase (awaited — MCP auth depends on this)
                await syncApiKeyToSupabase({
                    keyPrefix: apiKey.prefix,
                    keyHash: apiKey.hash,
                    name: data.keyName || 'Default API Key',
                    ownerClerkId: firebaseUid, // Using firebaseUid
                    scopes: ['memory:read', 'memory:write', 'memory:delete'],
                }).catch((e: any) => console.error('[Onboarding API] Supabase key sync FAILED:', e.message));

                // Create main bucket in primary DB
                await createMainBucket(dbUser.id, org.id);

                // Return the full key ONCE - user must save it
                return NextResponse.json({
                    success: true,
                    apiKey: {
                        fullKey: apiKey.fullKey,
                        prefix: apiKey.prefix,
                        name: data.keyName || 'Default API Key',
                        createdAt: apiKey.createdAt.toISOString(),
                    },
                    warning: 'Save this API key now. You won\'t be able to see it again.',
                });
            }

            case 'complete': {
                // Mark user as onboarded in PostgreSQL
                const success = await markUserOnboarded(firebaseUid);

                if (!success) {
                    return NextResponse.json(
                        { error: 'Failed to complete onboarding' },
                        { status: 500 }
                    );
                }

                // Sync structured onboarding profile to Firebase (Step 3 — completion record)
                try {
                    const org = await getOrganizationByUserId(dbUser.id);
                    const apiKeys = await getApiKeysByUserId(dbUser.id);
                    const latestKey = apiKeys.length > 0 ? apiKeys[0] : null;
                    const now = new Date();

                    if (org) {
                        await saveOnboardingProfile({
                            clerkId: firebaseUid, // Using firebaseUid
                            universalId: dbUser.universal_id,
                            email: dbUser.email,
                            fullName: dbUser.full_name,
                            workspaceName: org.name,
                            workspaceSlug: org.slug,
                            workspaceId: org.org_id,
                            apiKeyPrefix: latestKey?.key_prefix ?? '',
                            onboardedAt: now,
                        });
                    }
                } catch (fbErr: any) {
                    // Non-fatal — PostgreSQL is the source of truth
                    console.warn('[Onboarding API] Firebase profile sync failed (non-fatal):', fbErr.message);
                }

                // ── Full Supabase sync (user + org + key + bucket) ──
                // Ensures the MCP server's database has the complete user graph.
                try {
                    const org = await getOrganizationByUserId(dbUser.id);
                    const apiKeys = await getApiKeysByUserId(dbUser.id);
                    const latestKey = apiKeys.length > 0 ? apiKeys[0] : null;

                    if (org && latestKey) {
                        fullOnboardingSyncToSupabase({
                            clerkId: firebaseUid, // Using firebaseUid
                            email: dbUser.email,
                            firstName: dbUser.first_name,
                            lastName: dbUser.last_name,
                            fullName: dbUser.full_name,
                            imageUrl: dbUser.image_url,
                            provider: dbUser.provider,
                            orgName: org.name,
                            orgSlug: org.slug,
                            orgDescription: org.description,
                            apiKeyPrefix: latestKey.key_prefix,
                            apiKeyHash: latestKey.key_hash,
                            apiKeyName: latestKey.name,
                            apiKeyScopes: latestKey.scopes,
                        }).catch((e: any) => console.warn('[Onboarding API] Supabase full sync (non-fatal):', e.message));
                    }
                } catch (supaErr: any) {
                    console.warn('[Onboarding API] Supabase onboarding sync failed (non-fatal):', supaErr.message);
                }

                // Set onboarded cookie for middleware
                const response = NextResponse.json({
                    success: true,
                    message: 'Onboarding completed successfully',
                    redirectTo: '/dashboard',
                });
                
                response.cookies.set('memron_onboarded', 'true', {
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 60 * 60 * 24 * 365, // 1 year
                    path: '/',
                });

                return response;
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid onboarding step' },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        console.error('[Onboarding API] Error:', error.message);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET /api/onboarding - Get onboarding status
export async function GET(request: NextRequest) {
    try {
        const authUser = await auth(request);
        
        if (!authUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }
        const firebaseUid = authUser.uid;

        // SECURITY: Check email verification for email users
        const firebaseUser = await getFirebaseUser(firebaseUid);
        if (firebaseUser) {
            const providerData = firebaseUser.providerData?.[0];
            const isOAuthUser = providerData?.providerId && providerData.providerId !== 'password';
            
            if (!isOAuthUser && !firebaseUser.emailVerified) {
                return NextResponse.json(
                    { 
                        error: 'Email verification required',
                        emailVerified: false,
                    },
                    { status: 403 }
                );
            }
        }

        const dbUser = await getUserFromPostgres(firebaseUid);
        
        if (!dbUser) {
            return NextResponse.json({
                isOnboarded: false,
                hasOrganization: false,
                hasApiKey: false,
            });
        }

        const [org, apiKeys] = await Promise.all([
            getOrganizationByUserId(dbUser.id),
            getApiKeysByUserId(dbUser.id),
        ]);
        const latestKey = apiKeys.length > 0 ? apiKeys[0] : null;

        const responseBody = NextResponse.json({
            isOnboarded: dbUser.is_onboarded,
            onboardedAt: dbUser.onboarded_at ?? null,
            hasOrganization: !!org,
            hasApiKey: !!latestKey,
            organization: org ? {
                id: org.org_id,
                name: org.name,
                slug: org.slug,
                description: org.description,
                createdAt: org.created_at,
            } : null,
            apiKey: latestKey ? {
                prefix: latestKey.key_prefix,
                name: latestKey.name,
                scopes: latestKey.scopes,
                createdAt: latestKey.created_at,
            } : null,
            user: {
                universalId: dbUser.universal_id,
                email: dbUser.email,
                fullName: dbUser.full_name,
                provider: dbUser.provider,
                createdAt: dbUser.created_at,
            },
        });

        // If user is already onboarded in DB, heal the cookie in case it was cleared
        if (dbUser.is_onboarded) {
            responseBody.cookies.set('memron_onboarded', 'true', {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 365, // 1 year
                path: '/',
            });
        }

        return responseBody;
    } catch (error: any) {
        console.error('[Onboarding API] GET Error:', error.message);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
