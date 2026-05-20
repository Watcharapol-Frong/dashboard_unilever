'use client'
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { mutate as swrMutate } from 'swr'
import type { UploadFileType } from '@/lib/upload/config'

export const MAX_CONCURRENT = 5

export interface UploadResult {
  ok: boolean
  row_count?: number
  error_count?: number
  errors?: string[]
  error?: string
  extra_columns?: string[]
}

export interface UploadJob {
  id:       string
  fileType: UploadFileType
  file:     File
  label:    string
  status:   'queued' | 'uploading' | 'done' | 'failed'
  progress: number
  result?:  UploadResult
}

interface UploadQueueContextValue {
  jobs:       UploadJob[]
  enqueueJob: (job: Omit<UploadJob, 'status' | 'progress'>) => void
  dismissJob: (id: string) => void
}

const UploadQueueContext = createContext<UploadQueueContextValue>({
  jobs:       [],
  enqueueJob: () => {},
  dismissJob: () => {},
})

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const jobsRef = useRef<UploadJob[]>([])
  jobsRef.current = jobs

  const startJob = useCallback(async (job: UploadJob) => {
    const fail = (error: string) => {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'failed', progress: 0, result: { ok: false, error } } : j))
    }

    const PART_SIZE = 10 * 1024 * 1024 // 10MB per part

    let uploadId: string | null = null
    let key: string | null = null

    try {
      // Phase 1: Initiate multipart upload + get presigned URLs for all parts
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 2 } : j))
      const initRes = await fetch('/api/data/upload/multipart/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: job.fileType, fileSize: job.file.size }),
      })
      if (!initRes.ok) {
        const { error } = await initRes.json().catch(() => ({ error: 'Init failed' }))
        fail(error ?? 'Failed to initiate upload')
        return
      }
      const { uploadId: uid, key: k, presignedUrls, partSize } = await initRes.json()
      uploadId = uid
      key = k

      // Phase 2: Upload all parts in parallel directly to R2
      const partCount = presignedUrls.length
      const completedParts: { PartNumber: number; ETag: string }[] = new Array(partCount)
      let completedCount = 0

      await Promise.all(
        presignedUrls.map(async (url: string, idx: number) => {
          const start = idx * partSize
          const slice = job.file.slice(start, start + partSize)

          const res = await fetch(url, { method: 'PUT', body: slice })
          if (!res.ok) throw new Error(`Part ${idx + 1} upload failed (${res.status})`)

          const etag = res.headers.get('ETag')
          if (!etag) throw new Error(`Part ${idx + 1} missing ETag`)

          completedParts[idx] = { PartNumber: idx + 1, ETag: etag }
          completedCount++

          const pct = 5 + Math.round((completedCount / partCount) * 80)
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: pct } : j))
        })
      )

      // Phase 3: Complete multipart + process from R2
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 90 } : j))
      const completeRes = await fetch('/api/data/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key, parts: completedParts, type: job.fileType, filename: job.file.name }),
      })
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 95 } : j))

      let result: UploadResult
      try { result = await completeRes.json() }
      catch { result = { ok: false, error: 'Invalid server response' } }

      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: result.ok ? 'done' : 'failed', progress: 100, result } : j
      ))
      swrMutate('/api/data/history')
      swrMutate('/api/data/status')

    } catch (err) {
      if (uploadId && key) {
        fetch('/api/data/upload/multipart/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId, key }),
        }).catch(e => console.warn('[upload] abort failed:', e))
      }
      fail((err as Error).message ?? 'Upload failed')
    }
  }, [])

  const tryStartQueued = useCallback(() => {
    setJobs(prev => {
      const active = prev.filter(j => j.status === 'uploading').length
      if (active >= MAX_CONCURRENT) return prev
      const nextQueued = [...prev].reverse().find(j => j.status === 'queued')
      if (!nextQueued) return prev
      setTimeout(() => startJob(nextQueued), 0)
      return prev.map(j => j.id === nextQueued.id ? { ...j, status: 'uploading' as const } : j)
    })
  }, [startJob])

  const dismissJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id))
    setTimeout(tryStartQueued, 0)
  }, [tryStartQueued])

  const enqueueJob = useCallback((job: Omit<UploadJob, 'status' | 'progress'>) => {
    const active = jobsRef.current.filter(j => j.status === 'uploading').length
    const status = active < MAX_CONCURRENT ? 'uploading' : 'queued' as const
    const next: UploadJob = { ...job, status, progress: 0 }
    setJobs(prev => [next, ...prev])
    if (status === 'uploading') setTimeout(() => startJob(next), 0)
  }, [startJob])

  // Auto-dismiss successful jobs after 3s
  useEffect(() => {
    const done = jobs.filter(j => j.status === 'done')
    if (done.length === 0) return
    const timers = done.map(j => setTimeout(() => dismissJob(j.id), 3000))
    return () => timers.forEach(clearTimeout)
  }, [jobs, dismissJob])

  // Start queued jobs whenever a slot opens
  useEffect(() => {
    const active = jobs.filter(j => j.status === 'uploading').length
    if (active < MAX_CONCURRENT) tryStartQueued()
  }, [jobs, tryStartQueued])

  return (
    <UploadQueueContext.Provider value={{ jobs, enqueueJob, dismissJob }}>
      {children}
    </UploadQueueContext.Provider>
  )
}

export function useUploadQueue() {
  return useContext(UploadQueueContext)
}
