import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-up(.*)',
  '/forgot-password(.*)',
  '/sso-callback(.*)',
  '/api/webhooks(.*)',
  '/api/health(.*)',
  '/api/db(.*)',
])

const isAuthRoute = createRouteMatcher([
  '/login',
  '/sign-up',
  '/forgot-password',
])

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)', '/api/dashboard(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)'])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()

  // If user is signed in and tries to access any auth page, route them
  // to the correct destination based on the onboarding cookie.
  // This avoids a double-redirect: /login → /dashboard → /onboarding.
  if (userId && isAuthRoute(request)) {
    const isOnboarded = request.cookies.get('memron_onboarded')?.value === 'true'
    return NextResponse.redirect(new URL(isOnboarded ? '/dashboard' : '/onboarding', request.url))
  }

  // Protect dashboard routes (pages AND /api/dashboard/* endpoints).
  // For API routes, return JSON errors instead of redirects.
  if (isDashboardRoute(request)) {
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

    if (!userId) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const onboardedCookie = request.cookies.get('memron_onboarded')?.value
    if (onboardedCookie !== 'true') {
      if (isApiRoute) {
        // Let API calls through — route handlers check auth independently
        // This avoids redirecting fetch() calls to /onboarding
      } else {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    }
  }

  // Protect onboarding route — must be signed in
  if (isOnboardingRoute(request) && !userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protect all other private routes
  if (!isPublicRoute(request) && !isOnboardingRoute(request) && !isDashboardRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
