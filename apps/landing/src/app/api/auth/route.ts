/**
 * Auth API — Session status & logout (WorkOS AuthKit)
 *
 * GET    /api/auth  → current session claims (fresh from WorkOS when possible)
 * DELETE /api/auth  → sign out (clear session cookie)
 *
 * The session itself is an AES-256-GCM sealed cookie created by
 * /api/auth/login, /api/auth/signup, or /api/auth/callback.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import {
  clearAuxiliaryCookies,
  clearSessionCookie,
  getSessionFromRequest,
  sealSession,
  setSessionCookie,
} from '@/lib/session';

export async function GET(request: NextRequest) {
  const claims = getSessionFromRequest(request);

  if (!claims) {
    return NextResponse.json({ authenticated: false });
  }

  // ── Freshness pass: re-fetch the user from WorkOS so emailVerified and
  //    profile changes are reflected without requiring a new login.
  //    Falls back to sealed claims on any failure (offline-safe).
  let emailVerified = claims.emailVerified;
  let firstName = claims.firstName;
  let lastName = claims.lastName;
  let imageUrl = claims.imageUrl;

  const workos = getWorkOS();
  if (workos) {
    try {
      const user = await workos.userManagement.getUser(claims.sub);
      emailVerified = user.emailVerified;
      firstName = user.firstName ?? null;
      lastName = user.lastName ?? null;
      imageUrl = user.profilePictureUrl ?? null;
    } catch (error) {
      // User might have been deleted or WorkOS is unreachable — keep sealed values.
      console.warn(
        '[Auth API] Freshness refresh skipped:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const responseClaims = {
    sub: claims.sub,
    email: claims.email,
    emailVerified,
    firstName,
    lastName,
    fullName:
      firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : claims.fullName,
    imageUrl,
    provider: claims.provider,
  };

  const user = {
    uid: responseClaims.sub,
    email: responseClaims.email,
    emailVerified: responseClaims.emailVerified,
    firstName: responseClaims.firstName,
    lastName: responseClaims.lastName,
    displayName: responseClaims.fullName || responseClaims.email.split('@')[0],
    photoURL: responseClaims.imageUrl,
    providerId: responseClaims.provider,
  };

  // Re-seal when anything changed so subsequent requests skip the API call.
  if (
    emailVerified !== claims.emailVerified ||
    firstName !== claims.firstName ||
    lastName !== claims.lastName ||
    imageUrl !== claims.imageUrl
  ) {
    const sealed = sealSession(responseClaims);
    const response = NextResponse.json({ authenticated: true, user });
    if (sealed) {
      setSessionCookie(response, sealed);
      // Heal the middleware helper cookie too.
      response.cookies.set({
        name: 'memron_email_verified',
        value: emailVerified ? 'true' : 'false',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
    }
    return response;
  }

  return NextResponse.json({ authenticated: true, user });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearAuxiliaryCookies(response);
  return response;
}
