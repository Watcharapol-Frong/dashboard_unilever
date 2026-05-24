import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

// Map invite code → role.  Set these in .env.local (or Vercel env vars).
function getRole(code: string): 'viewer' | 'admin' | null {
  const viewerCode = process.env.INVITE_CODE_VIEWER
  const adminCode  = process.env.INVITE_CODE_ADMIN
  if (!viewerCode || !adminCode) return null   // env vars not configured
  if (code === adminCode)  return 'admin'
  if (code === viewerCode) return 'viewer'
  return null
}

export async function POST(request: Request) {
  try {
    const { email, password, inviteCode } = await request.json()

    if (!email || !password || !inviteCode) {
      return NextResponse.json({ error: 'email, password and inviteCode are required' }, { status: 400 })
    }

    const role = getRole(String(inviteCode).trim())
    if (!role) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
    }

    const client = await clerkClient()
    await client.users.createUser({
      emailAddress: [email],
      password,
      publicMetadata: { role },
    })

    return NextResponse.json({ ok: true, role })
  } catch (err: unknown) {
    // Clerk returns structured error objects
    const clerkErr = err as { errors?: { message: string; longMessage?: string }[] }
    const message  = clerkErr.errors?.[0]?.longMessage
                  ?? clerkErr.errors?.[0]?.message
                  ?? (err instanceof Error ? err.message : 'Registration failed')
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
