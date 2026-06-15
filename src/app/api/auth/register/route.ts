import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json()
  const { step, inviteCode } = body

  if (!inviteCode) {
    return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
  }

  const ADMIN_CODE  = process.env.INVITE_CODE_ADMIN
  const VIEWER_CODE = process.env.INVITE_CODE_VIEWER

  let role: string
  if (inviteCode === ADMIN_CODE)       role = 'admin'
  else if (inviteCode === VIEWER_CODE) role = 'viewer'
  else return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })

  // Step 1 — just validate the invite code and return the role
  if (step === 'validate') {
    return NextResponse.json({ ok: true, role })
  }

  // Step 2 — create the user via Clerk Backend API
  const { email, password, firstName, lastName } = body
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    await client.users.createUser({
      emailAddress: [email],
      password,
      firstName: firstName || undefined,
      lastName:  lastName  || undefined,
      publicMetadata: { role },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const clerkErr = err as { errors?: { longMessage?: string }[]; message?: string }
    const message  = clerkErr?.errors?.[0]?.longMessage ?? clerkErr?.message ?? 'Registration failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
