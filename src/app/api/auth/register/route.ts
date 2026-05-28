import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { timingSafeEqual } from 'crypto'

// ─── In-memory rate limiter ────────────────────────────────────────────────────
// For distributed / production deployments, replace with @upstash/ratelimit
// backed by a Redis instance so limits persist across serverless invocations.
const WINDOW_MS  = 60_000   // 1 minute
const MAX_HITS   = 5        // max attempts per IP per window

interface Window { count: number; start: number }
const ipWindows = new Map<string, Window>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const win = ipWindows.get(ip)
  if (!win || now - win.start > WINDOW_MS) {
    ipWindows.set(ip, { count: 1, start: now })
    return false
  }
  win.count++
  return win.count > MAX_HITS
}

// ─── Constant-time string comparison ──────────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ba.length !== bb.length) {
      // Still run comparison to prevent length-based timing leak
      timingSafeEqual(ba, Buffer.alloc(ba.length))
      return false
    }
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

// ─── Role resolution ───────────────────────────────────────────────────────────
function getRole(code: string): 'viewer' | 'admin' | null {
  const viewerCode = process.env.INVITE_CODE_VIEWER ?? ''
  const adminCode  = process.env.INVITE_CODE_ADMIN  ?? ''
  if (!viewerCode || !adminCode) return null
  if (safeEqual(code, adminCode))  return 'admin'
  if (safeEqual(code, viewerCode)) return 'viewer'
  return null
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Rate-limit by forwarded IP (Vercel sets x-forwarded-for)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()

    const firstName  = typeof body.firstName  === 'string' ? body.firstName.trim()  : ''
    const lastName   = typeof body.lastName   === 'string' ? body.lastName.trim()   : ''
    const email      = typeof body.email      === 'string' ? body.email.trim()      : ''
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : ''

    if (!email || !inviteCode) {
      return NextResponse.json({ error: 'email and inviteCode are required' }, { status: 400 })
    }

    const role = getRole(inviteCode)
    if (!role) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
    }

    const client = await clerkClient()
    await client.users.createUser({
      emailAddress: [email],
      ...(firstName && { firstName }),
      ...(lastName  && { lastName  }),
      publicMetadata: { role },
    })

    return NextResponse.json({ ok: true, role })
  } catch (err: unknown) {
    const clerkErr = err as { errors?: { message: string; longMessage?: string }[] }
    const message  = clerkErr.errors?.[0]?.longMessage
                  ?? clerkErr.errors?.[0]?.message
                  ?? (err instanceof Error ? err.message : 'Registration failed')
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
