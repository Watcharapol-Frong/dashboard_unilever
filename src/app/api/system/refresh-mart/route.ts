import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { refreshAllMarts } from '@/lib/services/mart-service'

export async function POST(request: Request) {
  return withAdmin(async () => {
    const start = Date.now()
    try {
      const body = await request.json().catch(() => ({}))
      const attributionDays = Number(body.attribution_days ?? 14)
      const rows = await refreshAllMarts(attributionDays)
      return NextResponse.json({ ok: true, rows, attribution_days: attributionDays, duration_ms: Date.now() - start })
    } catch (err) {
      console.error('[refresh-mart]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
