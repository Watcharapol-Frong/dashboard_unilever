'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { mutate as swrMutate } from 'swr'

export interface BuildResult {
  ok: boolean
  rows?: { mart_main: number; performance: number }
  attribution_days?: number
  error?: string
}

interface BuildContextValue {
  buildLoading: boolean
  elapsedSeconds: number
  buildResult: BuildResult | null
  clearBuildResult: () => void
  startBuild: (effectiveDays: number) => Promise<void>
}

const BuildContext = createContext<BuildContextValue>({
  buildLoading: false,
  elapsedSeconds: 0,
  buildResult: null,
  clearBuildResult: () => {},
  startBuild: async () => {},
})

export function BuildProvider({ children }: { children: React.ReactNode }) {
  const [buildLoading, setBuildLoading] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [buildResult, setBuildResult]   = useState<BuildResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearBuildResult = useCallback(() => setBuildResult(null), [])

  const startBuild = useCallback(async (effectiveDays: number) => {
    if (buildLoading) return
    setBuildLoading(true)
    setBuildResult(null)
    setElapsedSeconds(0)

    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)

    try {
      const res: Response = await fetch('/api/data/refresh-mart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribution_days: effectiveDays }),
      })
      const data = await res.json() as { ok: boolean; mart_main?: number; performance?: number; error?: string }

      if (!data.ok) {
        setBuildResult({ ok: false, error: data.error ?? 'Build failed' })
        return
      }

      setBuildResult({
        ok: true,
        attribution_days: effectiveDays,
        rows: { mart_main: data.mart_main ?? 0, performance: data.performance ?? 0 },
      })
      swrMutate('/api/data/mart-status')
    } catch {
      setBuildResult({ ok: false, error: 'Network error' })
    } finally {
      setBuildLoading(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [buildLoading])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return (
    <BuildContext.Provider value={{ buildLoading, elapsedSeconds, buildResult, clearBuildResult, startBuild }}>
      {children}
    </BuildContext.Provider>
  )
}

export function useBuild() {
  return useContext(BuildContext)
}
