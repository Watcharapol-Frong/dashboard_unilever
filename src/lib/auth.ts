import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}

const DEV_MODE = process.env.DEV_MODE === 'true' && process.env.NODE_ENV === 'development'

export async function requireAdmin(): Promise<void> {
  if (DEV_MODE) return
  const { userId, sessionClaims } = await auth()
  if (!userId) throw new UnauthorizedError()
  if (sessionClaims?.publicMetadata?.role !== 'admin') throw new ForbiddenError()
}

export async function requireAuth(): Promise<void> {
  if (DEV_MODE) return
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function withAdmin(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    await requireAdmin()
    return await handler()
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    if (err instanceof ForbiddenError) return forbiddenResponse()
    console.error('[withAdmin] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// For routes accessible to any logged-in user (viewer or admin)
export async function withAuth(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    await requireAuth()
    return await handler()
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('[withAuth] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
