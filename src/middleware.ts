import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const ADMIN_PATHS = ['/data-hub']

// Dev mode: bypass all auth when DEV_MODE=true in .env.local (development only)
// This flag has zero effect in production — NODE_ENV=production disables it entirely.
const DEV_MODE = process.env.DEV_MODE === 'true' && process.env.NODE_ENV === 'development'

// Maintenance mode: redirect all visitors to /maintenance when MAINTENANCE_MODE=true
// Set MAINTENANCE_MODE=true in Vercel environment variables to activate.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)', '/data-hub(.*)', '/raw-data(.*)',
  '/api/data/(.*)',
])

const isAdminOnlyRoute = createRouteMatcher([
  '/data-hub(.*)',
  '/api/data/hub',           // hub root — source stats + mart stats (admin)
  '/api/data/hub/build(.*)', // build trigger + build lock state (admin)
  '/api/data/hub/upload(.*)',// all upload sub-routes (admin)
  '/api/data/raw/export(.*)',
])
// Note: /api/data/hub/freshness is intentionally excluded — viewer+ can access it

export default clerkMiddleware(async (auth, request) => {
  // ── Maintenance Mode: redirect everyone to /maintenance ───────────────────────
  if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith('/maintenance')) {
    return NextResponse.redirect(new URL('/maintenance', request.url))
  }

  // ── Dev Mode: skip all auth checks, treat as admin ───────────────────────────
  if (DEV_MODE) return NextResponse.next()

  // ── Step 1: Resolve auth state once — avoids two round-trips to Clerk ────────
  const { userId, sessionClaims, redirectToSignIn } = await auth()

  // ── Step 2: Authenticated gate — fail-safe: return early, no fall-through ───
  if (isProtectedRoute(request) && !userId) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return redirectToSignIn()
  }

  // ── Step 3: Admin gate — explicit early return on every failure path ─────────
  if (isAdminOnlyRoute(request)) {
    const meta = sessionClaims?.publicMetadata as { role?: string } | undefined
    const role  = meta?.role

    if (role !== 'admin') {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|maintenance|api/webhooks/.*|api/data/ingest/.*|api/auth/.*).*)',
  ],
}
