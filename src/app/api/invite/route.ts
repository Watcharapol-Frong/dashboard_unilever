import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, role, company } = await request.json()
  if (!email || !role) return NextResponse.json({ error: 'Missing email or role' }, { status: 400 })

  // Use service role client for admin invite
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { role, company: company ?? null },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert user_roles record — will be confirmed after user clicks magic link
  await adminClient.from('user_roles').upsert({ user_id: data.user.id, role, company: company ?? null })

  return NextResponse.json({ ok: true, user_id: data.user.id })
}
