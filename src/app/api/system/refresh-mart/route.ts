import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { refreshAllMarts } from '@/lib/services/mart-service'

export async function POST() {
  return withAdmin(async () => {
    const start = Date.now()
    try {
      const rows = await refreshAllMarts()
      return NextResponse.json({ ok: true, rows, duration_ms: Date.now() - start })
    } catch (err) {
      console.error('[refresh-mart]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
