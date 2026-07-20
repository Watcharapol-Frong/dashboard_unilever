import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { buildLock } from '@/lib/build-lock'
import { triggerMartBuildWorkflow } from '@/lib/build-trigger'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    return NextResponse.json(buildLock.get())
  })
}

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await request.json().catch(() => ({}))
    const attributionDays = Math.max(1, Math.min(365, Number(body.attribution_days ?? 30)))

    const result = await triggerMartBuildWorkflow(attributionDays)
    if (!result.ok) {
      const status = result.error?.startsWith('GH_WORKFLOW_TOKEN') ? 503 : 502
      return NextResponse.json({ ok: false, error: result.error }, { status })
    }

    // 204 No Content = workflow triggered successfully
    return NextResponse.json({ ok: true, triggered: true, attribution_days: attributionDays })
  })
}
