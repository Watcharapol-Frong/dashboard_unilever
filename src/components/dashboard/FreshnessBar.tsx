'use client'
import useSWR from 'swr'

interface FreshnessData {
  ok: boolean
  last_refreshed: string | null
  max_date: string | null
  last_build?: { status: string; finished_at: string | null; duration_ms: number | null } | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function FreshnessBar() {
  const { data } = useSWR<FreshnessData>('/api/data/hub/freshness', fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
  })

  if (!data?.ok) return null

  const lastRefreshed = data.last_refreshed ? new Date(data.last_refreshed) : null
  const hoursSince    = lastRefreshed
    ? (Date.now() - lastRefreshed.getTime()) / (1000 * 60 * 60)
    : Infinity

  // No warning needed if data is fresh (< 24 h)
  if (hoursSince < 24) return null

  const dateLabel = lastRefreshed
    ? lastRefreshed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const label = dateLabel
    ? `Data last refreshed ${dateLabel} (${Math.floor(hoursSince)}h ago)`
    : 'No mart data loaded yet'

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-amber-500">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span className="font-medium">{label}.</span>
      <span className="text-amber-600">Go to Data Hub → Build Mart to refresh.</span>
    </div>
  )
}
