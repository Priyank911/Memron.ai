import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserFromPostgres,
  getUserOrganizations,
  createOrganization,
  updateOrganization,
  checkOrgSlugExists,
} from '@/lib/postgres';
import { generateOrgSlug } from '@/lib/api-key';
import { syncOrgToSupabase } from '@/lib/supabase-sync';
import { checkRateLimit, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * GET /api/workspaces — List all workspaces (organizations) for the current user
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(clerkId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const orgs = await getUserOrganizations(dbUser.id);

    const workspaces = orgs.map(o => ({
      id: o.org_id,
      name: o.name,
      slug: o.slug,
      description: o.description,
      isOwner: o.owner_id === dbUser.id,
      createdAt: o.created_at,
    }));

    return NextResponse.json({ workspaces });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Workspaces API] GET error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces — Create a new workspace
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit
    const rl = checkRateLimit(clerkId, 'workspace-create', CACHE_PROFILES.stats);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 0) / 1000)) } },
      );
    }

    const dbUser = await getUserFromPostgres(clerkId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Workspace name must be at least 2 characters' }, { status: 400 });
    }

    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Workspace name too long' }, { status: 400 });
    }

    // Generate unique slug
    let slug = generateOrgSlug(name.trim());
    let attempts = 0;
    while (await checkOrgSlugExists(slug) && attempts < 5) {
      slug = generateOrgSlug(name.trim());
      attempts++;
    }
    if (await checkOrgSlugExists(slug)) {
      return NextResponse.json({ error: 'Could not generate unique slug. Try a different name.' }, { status: 409 });
    }

    // Create in primary DB
    const result = await createOrganization({
      name: name.trim(),
      slug,
      ownerId: dbUser.id,
      description: description?.trim() || null,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to create workspace' }, { status: 500 });
    }

    // Sync to Supabase (non-blocking) — pass Aiven org_id so UUIDs match
    syncOrgToSupabase({
      name: result.organization!.name,
      slug: result.organization!.slug,
      ownerClerkId: clerkId,
      orgUuid: result.organization!.org_id,
      description: description?.trim() || null,
    }).catch((e: any) => console.warn('[Workspaces API] Supabase sync (non-fatal):', e.message));

    return NextResponse.json({
      workspace: {
        id: result.organization!.org_id,
        name: result.organization!.name,
        slug: result.organization!.slug,
        description: result.organization!.description,
        isOwner: true,
        createdAt: result.organization!.created_at,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Workspaces API] POST error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/workspaces — Update a workspace
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await getUserFromPostgres(clerkId);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { workspaceId, name, description } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    if (name && (typeof name !== 'string' || name.trim().length < 2)) {
      return NextResponse.json({ error: 'Workspace name must be at least 2 characters' }, { status: 400 });
    }

    const result = await updateOrganization(workspaceId, {
      name: name?.trim(),
      description: description?.trim(),
    }, dbUser.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to update workspace' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Workspaces API] PATCH error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
