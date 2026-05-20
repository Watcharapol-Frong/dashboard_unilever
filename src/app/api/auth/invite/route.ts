import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

interface InviteBody {
  email: string
  role: 'admin' | 'viewer'
}

export async function POST(request: Request) {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body: InviteBody = await request.json()
  const { email, role } = body

  if (!email || !role || !['admin', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid request: email and role required' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/overview`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
