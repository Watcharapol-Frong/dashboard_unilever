'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { mutate as swrMutate } from 'swr'

export interface BuildResult {
  ok: boolean
  triggered?: boolean
  done?: boolean
  rows?: { mart_main: number; performance: number }
  attribution_days?: number
  error?: string
}

interface BuildContextValue {
  buildLoading: boolean
  elapsedSeconds: number
  buildResult: BuildResult | null
  buildVersion: number
  clearBuildResult: () => void
  startBuild: (effectiveDays: number) => Promise<void>
  watchExternalBuild: () => void
}

const BuildContext = createContext<BuildContextValue>({
  buildLoading: false,
  elapsedSeconds: 0,
  buildResult: null,
  buildVersion: 0,
  clearBuildResult: () => {},
  startBuild: async () => {},
  watchExternalBuild: () => {},
})

const POLL_INTERVAL_MS = 20_000   // check freshness every 20 s
const POLL_TIMEOUT_MS  = 45 * 60_000  // give up after 45 min

export function BuildProvider({ children }: { children: React.ReactNode }) {
  const [buildLoading, setBuildLoading] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [buildResult, setBuildResult]   = useState<BuildResult | null>(null)
  const [buildVersion, setBuildVersion] = useState<number>(() => {
    if (typeof window !== 'undefined') return Number(localStorage.getItem('buildVersion') ?? 0)
    return 0
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollKillRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBuildResult = useCallback(() => setBuildResult(null), [])

  const stopPolling = useCallback(() => {
    if (pollRef.current)     { clearInterval(pollRef.current);   pollRef.current = null }
    if (pollKillRef.current) { clearTimeout(pollKillRef.current); pollKillRef.current = null }
  }, [])

  // Polls /api/data/hub/freshness until a build that started after `triggeredAt`
  // finishes, then bumps buildVersion and invalidates every /api/data/* SWR key.
  // Shared by startBuild() (manual) and watchExternalBuild() (auto-triggered
  // elsewhere, e.g. right after an upload — see multipart/complete/route.ts).
  const watchBuildCompletion = useCallback((triggeredAt: number) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const fr = await fetch('/api/data/hub/freshness')
        const fd = await fr.json() as { last_build?: { status: string; finished_at: string | null } }
        const b = fd.last_build
        if (
          b?.status === 'success' &&
          b.finished_at &&
          new Date(b.finished_at).getTime() > triggeredAt
        ) {
          stopPolling()
          setBuildVersion(v => {
            const next = v + 1
            localStorage.setItem('buildVersion', String(next))
            return next
          })
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/data/'))
          setBuildResult(r => r ? { ...r, done: true } : { ok: true, triggered: true, done: true })
        }
      } catch { /* ignore transient errors */ }
    }, POLL_INTERVAL_MS)

    // Safety: stop polling after timeout
    pollKillRef.current = setTimeout(stopPolling, POLL_TIMEOUT_MS)
  }, [stopPolling])

  // Start watching for a build that was triggered outside this hook (e.g. the
  // server auto-triggers one right after an upload finishes). No-ops if we're
  // already watching one — only one mart build can be "the latest" at a time.
  const watchExternalBuild = useCallback(() => {
    if (buildLoading || pollRef.current) return
    watchBuildCompletion(Date.now())
  }, [buildLoading, watchBuildCompletion])

  const startBuild = useCallback(async (effectiveDays: number) => {
    if (buildLoading) return
    setBuildLoading(true)
    setBuildResult(null)
    setElapsedSeconds(0)
    stopPolling()

    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)

    try {
      const res: Response = await fetch('/api/data/hub/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribution_days: effectiveDays }),
      })
      const data = await res.json() as { ok: boolean; triggered?: boolean; mart_main?: number; performance?: number; attribution_days?: number; error?: string }

      if (!data.ok) {
        setBuildResult({ ok: false, error: data.error ?? 'Build failed' })
        return
      }

      if (data.triggered) {
        // GitHub Actions triggered — poll freshness until build finishes
        setBuildResult({ ok: true, triggered: true, attribution_days: effectiveDays })
        watchBuildCompletion(Date.now())
      } else {
        // Direct build result (legacy / local)
        setBuildResult({
          ok: true,
          attribution_days: effectiveDays,
          rows: { mart_main: data.mart_main ?? 0, performance: data.performance ?? 0 },
        })
        setBuildVersion(v => {
          const next = v + 1
          localStorage.setItem('buildVersion', String(next))
          return next
        })
        swrMutate((key) => typeof key === 'string' && key.startsWith('/api/data/'))
      }
    } catch {
      setBuildResult({ ok: false, error: 'Network error' })
    } finally {
      setBuildLoading(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [buildLoading, stopPolling, watchBuildCompletion])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    stopPolling()
  }, [stopPolling])

  return (
    <BuildContext.Provider value={{ buildLoading, elapsedSeconds, buildResult, buildVersion, clearBuildResult, startBuild, watchExternalBuild }}>
      {children}
    </BuildContext.Provider>
  )
}

export function useBuild() {
  return useContext(BuildContext)
}
