import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const ADMIN_PATHS = ['/data-hub']

// Maintenance mode: redirect all visitors to /maintenance when MAINTENANCE_MODE=true
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true'

// Dev bypass cookie name + value — set via /api/dev-access (excluded from auth)
const DEV_COOKIE = '__dev_bypass'
const DEV_SECRET = 'frong-preview-2025'

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
  // ── Auth disabled for preview — remove this line to re-enable ─────────────────
  return NextResponse.next()

  // ── Maintenance Mode ──────────────────────────────────────────────────────────
  if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith('/maintenance')) {
    return NextResponse.redirect(new URL('/maintenance', request.url))
  }

  // ── Dev Bypass Cookie: visit /api/dev-access once to unlock ──────────────────
  const devCookie = request.cookies.get(DEV_COOKIE)?.value
  if (devCookie === DEV_SECRET) return NextResponse.next()

  // ── Step 1: Resolve auth state ────────────────────────────────────────────────
  const { userId, sessionClaims, redirectToSignIn } = await auth()

  // ── Step 2: Authenticated gate ────────────────────────────────────────────────
  if (isProtectedRoute(request) && !userId) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return redirectToSignIn()
  }

  // ── Step 3: Admin gate ────────────────────────────────────────────────────────
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
    '/((?!_next/static|_next/image|favicon.ico|maintenance|api/webhooks/.*|api/data/ingest/.*|api/auth/.*|api/dev-access).*)',
  ],
}
