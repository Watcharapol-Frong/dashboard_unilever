import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { buildLock } from '@/lib/build-lock'

export const dynamic = 'force-dynamic'

const GH_TOKEN    = process.env.GH_WORKFLOW_TOKEN
const GH_REPO     = 'Watcharapol-Frong/dashboard_unilever'
const GH_WORKFLOW = 'nightly-build.yml'

export async function GET() {
  return withAdmin(async () => {
    return NextResponse.json(buildLock.get())
  })
}

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await request.json().catch(() => ({}))
    const attributionDays = Math.max(1, Math.min(365, Number(body.attribution_days ?? 30)))

    if (!GH_TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'GH_WORKFLOW_TOKEN is not configured. Add it to Vercel environment variables.' },
        { status: 503 }
      )
    }

    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { attribution_days: String(attributionDays) },
        }),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: `GitHub API error ${res.status}: ${text}` },
        { status: 502 }
      )
    }

    // 204 No Content = workflow triggered successfully
    return NextResponse.json({ ok: true, triggered: true, attribution_days: attributionDays })
  })
}
