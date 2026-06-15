import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const IS_DEV_MODE     = process.env.DEV_MODE === 'true' && process.env.NODE_ENV === 'development'
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true'

// Preview bypass: visit /api/dev-access once to set this cookie
const DEV_COOKIE = '__dev_bypass'
const DEV_SECRET = 'frong-preview-2025'

const isProtected = createRouteMatcher([
  '/dashboard(.*)',
  '/leads(.*)',
  '/raw-data(.*)',
  '/data-hub(.*)',
  '/api/data(.*)',
])

export default clerkMiddleware(async (auth, request: NextRequest) => {
  // Maintenance mode — redirect everyone except /maintenance itself
  if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith('/maintenance')) {
    return NextResponse.redirect(new URL('/maintenance', request.url))
  }

  // Local dev mode: bypass all Clerk auth
  if (IS_DEV_MODE) return NextResponse.next()

  // Preview bypass cookie (Vercel preview deployments)
  const devCookie = request.cookies.get(DEV_COOKIE)?.value
  if (devCookie === DEV_SECRET) return NextResponse.next()

  // Require login for all protected routes
  if (isProtected(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|maintenance|api/webhooks/.*|api/data/ingest/.*|api/dev-access).*)',
  ],
}
