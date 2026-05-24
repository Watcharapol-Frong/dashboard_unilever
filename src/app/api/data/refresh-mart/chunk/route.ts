import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { refreshMartChunk } from '@/lib/services/mart-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await request.json().catch(() => ({}))
    const offset            = Number(body.offset ?? 0)
    const limit             = Math.min(5000, Math.max(1, Number(body.limit ?? 2000)))
    const attributionDays   = Number(body.attribution_days ?? 14)
    const truncate          = Boolean(body.truncate ?? false)
    const precomputedTotal  = body.total !== undefined && body.total !== null
      ? Number(body.total)
      : undefined

    try {
      const result = await refreshMartChunk(offset, limit, attributionDays, truncate, precomputedTotal)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      console.error('[refresh-mart/chunk]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
