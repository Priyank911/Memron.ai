/**
 * POST /api/auth/signup — Create a WorkOS user (email + password)
 *
 * Flow:
 *   1. createUser on WorkOS
 *   2. sendVerificationEmail (one-time code — the UI collects it)
 *   3. authenticateWithPassword → sealed session cookie
 *
 * Resume flow: when the email already exists AND the password matches an
 * unverified account, we re-send the code and continue verification instead
 * of failing (mirrors the previous Firebase behavior).
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS, toAuthProfile, workosConfigError } from '@/lib/workos';
import { getAuthErrorInfo } from '@/lib/auth-errors';
import {
  sealSession,
  setSessionCookie,
  setEmailVerifiedCookie,
} from '@/lib/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-user cooldown for re-sending verification codes (in-process; per server instance).
const EMAIL_RESEND_COOLDOWN_MS = 60_000;
const lastVerificationSendAt = new Map<string, number>();

function errorResponse(error: unknown, fallbackStatus = 400) {
  const info = getAuthErrorInfo(error);
  return { status: fallbackStatus, message: info.message };
}

export async function POST(request: NextRequest) {
  // ── Parse & validate input ────────────────────────────────────────────────
  let body: { email?: string; password?: string; firstName?: string; lastName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';
  const firstName = body.firstName?.trim().slice(0, 100) || undefined;
  const lastName = body.lastName?.trim().slice(0, 100) || undefined;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Your password must be at least 8 characters long.' },
      { status: 400 },
    );
  }

  // ── WorkOS client ─────────────────────────────────────────────────────────
  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json({ error: workosConfigError() }, { status: 503 });
  }

  try {
    // ── Create the user ─────────────────────────────────────────────────────
    // NOTE: WorkOS automatically emails a verification code when a user is
    // created with emailVerified:false. Do NOT also call sendVerificationEmail
    // here — that would deliver two codes. Users can request another via
    // POST /api/auth/resend-verification (the "Resend email" button).
    const user = await workos.userManagement.createUser({
      email,
      password,
      firstName,
      lastName,
      emailVerified: false,
    });

    // ── Try to auto-authenticate so a session exists during verification ───
    // Some environments require verification before authentication — in that
    // case the account still exists and the user completes verification via
    // the sign-in flow, so we respond identically minus the session cookie.
    let sealed: string | null = null;
    try {
      const auth = await workos.userManagement.authenticateWithPassword({ email, password });
      const profile = toAuthProfile(auth.user, 'password');
      sealed = sealSession({
        sub: profile.uid,
        email: profile.email,
        emailVerified: profile.emailVerified,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
        imageUrl: profile.imageUrl,
        provider: 'password',
      });
    } catch (autoAuthError: any) {
      console.warn(
        '[Signup API] Auto-authentication skipped:',
        autoAuthError?.code || autoAuthError?.message,
      );
    }

    const response = NextResponse.json({
      status: 'verification_required',
      email,
    });

    if (sealed) {
      setSessionCookie(response, sealed);
      setEmailVerifiedCookie(response, false);
    }
    return response;
  } catch (createError: any) {
    // ── Email already registered ─────────────────────────────────────────────
    if (
      createError?.code === 'user_already_exists' ||
      createError?.status === 409 ||
      String(createError?.message || '').toLowerCase().includes('already exists')
    ) {
      // Try to resume an unverified account when the password matches.
      try {
        const auth = await workos.userManagement.authenticateWithPassword({ email, password });
        if (!auth.user.emailVerified) {
          // Re-send the code, but respect a cooldown — repeated form submits
          // (or a code emailed moments ago) must not spam the user's inbox.
          const now = Date.now();
          const last = lastVerificationSendAt.get(auth.user.id) ?? 0;
          if (now - last >= EMAIL_RESEND_COOLDOWN_MS) {
            try {
              await workos.userManagement.sendVerificationEmail({ userId: auth.user.id });
              lastVerificationSendAt.set(auth.user.id, now);
            } catch {
              /* best effort */
            }
          }
          const profile = toAuthProfile(auth.user, 'password');
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
            status: 'verification_required',
            email: profile.email,
          });
          if (sealed) {
            setSessionCookie(response, sealed);
            setEmailVerifiedCookie(response, false);
          }
          return response;
        }
        return NextResponse.json(
          {
            error:
              'An account with this email already exists and is verified. Please sign in instead.',
          },
          { status: 409 },
        );
      } catch (resumeError) {
        return NextResponse.json(
          {
            error:
              'This email is already registered. Please sign in — or use "Forgot password" if you cannot remember your credentials.',
          },
          { status: 409 },
        );
      }
    }

    const mapped = errorResponse(createError);
    console.warn(
      '[Signup API] User creation failed:',
      createError?.code || createError?.status,
      createError?.message,
    );
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
