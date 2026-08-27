/**
 * POST /api/auth/reset-password — Complete a password reset with the token
 * from WorkOS. Per WorkOS semantics, a successful reset also verifies the
 * user's email if it wasn't verified yet.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS, toAuthProfile, workosConfigError } from '@/lib/workos';
import { getAuthErrorInfo } from '@/lib/auth-errors';
import {
  clearSessionCookie,
  sealSession,
  setEmailVerifiedCookie,
  setSessionCookie,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  let body: { token?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const token = body.token?.trim() ?? '';
  const newPassword = body.newPassword ?? '';

  if (!token) {
    return NextResponse.json(
      { error: 'Missing reset token. Please use the link from your email.' },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Your new password must be at least 8 characters long.' },
      { status: 400 },
    );
  }

  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json({ error: workosConfigError() }, { status: 503 });
  }

  try {
    const { user } = await workos.userManagement.resetPassword({ token, newPassword });
    const profile = toAuthProfile(user, 'password');

    // Sign the user in with their new password state.
    const sealed = sealSession({
      sub: profile.uid,
      email: profile.email,
      emailVerified: profile.emailVerified,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: profile.fullName,
      imageUrl: profile.imageUrl,
      provider: 'password',
    });

    const response = NextResponse.json({
      success: true,
      emailVerified: profile.emailVerified,
    });

    if (sealed) {
      setSessionCookie(response, sealed);
      setEmailVerifiedCookie(response, profile.emailVerified);
    } else {
      // Without cookie password we cannot re-seal; force a clean login.
      clearSessionCookie(response);
    }
    return response;
  } catch (error) {
    const mapped = getAuthErrorInfo(error);
    console.warn('[ResetPassword]', (error as any)?.code || (error as any)?.message);
    const status =
      mapped.message.includes('expired') || mapped.message.includes('invalid') ? 400 : 400;
    return NextResponse.json({ error: mapped.message }, { status });
  }
}
