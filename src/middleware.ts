import { NextRequest, NextResponse } from 'next/server'

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true'

// Dev bypass cookie name + value — set via /api/dev-access (excluded from auth)
const DEV_COOKIE = '__dev_bypass'
const DEV_SECRET = 'frong-preview-2025'

export default async function middleware(request: NextRequest) {
  // ── Auth disabled for preview — all routes open ───────────────────────────────
  return NextResponse.next()

  // ── Maintenance Mode ──────────────────────────────────────────────────────────
  if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith('/maintenance')) {
    return NextResponse.redirect(new URL('/maintenance', request.url))
  }

  // ── Dev Bypass Cookie: visit /api/dev-access once to unlock ──────────────────
  const devCookie = request.cookies.get(DEV_COOKIE)?.value
  if (devCookie === DEV_SECRET) return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|maintenance|api/webhooks/.*|api/data/ingest/.*|api/auth/.*|api/dev-access).*)',
  ],
}
