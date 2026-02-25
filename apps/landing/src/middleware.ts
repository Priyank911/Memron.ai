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

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)'])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()

  // If user is signed in and tries to access any auth page, send to dashboard.
  // The dashboard's useUserSync hook will redirect to /onboarding if they're new.
  if (userId && isAuthRoute(request)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect dashboard routes.
  // Cookie is always set by the server (GET /api/onboarding heals it on every check),
  // so cookie-absent + signed-in means: new user or cleared cookie.
  // Redirect both cases to /onboarding — the page itself distinguishes:
  //   already-onboarded → DB check heals cookie + sends back to /dashboard
  //   new user          → shows onboarding flow
  if (isDashboardRoute(request)) {
    if (!userId) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const onboardedCookie = request.cookies.get('memron_onboarded')?.value
    if (onboardedCookie !== 'true') {
      return NextResponse.redirect(new URL('/onboarding', request.url))
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
