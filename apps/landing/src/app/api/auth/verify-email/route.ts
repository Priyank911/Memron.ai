/**
 * POST /api/auth/verify-email — Confirm the one-time code emailed by WorkOS.
 *
 * On success the sealed session is re-issued with emailVerified=true so the
 * middleware and API guards immediately allow onboarding.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import { getAuthErrorInfo } from '@/lib/auth-errors';
import {
  getSessionFromRequest,
  sealSession,
  setEmailVerifiedCookie,
  setSessionCookie,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  const claims = getSessionFromRequest(request);
  if (!claims) {
    return NextResponse.json({ error: 'Not authenticated. Please sign in again.' }, { status: 401 });
  }

  if (claims.emailVerified) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = body.code?.trim() ?? '';
  if (!code) {
    return NextResponse.json({ error: 'Please enter the verification code from your email.' }, { status: 400 });
  }

  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json(
      { error: 'Authentication service is not configured.' },
      { status: 503 },
    );
  }

  try {
    const { user } = await workos.userManagement.verifyEmail({ userId: claims.sub, code });

    const firstName = user.firstName ?? null;
    const lastName = user.lastName ?? null;
    const fullName =
      firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : claims.fullName;

    const sealed = sealSession({
      sub: user.id,
      email: user.email || claims.email,
      emailVerified: true,
      firstName,
      lastName,
      fullName,
      imageUrl: user.profilePictureUrl ?? claims.imageUrl,
      provider: claims.provider,
    });

    if (!sealed) {
      return NextResponse.json(
        { error: 'Email verified but session refresh failed. Please sign in again.' },
        { status: 500 },
      );
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, sealed);
    setEmailVerifiedCookie(response, true);
    return response;
  } catch (error) {
    const mapped = getAuthErrorInfo(error);
    console.warn('[VerifyEmail]', (error as any)?.code || (error as any)?.message);
    return NextResponse.json({ error: mapped.message }, { status: 400 });
  }
}
