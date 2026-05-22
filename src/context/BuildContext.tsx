'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { mutate as swrMutate } from 'swr'

export interface BuildProgress {
  current: number
  total: number
  phase: 'chunking' | 'finalizing'
}

export interface BuildResult {
  ok: boolean
  rows?: { mart_main: number; cost_incentive: number }
  attribution_days?: number
  error?: string
}

interface BuildContextValue {
  buildLoading: boolean
  buildProgress: BuildProgress | null
  buildResult: BuildResult | null
  clearBuildResult: () => void
  startBuild: (effectiveDays: number) => Promise<void>
}

const BuildContext = createContext<BuildContextValue>({
  buildLoading: false,
  buildProgress: null,
  buildResult: null,
  clearBuildResult: () => {},
  startBuild: async () => {},
})

export function BuildProvider({ children }: { children: React.ReactNode }) {
  const [buildLoading, setBuildLoading]   = useState(false)
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null)
  const [buildResult, setBuildResult]     = useState<BuildResult | null>(null)

  const clearBuildResult = useCallback(() => setBuildResult(null), [])

  const startBuild = useCallback(async (effectiveDays: number) => {
    if (buildLoading) return
    setBuildLoading(true)
    setBuildResult(null)
    setBuildProgress(null)

    const LIMIT    = 750
    const PARALLEL = 2
    let offset = 0
    let martMainRows = 0

    try {
      while (true) {
        const promises = []
        for (let i = 0; i < PARALLEL; i++) {
          const currentOffset = offset + i * LIMIT
          promises.push(
            fetch('/api/data/refresh-mart/chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                offset: currentOffset,
                limit: LIMIT,
                attribution_days: effectiveDays,
                truncate: currentOffset === 0,
              }),
            }).then(res => res.json())
          )
        }

        const results = await Promise.all(promises)

        let anyDone = false
        let lastNextOffset = offset
        let totalCount = 0

        for (const data of results) {
          if (!data.ok) {
            setBuildResult({ ok: false, error: data.error ?? 'Chunk failed' })
            return
          }
          martMainRows  += data.processed
          lastNextOffset = Math.max(lastNextOffset, data.next_offset)
          totalCount     = data.total
          if (data.done) anyDone = true
        }

        setBuildProgress({ current: lastNextOffset, total: totalCount, phase: 'chunking' })

        if (anyDone) break
        offset = lastNextOffset
      }

      setBuildProgress({ current: 0, total: 0, phase: 'finalizing' })
      const finalRes  = await fetch('/api/data/refresh-mart/finalize', { method: 'POST' })
      const finalData = await finalRes.json()
      if (!finalRes.ok || !finalData.ok) {
        setBuildResult({ ok: false, error: finalData.error ?? 'Finalize failed' })
        return
      }

      setBuildResult({
        ok: true,
        attribution_days: effectiveDays,
        rows: { mart_main: martMainRows, cost_incentive: finalData.cost_incentive },
      })
      swrMutate('/api/data/mart-status')
    } catch {
      setBuildResult({ ok: false, error: 'Network error' })
    } finally {
      setBuildLoading(false)
      setBuildProgress(null)
    }
  }, [buildLoading])

  return (
    <BuildContext.Provider value={{ buildLoading, buildProgress, buildResult, clearBuildResult, startBuild }}>
      {children}
    </BuildContext.Provider>
  )
}

export function useBuild() {
  return useContext(BuildContext)
}
