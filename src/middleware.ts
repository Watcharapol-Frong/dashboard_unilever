import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const ADMIN_PATHS = ['/leads', '/data-hub', '/exports']

const isProtectedRoute = createRouteMatcher([
  '/overview(.*)', '/sales(.*)', '/telesales(.*)',
  '/products(.*)', '/leads(.*)', '/incentives(.*)', '/data-hub(.*)', '/exports(.*)',
  '/api/data/(.*)',
])

const isAdminOnlyRoute = createRouteMatcher([
  '/leads(.*)', '/data-hub(.*)', '/exports(.*)',
  '/api/data/upload/(.*)', '/api/data/dashboard(.*)',
  '/api/data/refresh-mart/(.*)', '/api/data/export/(.*)',
  '/api/data/template/(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  // ── Step 1: Resolve auth state once — avoids two round-trips to Clerk ────────
  const { userId, sessionClaims, redirectToSignIn } = await auth()

  // ── Step 2: Authenticated gate — fail-safe: return early, no fall-through ───
  if (isProtectedRoute(request) && !userId) {
    // API callers get a machine-readable 401; browsers get redirected to sign-in
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return redirectToSignIn()
  }

  // ── Step 3: Admin gate — explicit early return on every failure path ─────────
  if (isAdminOnlyRoute(request)) {
    // Type-assert publicMetadata so role access is safe in strict TypeScript
    const meta = sessionClaims?.publicMetadata as { role?: string } | undefined
    const role  = meta?.role

    if (role !== 'admin') {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/overview', request.url))
    }
  }
  // Execution reaching here means: authenticated (if required) + authorized.
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks/.*|api/data/ingest/.*|api/auth/.*).*)',
  ],
}
