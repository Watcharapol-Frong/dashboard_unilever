import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

function getRole(code: string): 'viewer' | 'admin' | null {
  const viewerCode = process.env.INVITE_CODE_VIEWER
  const adminCode  = process.env.INVITE_CODE_ADMIN
  if (!viewerCode || !adminCode) return null
  if (code === adminCode)  return 'admin'
  if (code === viewerCode) return 'viewer'
  return null
}

export async function POST(request: Request) {
  try {
    const { email, inviteCode } = await request.json()

    if (!email || !inviteCode) {
      return NextResponse.json({ error: 'email and inviteCode are required' }, { status: 400 })
    }

    const role = getRole(String(inviteCode).trim())
    if (!role) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
    }

    const client = await clerkClient()
    await client.users.createUser({
      emailAddress: [email],
      publicMetadata: { role },
      // No password — user signs in via magic link / email OTP (Clerk handles it)
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
