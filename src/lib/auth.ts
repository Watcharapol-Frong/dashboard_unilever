import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'

const IS_DEV = process.env.DEV_MODE === 'true' && process.env.NODE_ENV === 'development'

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}

function isMartNotReady(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01'
}

function martNotReadyResponse() {
  return NextResponse.json(
    { ok: false, error: 'MART_NOT_READY', message: 'Mart tables not found. Run Build Mart first.' },
    { status: 503 }
  )
}

export async function requireAuth(): Promise<void> {
  if (IS_DEV) return
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
}

export async function requireAdmin(): Promise<void> {
  if (IS_DEV) return
  const user = await currentUser()
  if (!user) throw new UnauthorizedError()
  const role = user.publicMetadata?.role as string
  if (role !== 'admin') throw new ForbiddenError()
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
    if (isMartNotReady(err)) return martNotReadyResponse()
    console.error('[withAdmin] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function withAuth(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    await requireAuth()
    return await handler()
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    if (isMartNotReady(err)) return martNotReadyResponse()
    console.error('[withAuth] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
