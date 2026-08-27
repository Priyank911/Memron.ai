/**
 * POST /api/auth/resend-verification — Re-send the email verification code.
 * Requires an existing session (the code is tied to the WorkOS user id).
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import { getSessionFromRequest } from '@/lib/session';

// Simple in-memory cooldown to protect the WorkOS API (per user id).
const RESEND_COOLDOWN_MS = 45_000;
const lastSentAt = new Map<string, number>();

export async function POST(request: NextRequest) {
  const claims = getSessionFromRequest(request);
  if (!claims) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  if (claims.emailVerified) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json(
      { error: 'Authentication service is not configured.' },
      { status: 503 },
    );
  }

  const now = Date.now();
  const last = lastSentAt.get(claims.sub) ?? 0;
  if (now - last < RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'Please wait a moment before requesting another code.' },
      { status: 429 },
    );
  }
  lastSentAt.set(claims.sub, now);

  try {
    await workos.userManagement.sendVerificationEmail({ userId: claims.sub });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.warn('[ResendVerification]', error?.code || error?.message);
    if (error?.status === 429) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes.' },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to send the verification email. Please try again.' },
      { status: 502 },
    );
  }
}
