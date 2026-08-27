/**
 * WorkOS AuthKit Session Middleware
 * 
 * Protects routes based on the presence of a well-formed sealed session
 * cookie. The seal is AES-256-GCM encrypted (created by /api/auth/*), so the
 * Edge middleware only performs a cheap format check — full cryptographic
 * verification happens in API routes via `getSessionFromRequest()`.
 */

import { NextResponse, type NextRequest } from 'next/server';

// ─── Route Matchers ──────────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  '/',
  '/docs',
  '/about',
  '/login',
  '/sign-up',
  '/forgot-password',
  '/verify-success',
  '/api/auth',
  '/api/webhooks',
  '/api/health',
  '/api/db',
];

const AUTH_ROUTES = ['/login', '/sign-up', '/forgot-password'];
const DASHBOARD_ROUTES = ['/dashboard', '/playground', '/api/dashboard'];
const ONBOARDING_ROUTES = ['/onboarding'];

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => {
    if (route.endsWith('*')) {
      return pathname.startsWith(route.slice(0, -1));
    }
    return pathname === route || pathname.startsWith(route + '/');
  });
}

function isPublicRoute(pathname: string): boolean {
  // Static files and Next.js internals are always public
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // Files with extensions
  ) {
    return true;
  }
  return matchesRoute(pathname, PUBLIC_ROUTES);
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.includes(pathname);
}

function isDashboardRoute(pathname: string): boolean {
  return matchesRoute(pathname, DASHBOARD_ROUTES);
}

function isOnboardingRoute(pathname: string): boolean {
  return matchesRoute(pathname, ONBOARDING_ROUTES);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Quick sanity check: a valid session seal looks like
 * `v1.<iv>.<ciphertext>.<tag>` (4 dot-separated base64url segments).
 * Anything else ("undefined", empty, stale Firebase JWTs) is rejected here so
 * we never waste a round-trip on garbage cookies.
 */
function isValidSessionSeal(token: string): boolean {
  if (!token || token === 'undefined' || token === 'null' || token.length < 40) {
    return false;
  }
  const parts = token.split('.');
  return parts.length === 4 && parts[0] === 'v1' && parts.every(p => p.length > 0);
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get session cookie and validate format
  const rawCookie = request.cookies.get('__session')?.value;
  const sessionCookie = rawCookie && isValidSessionSeal(rawCookie) ? rawCookie : undefined;
  const isAuthenticated = !!sessionCookie;

  // If there's a malformed cookie, clear it immediately
  if (rawCookie && !sessionCookie) {
    const response = NextResponse.redirect(request.nextUrl);
    response.cookies.set('__session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  }
  const isOnboarded = request.cookies.get('memron_onboarded')?.value === 'true';
  const emailVerified = request.cookies.get('memron_email_verified')?.value === 'true';

  // ─── Auth Routes (login, sign-up, forgot-password) ─────────────────────────
  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthRoute(pathname)) {
    // Keep unverified email users on auth routes so they can complete verification.
    if (!emailVerified) {
      return NextResponse.next();
    }
    const destination = isOnboarded ? '/dashboard' : '/onboarding';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // ─── Dashboard Routes ──────────────────────────────────────────────────────
  if (isDashboardRoute(pathname)) {
    const isApiRoute = pathname.startsWith('/api/');

    // Not authenticated
    if (!isAuthenticated) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Authenticated but not onboarded (for pages only)
    if (!isOnboarded && !isApiRoute) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  // ─── Onboarding Routes ─────────────────────────────────────────────────────
  if (isOnboardingRoute(pathname) && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ─── Protected Routes (not public, not dashboard, not onboarding) ──────────
  if (!isPublicRoute(pathname) && !isDashboardRoute(pathname) && !isOnboardingRoute(pathname)) {
    if (!isAuthenticated) {
      // API routes get 401, pages get redirected
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

// ─── Matcher Config ──────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
