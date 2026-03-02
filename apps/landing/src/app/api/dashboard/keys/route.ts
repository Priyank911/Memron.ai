import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserFromPostgres,
  getApiKeysByUserId,
  getOrganizationByUserId,
  saveApiKey,
  revokeApiKey,
} from '@/lib/postgres';
import { generateApiKey, hashApiKey } from '@/lib/api-key';
import { syncApiKeyToSupabase, revokeApiKeyInSupabase } from '@/lib/supabase-sync';

/**
 * GET /api/dashboard/keys — List all API keys for the current user
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const keys = await getApiKeysByUserId(dbUser.id);

    return NextResponse.json({
      keys: keys.map((k: any) => ({
        id: k.key_id,
        prefix: k.key_prefix,
        name: k.name,
        scopes: k.scopes || ['memory:read', 'memory:write'],
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[Dashboard API] Keys list error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/keys — Generate a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const org = await getOrganizationByUserId(dbUser.id);
    if (!org) {
      return NextResponse.json(
        { error: 'No organization found. Please complete onboarding first.' },
        { status: 400 },
      );
    }

    // Limit to 5 active keys per user
    const existingKeys = await getApiKeysByUserId(dbUser.id);
    if (existingKeys.length >= 5) {
      return NextResponse.json(
        { error: 'Maximum 5 active API keys allowed. Revoke an existing key first.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const keyName = body.name || `API Key ${existingKeys.length + 1}`;
    const environment = body.environment || 'live';

    const apiKey = generateApiKey(environment);

    const saveResult = await saveApiKey({
      keyPrefix: apiKey.prefix,
      keyHash: apiKey.hash,
      name: keyName,
      userId: dbUser.id,
      orgId: org.id,
      scopes: body.scopes || ['memory:read', 'memory:write', 'memory:delete'],
    });

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error || 'Failed to generate API key' },
        { status: 500 },
      );
    }

    // Mirror API key to Supabase (non-blocking)
    syncApiKeyToSupabase({
      keyPrefix: apiKey.prefix,
      keyHash: apiKey.hash,
      name: keyName,
      ownerClerkId: userId,
      scopes: body.scopes || ['memory:read', 'memory:write', 'memory:delete'],
    }).catch((e: any) => console.warn('[Dashboard API] Supabase key sync (non-fatal):', e.message));

    return NextResponse.json({
      success: true,
      key: {
        id: saveResult.apiKey!.key_id,
        fullKey: apiKey.fullKey,
        prefix: apiKey.prefix,
        name: keyName,
        scopes: ['memory:read', 'memory:write', 'memory:delete'],
        createdAt: saveResult.apiKey!.created_at,
      },
      warning: 'Save this API key now. You will not be able to see the full key again.',
    });
  } catch (error: any) {
    console.error('[Dashboard API] Key generate error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/keys — Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(userId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const keyId = body.keyId;

    if (!keyId) {
      return NextResponse.json({ error: 'Missing keyId' }, { status: 400 });
    }

    const success = await revokeApiKey(keyId, dbUser.id);
    if (!success) {
      return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });
    }

    // Mirror revocation to Supabase (non-blocking)
    revokeApiKeyInSupabase(keyId, userId)
      .catch((e: any) => console.warn('[Dashboard API] Supabase key revoke (non-fatal):', e.message));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Dashboard API] Key revoke error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
