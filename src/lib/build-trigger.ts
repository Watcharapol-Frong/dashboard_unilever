// Dispatches the nightly-build.yml GitHub Actions workflow on demand.
// Shared by the manual "Build Mart" button (hub/build/route.ts) and the
// auto-trigger that fires after a successful upload (multipart/complete/route.ts).
const GH_REPO     = 'Watcharapol-Frong/dashboard_unilever'
const GH_WORKFLOW = 'nightly-build.yml'

export async function triggerMartBuildWorkflow(
  attributionDays = 30
): Promise<{ ok: boolean; error?: string }> {
  const ghToken = process.env.GH_WORKFLOW_TOKEN
  if (!ghToken) return { ok: false, error: 'GH_WORKFLOW_TOKEN is not configured.' }

  const clamped = Math.max(1, Math.min(365, attributionDays))

  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { attribution_days: String(clamped) },
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: `GitHub API error ${res.status}: ${text}` }
  }

  return { ok: true }
}
