import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { buildLock } from '@/lib/build-lock'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    return NextResponse.json(buildLock.get())
  })
}
