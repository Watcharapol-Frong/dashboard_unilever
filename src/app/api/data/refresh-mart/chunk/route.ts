import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  return withAdmin(async () => {
    // Chunked mart build is no longer supported — use the main refresh endpoint instead.
    return NextResponse.json(
      { error: 'Chunked build removed. Use POST /api/data/refresh-mart instead.' },
      { status: 410 }
    )
  })
}
