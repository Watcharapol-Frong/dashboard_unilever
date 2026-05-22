import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const ADMIN_PATHS = ['/leads', '/data-hub']

const isProtectedRoute = createRouteMatcher([
  '/overview(.*)', '/sales(.*)', '/telesales(.*)',
  '/products(.*)', '/leads(.*)', '/incentives(.*)', '/data-hub(.*)',
  '/api/data/(.*)',
  '/api/system/(.*)',

])

const isAdminOnlyRoute = createRouteMatcher([
  '/leads(.*)', '/data-hub(.*)',
  '/api/data/upload/(.*)', '/api/data/dashboard(.*)', '/api/data/refresh-mart/(.*)',
  '/api/system/(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect()

  if (isAdminOnlyRoute(request)) {
    const { sessionClaims } = await auth()
    const role = sessionClaims?.publicMetadata?.role
    if (role !== 'admin') {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/overview', request.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks/.*|api/data/ingest/.*).*)',
  ],
}
