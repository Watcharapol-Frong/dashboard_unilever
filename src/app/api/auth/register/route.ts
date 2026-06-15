import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json()
  const { step, inviteCode, name, email } = body

  if (!inviteCode) {
    return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
  }

  const ADMIN_CODE  = process.env.INVITE_CODE_ADMIN
  const VIEWER_CODE = process.env.INVITE_CODE_VIEWER

  let role: string
  if (inviteCode === ADMIN_CODE)       role = 'admin'
  else if (inviteCode === VIEWER_CODE) role = 'viewer'
  else return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })

  if (step === 'validate') {
    return NextResponse.json({ ok: true, role })
  }

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // Split name into first/last for Clerk
  const parts     = name.trim().split(/\s+/)
  const firstName = parts[0]
  const lastName  = parts.slice(1).join(' ') || undefined

  try {
    const client = await clerkClient()
    await client.users.createUser({
      emailAddress: [email],
      firstName,
      lastName,
      publicMetadata: { role },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const clerkErr = err as { errors?: { longMessage?: string }[]; message?: string }
    const message  = clerkErr?.errors?.[0]?.longMessage ?? clerkErr?.message ?? 'Registration failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
