import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  return withAdmin(async () => {
    return NextResponse.json({ error: 'Build not yet implemented' }, { status: 501 })
  })
}
