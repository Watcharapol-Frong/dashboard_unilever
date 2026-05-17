import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require role = 'admin'
export const ADMIN_PATHS = ['/leads', '/data-hub']

export function middleware(request: NextRequest) {
  // TODO [AUTH]: Uncomment and implement when Supabase Auth is enabled
  //
  // const session = await getSession(request)
  // if (!session) return NextResponse.redirect(new URL('/login', request.url))
  //
  // const isAdminPath = ADMIN_PATHS.some(p => request.nextUrl.pathname.startsWith(p))
  // if (isAdminPath && session.role !== 'admin') {
  //   return NextResponse.redirect(new URL('/overview', request.url))
  // }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
