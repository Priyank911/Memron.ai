/**
 * GET /api/auth/callback — WorkOS OAuth callback.
 *
 * Validates the signed state (CSRF), exchanges the code via
 * authenticateWithCode, seals the session, and routes the user to
 * onboarding or dashboard based on stored onboarding state.
 */

export const runtime = 'nodejs';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import {
  ONBOARDED_COOKIE_NAME,
  sealSession,
  setEmailVerifiedCookie,
  setSessionCookie,
} from '@/lib/session';

function verifySignedState(state: string | null): { provider: string } | null {
  if (!state) return null;
  const parts = state.split('.');
  if (parts.length !== 4) return null;

  const [nonce, provider, exp, signature] = parts;
  const payload = `${nonce}.${provider}.${exp}`;
  const expected = crypto
    .createHmac('sha256', process.env.WORKOS_COOKIE_PASSWORD ?? '')
    .update(payload)
    .digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;

  return { provider };
}

function fail(request: NextRequest, code: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', code);
  const response = NextResponse.redirect(url);
  response.cookies.set({ name: 'memron_oauth_state', value: '', maxAge: 0, path: '/' });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // ── Provider-side errors (user denied consent, popup closed, etc.) ────────
  const oauthError = params.get('error');
  if (oauthError) {
    if (
      oauthError === 'access_denied' ||
      oauthError === 'user_cancelled_authorization'
    ) {
      return fail(request, 'oauth_cancelled');
    }
    console.warn('[OAuth Callback] Provider error:', oauthError, params.get('error_description'));
    return fail(request, 'oauth_failed');
  }

  // ── CSRF check ─────────────────────────────────────────────────────────────
  const state = params.get('state');
  const cookieState = request.cookies.get('memron_oauth_state')?.value;
  const verified = verifySignedState(state);
  if (!verified || !cookieState || cookieState !== state) {
    return fail(request, 'oauth_state_mismatch');
  }

  const code = params.get('code');
  if (!code) return fail(request, 'oauth_missing_code');

  const workos = getWorkOS();
  if (!workos) return fail(request, 'auth_unconfigured');

  try {
    const auth = await workos.userManagement.authenticateWithCode({ code });
    const user = auth.user;
    const firstName = user.firstName ?? null;
    const lastName = user.lastName ?? null;

    const sealed = sealSession({
      sub: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      firstName,
      lastName,
      fullName: firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : user.name ?? null,
      imageUrl: user.profilePictureUrl ?? null,
      provider: verified.provider, // 'google' | 'github'
    });

    if (!sealed) return fail(request, 'session_seal_failed');

    // OAuth emails are considered verified by WorkOS; mirror that for middleware.
    const onboarded = request.cookies.get(ONBOARDED_COOKIE_NAME)?.value === 'true';
    const destination = new URL(onboarded ? '/dashboard' : '/onboarding', request.url);

    const response = NextResponse.redirect(destination);
    setSessionCookie(response, sealed);
    setEmailVerifiedCookie(response, true);
    response.cookies.set({ name: 'memron_oauth_state', value: '', maxAge: 0, path: '/' });
    return response;
  } catch (error: any) {
    console.error(
      '[OAuth Callback] Code exchange failed:',
      error?.error || error?.code || error?.message,
    );
    return fail(request, 'oauth_exchange_failed');
  }
}
