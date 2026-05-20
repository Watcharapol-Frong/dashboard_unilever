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

    const CHUNK_SIZE = 3 * 1024 * 1024 // 3MB per chunk — stays under Vercel's 4.5MB limit

    try {
      const uploadId = crypto.randomUUID()
      const totalChunks = Math.ceil(job.file.size / CHUNK_SIZE)

      // Upload chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const chunk = job.file.slice(start, start + CHUNK_SIZE)
        const form = new FormData()
        form.append('chunk', chunk)
        form.append('uploadId', uploadId)
        form.append('index', String(i))
        form.append('total', String(totalChunks))

        const res = await fetch('/api/data/upload/chunk', { method: 'POST', body: form })
        if (!res.ok) { fail('Chunk upload failed'); return }

        const pct = Math.round(((i + 1) / totalChunks) * 90)
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: pct } : j))
      }

      // Process assembled file
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 95 } : j))
      const res = await fetch(`/api/data/upload/${job.fileType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, filename: job.file.name }),
      })
      let result: UploadResult
      try { result = await res.json() }
      catch { result = { ok: false, error: 'Invalid server response' } }

      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: result.ok ? 'done' : 'failed', progress: 100, result } : j
      ))
      swrMutate('/api/data/history')
      swrMutate('/api/data/status')
    } catch (err) {
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
