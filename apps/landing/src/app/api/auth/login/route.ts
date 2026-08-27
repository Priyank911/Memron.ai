/**
 * POST /api/auth/login — Authenticate with email + password (WorkOS)
 *
 * Sets the sealed __session cookie on success.
 * Special case: unverified users get their verification code re-sent and a
 * session established so they can complete verification in place.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, getWorkOS, toAuthProfile, workosConfigError } from '@/lib/workos';
import { getAuthErrorInfo } from '@/lib/auth-errors';
import {
  sealSession,
  setSessionCookie,
  setEmailVerifiedCookie,
} from '@/lib/session';

const EMAIL_RESEND_COOLDOWN_MS = 60_000;
// Per-user cooldown for re-sending verification codes (in-process; per server instance).
const lastVerificationSendAt = new Map<string, number>();

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json({ error: workosConfigError() }, { status: 503 });
  }

  try {
    const auth = await workos.userManagement.authenticateWithPassword({ email, password });
    const profile = toAuthProfile(auth.user, 'password');

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

    if (!sealed) {
      return NextResponse.json({ error: 'Failed to establish a session.' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: {
        uid: profile.uid,
        email: profile.email,
        emailVerified: profile.emailVerified,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.fullName || profile.email.split('@')[0],
        photoURL: profile.imageUrl,
        providerId: 'password',
      },
    });
    setSessionCookie(response, sealed);
    setEmailVerifiedCookie(response, profile.emailVerified);
    return response;
  } catch (authError: any) {
    // ── Unverified account: establish a limited session and make sure the
    // user has a code (WorkOS already emailed one at signup — only re-send
    // after the cooldown to avoid duplicate emails).
    if (authError?.code === 'email_verification_required') {
      const user = await findUserByEmail(email);
      if (user) {
        const now = Date.now();
        const last = lastVerificationSendAt.get(user.id) ?? 0;
        if (now - last >= EMAIL_RESEND_COOLDOWN_MS) {
          try {
            await workos.userManagement.sendVerificationEmail({ userId: user.id });
            lastVerificationSendAt.set(user.id, now);
          } catch (sendError) {
            console.warn(
              '[Login API] Re-send verification failed:',
              sendError instanceof Error ? sendError.message : sendError,
            );
          }
        }
        const profile = toAuthProfile(user, 'password');
        const sealed = sealSession({
          sub: profile.uid,
          email: profile.email,
          emailVerified: false,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName: profile.fullName,
          imageUrl: profile.imageUrl,
          provider: 'password',
        });
        const response = NextResponse.json({
          success: true,
          verificationRequired: true,
          email: profile.email,
        });
        if (sealed) {
          setSessionCookie(response, sealed);
          setEmailVerifiedCookie(response, false);
        }
        return response;
      }
    }

    const mapped = getAuthErrorInfo(authError);
    return NextResponse.json({ error: mapped.message }, { status: mapped.silent ? 400 : 401 });
  }
}
