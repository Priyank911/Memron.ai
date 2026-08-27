/**
 * GET /api/auth/oauth/[provider] — Start the WorkOS hosted OAuth flow.
 *
 * Redirects the browser to WorkOS with a signed `state` parameter and stores
 * it in a short-lived cookie for CSRF verification on the callback.
 */

export const runtime = 'nodejs';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS, getWorkOSClientId, workosConfigError } from '@/lib/workos';

const PROVIDERS: Record<string, 'GoogleOAuth' | 'GitHubOAuth'> = {
  google: 'GoogleOAuth',
  github: 'GitHubOAuth',
};

function signState(payload: string): string {
  const secret = process.env.WORKOS_COOKIE_PASSWORD ?? '';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await context.params;
  const provider = PROVIDERS[providerParam?.toLowerCase()];

  if (!provider) {
    return NextResponse.redirect(new URL('/login?error=unknown_provider', request.url));
  }

  const workos = getWorkOS();
  const clientId = getWorkOSClientId();
  if (!workos || !clientId) {
    return NextResponse.redirect(new URL('/login?error=auth_unconfigured', request.url));
  }
  if (!process.env.WORKOS_COOKIE_PASSWORD) {
    console.error('[OAuth] WORKOS_COOKIE_PASSWORD missing — cannot sign OAuth state.');
    return NextResponse.redirect(new URL('/login?error=auth_unconfigured', request.url));
  }

  // ── Build signed state: nonce.provider.expiry.signature ───────────────────
  const nonce = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = `${nonce}.${providerParam.toLowerCase()}.${exp}`;
  const state = `${payload}.${signState(payload)}`;

  const redirectUri = new URL('/api/auth/callback', request.url).toString();

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    clientId,
    provider,
    redirectUri,
    state,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set({
    name: 'memron_oauth_state',
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
