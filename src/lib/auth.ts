import { NextResponse } from 'next/server'

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}

function isMartNotReady(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as any).code === '42P01'
}

function martNotReadyResponse() {
  return NextResponse.json(
    { ok: false, error: 'MART_NOT_READY', message: 'Mart tables not found. Run Build Mart first.' },
    { status: 503 }
  )
}

// Auth disabled — all requests treated as authenticated admin for preview
export async function requireAdmin(): Promise<void> {}
export async function requireAuth(): Promise<void> {}

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
    return await handler()
  } catch (err) {
    if (isMartNotReady(err)) return martNotReadyResponse()
    console.error('[withAdmin] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function withAuth(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler()
  } catch (err) {
    if (isMartNotReady(err)) return martNotReadyResponse()
    console.error('[withAuth] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
