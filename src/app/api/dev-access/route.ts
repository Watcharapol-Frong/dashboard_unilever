import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Preview-only bypass: sets a cookie that middleware recognises to skip Clerk auth.
// ALLOW_DEV_ACCESS=true must be set in Vercel env vars scoped to Preview only.
// Without that env var this route returns 404 — safe in production.
export async function GET(request: Request) {
  if (process.env.ALLOW_DEV_ACCESS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const redirectTo = searchParams.get('to') || '/dashboard'

  const res = NextResponse.redirect(new URL(redirectTo, request.url))
  res.cookies.set('__dev_bypass', 'frong-preview-2025', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return res
}
