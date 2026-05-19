'use client'
import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, AlertCircle, Upload, FileText, Clock, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { FILE_TYPE_CONFIGS, validateHeaders } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'
import { cn, formatTHB, formatNumber } from '@/lib/utils'
import { useUploadQueue, MAX_CONCURRENT } from '@/context/UploadQueueContext'

const FILE_TYPES = Object.entries(FILE_TYPE_CONFIGS) as [UploadFileType, typeof FILE_TYPE_CONFIGS[UploadFileType]][]

const MAX_FILE_MB = 50

// ── Data Status types ──────────────────────────────────────
interface SalesStatus { total_rows: number; total_sales: number; earliest_date: string | null; latest_date: string | null; last_uploaded: string | null }
interface DataStatus {
  online_sales:  SalesStatus
  offline_sales: SalesStatus
  leads:         { total_rows: number; last_uploaded: string | null }
  products:      { total_rows: number; total_brands: number; last_uploaded: string | null }
  telesales:     { total_rows: number; total_agents: number; earliest_date: string | null; latest_date: string | null; last_uploaded: string | null }
  targets:       { total_rows: number; earliest_month: string | null; latest_month: string | null; total_target: number; last_uploaded: string | null }
  costs:         { total_rows: number; earliest_month: string | null; latest_month: string | null; last_uploaded: string | null }
  incentives:    { total_tiers: number; tiers: number[]; last_uploaded: string | null }
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtMonth(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
function fmtUpload(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface StatusRowProps { label: string; value: React.ReactNode }
function StatusRow({ label, value }: StatusRowProps) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-dashed border-gray-100 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function EmptyStatus() {
  return <p className="text-xs text-muted-foreground text-center py-4">No data available</p>
}

function StatusCard({ title, badge, lastUploaded, empty, children }: {
  title: string; badge?: string; lastUploaded: string | null; empty: boolean; children?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
      </CardHeader>
      <CardContent className="flex-1 space-y-0">
        {empty ? <EmptyStatus /> : children}
        {lastUploaded && (
          <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t">
            Last updated: {lastUploaded}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

type Step = 'select' | 'validate' | 'preview'

interface PendingFile {
  id: string
  file: File
  valid: boolean
  error?: string
}

interface UploadBatch {
  id: string; table_name: string; filename: string | null
  row_count: number | null; error_count: number; status: string
  uploaded_at: string; uploaded_by: string | null
  user_profiles: { email: string; full_name: string | null } | null
}

interface ReplayResult {
  ok: boolean
  replayed_files: number
  inserted: number
  errors?: string[]
}

const REPLAY_TABLES: { value: string; label: string }[] = [
  { value: 'online_sales',    label: 'Online Sales' },
  { value: 'offline_sales',   label: 'Offline Sales' },
  { value: 'leads',           label: 'Lead Customers' },
  { value: 'products',        label: 'Products' },
  { value: 'telesales_calls', label: 'Telesales Calls (CSV + Apps Script)' },
  { value: 'targets',         label: 'Targets' },
  { value: 'costs',           label: 'Costs' },
  { value: 'incentives',      label: 'Incentives' },
]

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

export default function UploadPage() {
  const { jobs, enqueueJob, dismissJob } = useUploadQueue()

  // ── Form state (current file being prepared) ───────────────
  const [fileType, setFileType]         = useState<UploadFileType>('online_sales')
  const [step, setStep]                 = useState<Step>('select')
  const [file, setFile]                 = useState<File | null>(null)
  const [headers, setHeaders]           = useState<string[]>([])
  const [extraColumns, setExtraColumns] = useState<string[]>([])
  const [preview, setPreview]           = useState<Record<string, string>[]>([])
  const [validError, setValidError]     = useState<string | null>(null)
  const [dragOver, setDragOver]         = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])

  // ── Recovery state ─────────────────────────────────────────
  const [replayTable, setReplayTable]   = useState('telesales_calls')
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null)

  const startReplay = async () => {
    setReplayLoading(true)
    setReplayResult(null)
    try {
      const res = await fetch('/api/system/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: replayTable }),
      })
      const data = await res.json()
      setReplayResult(data)
      mutateStatus()
    } catch {
      setReplayResult({ ok: false, replayed_files: 0, inserted: 0, errors: ['Network error'] })
    } finally {
      setReplayLoading(false)
    }
  }

  // ── History pagination ─────────────────────────────────────
  const HISTORY_PAGE_SIZE = 10
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearch, setHistorySearch] = useState('')
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')

  const inputRef = useRef<HTMLInputElement>(null)

  const { data: batches, mutate, isValidating: batchesValidating } = useSWR<UploadBatch[]>('/api/data/history', fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false 
  })
  const { data: status, mutate: mutateStatus, isValidating: statusValidating } = useSWR<DataStatus>('/api/data/status', fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false 
  })

  const handleManualRefresh = () => {
    mutate()
    mutateStatus()
  }

  // ── File processing ────────────────────────────────────────
  const processFile = useCallback((f: File) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(f); setValidError(`File exceeds ${MAX_FILE_MB} MB limit`); setStep('validate'); return
    }
    setFile(f); setValidError(null)

    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: true, preview: 2,
      transformHeader: (h) => h.trim(),
      complete: ({ data }) => {
        if (!data.length) { setValidError('Empty file'); setStep('validate'); return }
        const hdrs = Object.keys(data[0])
        setHeaders(hdrs)
        const { ok, error, extraColumns: extras } = validateHeaders(hdrs, fileType)
        setValidError(ok ? null : (error ?? null))
        setExtraColumns(ok ? extras : [])
        setPreview(data.slice(0, 1))
        setStep(ok ? 'preview' : 'validate')
      },
      error: () => { setValidError('Unable to read file'); setStep('validate') },
    })
  }, [fileType])

  const reset = () => {
    setStep('select'); setFile(null); setHeaders([])
    setExtraColumns([]); setPreview([]); setValidError(null)
    setPendingFiles([])
  }

  const onTypeChange = (t: UploadFileType) => { setFileType(t); reset() }

  // ── Validate a batch of files (headers only) ───────────────
  const validateFiles = useCallback((files: File[]) => {
    setPendingFiles([])
    let resolved = 0
    const results: PendingFile[] = files.map(f => ({
      id: crypto.randomUUID(), file: f, valid: false,
    }))

    files.forEach((f, idx) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        results[idx] = { ...results[idx], valid: false, error: `Exceeds ${MAX_FILE_MB} MB limit` }
        if (++resolved === files.length) setPendingFiles([...results])
        return
      }
      Papa.parse<Record<string, string>>(f, {
        header: true, skipEmptyLines: true, preview: 1,
        transformHeader: (h) => h.trim(),
        complete: ({ data }) => {
          if (!data.length) {
            results[idx] = { ...results[idx], valid: false, error: 'Empty file' }
          } else {
            const hdrs = Object.keys(data[0])
            const { ok, error } = validateHeaders(hdrs, fileType)
            results[idx] = { ...results[idx], valid: ok, error: ok ? undefined : (error ?? 'Invalid headers') }
          }
          if (++resolved === files.length) setPendingFiles([...results])
        },
        error: () => {
          results[idx] = { ...results[idx], valid: false, error: 'Unable to read file' }
          if (++resolved === files.length) setPendingFiles([...results])
        },
      })
    })
  }, [fileType])

  // ── Enqueue all valid pending files ───────────────────────
  const confirmPendingUpload = useCallback(() => {
    pendingFiles.filter(p => p.valid).forEach(p => {
      enqueueJob({
        id:       p.id,
        fileType, file: p.file,
        label:    FILE_TYPE_CONFIGS[fileType].label,
      })
    })
    setPendingFiles([])
  }, [pendingFiles, fileType, enqueueJob])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'))
    if (files.length === 0) return
    if (files.length === 1) { processFile(files[0]) }
    else { reset(); validateFiles(files) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processFile, validateFiles])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (files.length === 1) { processFile(files[0]) }
    else { reset(); validateFiles(files) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processFile, validateFiles])

  // ── Confirm upload → enqueue + reset form ──────────────────
  const doUpload = () => {
    if (!file) return
    enqueueJob({
      id:       crypto.randomUUID(),
      fileType, file,
      label:    FILE_TYPE_CONFIGS[fileType].label,
    })
    reset()
  }

  const cfg = FILE_TYPE_CONFIGS[fileType]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload CSV — Automated header validation before importing to database
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Upload CSV</CardTitle></CardHeader>
        <CardContent className="space-y-5">

          {/* Step 1: File Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">File Type</label>
            <div className="flex flex-wrap gap-2">
              {(['online_sales', 'offline_sales'] as UploadFileType[]).map(type => {
                const c = FILE_TYPE_CONFIGS[type]
                const isActive = fileType === type
                return (
                  <button
                    key={type}
                    onClick={() => onTypeChange(type)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
                      isActive
                        ? "bg-[#003DA6] text-white border-[#003DA6] shadow-sm"
                        : "bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground"
                    )}
                  >
                    {c.label}
                  </button>
                )
              })}

              <select
                value={['online_sales', 'offline_sales'].includes(fileType) ? "" : fileType}
                onChange={e => {
                  if (e.target.value) onTypeChange(e.target.value as UploadFileType)
                }}
                className={cn(
                  "border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none transition-all cursor-pointer",
                  !['online_sales', 'offline_sales'].includes(fileType)
                    ? "bg-[#003DA6] text-white border-[#003DA6] shadow-sm ring-2 ring-[#003DA6] ring-offset-1"
                    : "bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground"
                )}
              >
                <option value="" disabled className="text-muted-foreground bg-background">Other Types...</option>
                {/* telesales first, then the rest */}
                <option value="telesales" className="text-foreground bg-background">{FILE_TYPE_CONFIGS['telesales'].label}</option>
                {FILE_TYPES.filter(([type]) => !['online_sales', 'offline_sales', 'telesales'].includes(type as string)).map(([type, c]) => (
                  <option key={type} value={type} className="text-foreground bg-background">{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2: Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
              dragOver ? 'border-[#003DA6] bg-blue-50' : 'border-gray-200 hover:border-[#003DA6] hover:bg-gray-50',
              step !== 'select' && 'border-solid border-gray-200',
            )}
          >
            <input ref={inputRef} type="file" accept=".csv" multiple className="hidden" onChange={onFileInput} />
            {!file ? (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium">Drag and drop files here, or click to select</p>
                <p className="text-xs text-muted-foreground mt-1">CSV only · Max {MAX_FILE_MB} MB per file · Multiple files supported · Up to {MAX_CONCURRENT} concurrent uploads</p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-6 w-6 text-[#003DA6]" />
                <div className="text-left">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            )}
          </div>

          {/* Validation result */}
          {step === 'validate' && validError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Invalid Headers</p>
                <p className="text-sm text-red-600 mt-0.5">{validError}</p>
                <button onClick={reset} className="text-xs underline text-red-500 mt-2">Select new file</button>
              </div>
            </div>
          )}

          {/* Preview table */}
          {step === 'preview' && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm font-medium text-green-700">Valid Headers — Preview of first row</p>
                {extraColumns.length > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {extraColumns.length} extra columns — saved to Storage but not imported to DB
                  </span>
                )}
              </div>
              <div className="rounded-lg border overflow-x-auto overflow-y-auto max-h-52 max-w-full">
                <table className="text-xs min-w-max">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      {headers.map(h => {
                        const isExtra = extraColumns.includes(h)
                        return (
                          <th key={h} className={cn(
                            'px-3 py-2 text-left font-medium whitespace-nowrap',
                            isExtra ? 'text-gray-400 bg-gray-50/80' : 'text-muted-foreground',
                          )}>
                            {h}
                            {isExtra && <span className="ml-1 text-[10px] font-normal">(ignore)</span>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        {headers.map(h => {
                          const isExtra = extraColumns.includes(h)
                          return (
                            <td key={h} className={cn(
                              'px-3 py-1.5 whitespace-nowrap max-w-[180px] truncate',
                              isExtra ? 'text-gray-400 bg-gray-50/50' : '',
                            )}>
                              {row[h] ?? ''}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Storage path: <code className="bg-muted px-1 rounded">{cfg.storageFolder}/{'<timestamp>'}_${cfg.storageFilename}.csv</code>
                {' '}→ table: <code className="bg-muted px-1 rounded">{cfg.table}</code>
              </p>
            </div>
          )}

          {/* Action buttons — single file */}
          {step === 'preview' && (
            <div className="flex gap-3">
              <button
                onClick={doUpload}
                className="px-5 py-2 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors"
              >
                Confirm Upload
              </button>
              <button onClick={reset} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* Multi-file batch validation list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{pendingFiles.length} files selected</p>
                <div className="flex gap-2">
                  {pendingFiles.some(p => p.valid) && (
                    <button
                      onClick={confirmPendingUpload}
                      className="px-4 py-1.5 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors"
                    >
                      Upload {pendingFiles.filter(p => p.valid).length} Valid File{pendingFiles.filter(p => p.valid).length > 1 ? 's' : ''}
                    </button>
                  )}
                  <button onClick={() => setPendingFiles([])} className="px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors">
                    Clear
                  </button>
                </div>
              </div>
              <div className="rounded-lg border divide-y overflow-hidden">
                {pendingFiles.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    {p.valid
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{p.file.name}</p>
                      {p.error && <p className="text-xs text-red-500 mt-0.5">{p.error}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(p.file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Jobs */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.length > 2 && (
            <p className="text-xs text-muted-foreground text-right">
              {jobs.length} files · scroll to see all
            </p>
          )}
          {/* max-h = ~2 cards (each ~100px) + gap */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
          {jobs.map(job => {
            const isUploading = job.status === 'uploading'
            const isQueued    = job.status === 'queued'
            const isDone      = job.status === 'done'
            const isFailed    = job.status === 'failed'
            return (
              <div key={job.id} className={cn(
                'rounded-xl border p-4 space-y-3',
                isUploading || isQueued ? 'border-gray-200 bg-gray-50/60'
                  : isDone ? 'border-green-200 bg-green-50/60'
                  : 'border-red-200 bg-red-50/60',
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 h-9 w-9 rounded-lg bg-white border flex items-center justify-center">
                      <FileText className="h-4 w-4 text-[#003DA6]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.label} · {(job.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isQueued && <Badge variant="secondary" className="text-xs">Queued</Badge>}
                    {(isDone || isFailed) && (
                      <button onClick={() => dismissJob(job.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {isQueued    ? 'Waiting for slot…'
                       : isUploading ? 'Uploading to server…'
                       : isDone && job.result
                         ? `${job.result.row_count?.toLocaleString()} rows imported${(job.result.error_count ?? 0) > 0 ? `, ${job.result.error_count?.toLocaleString()} skipped` : ''}`
                       : job.result?.error ?? 'Upload failed'}
                    </span>
                    <span className={cn(
                      'text-xs font-medium',
                      isUploading || isQueued ? 'text-[#003DA6]'
                        : isDone ? 'text-green-600' : 'text-red-600',
                    )}>
                      {isQueued ? '—' : isUploading ? `${job.progress}%` : isDone ? '100%' : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        isUploading || isQueued ? 'bg-[#003DA6]'
                          : isDone ? 'bg-green-500' : 'bg-red-500',
                      )}
                      style={{ width: isQueued ? '0%' : isUploading ? `${job.progress}%` : isDone ? '100%' : '40%' }}
                    />
                  </div>
                </div>

                {(isDone || isFailed) && (job.result?.errors?.length ?? 0) > 0 && (() => {
                  const groups: Record<string, number> = {}
                  for (const e of job.result!.errors!) {
                    const key = e.replace(/^Row \d+: /, '')
                    groups[key] = (groups[key] ?? 0) + 1
                  }
                  return (
                    <div className="pt-1 space-y-0.5 border-t border-dashed border-amber-200">
                      {Object.entries(groups).map(([msg, count]) => (
                        <p key={msg} className="text-xs text-amber-700">
                          {count > 1 ? `${count} rows` : '1 row'}: {msg}
                        </p>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* Overview + Data Status + Upload History Tabs */}
      <Tabs defaultValue="overview" className="gap-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="status">Data Status</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="recovery">Recovery</TabsTrigger>
          </TabsList>

          <button
            onClick={() => { mutateStatus(); mutate() }}
            disabled={statusValidating || batchesValidating}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (statusValidating || batchesValidating) && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Tab: Overview */}
        <TabsContent value="overview">
          {statusValidating && !status ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="col-span-2"><CardContent className="pt-4 space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-4 w-full"/>)}</CardContent></Card>
              <Card><CardContent className="pt-4 space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-4 w-full"/>)}</CardContent></Card>
              <Card><CardContent className="pt-4 space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-4 w-full"/>)}</CardContent></Card>
              <Card className="col-span-2 lg:col-span-4"><CardContent className="pt-4"><div className="grid grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><div key={i} className="space-y-2 text-center"><Skeleton className="h-8 w-16 mx-auto"/><Skeleton className="h-3 w-20 mx-auto"/></div>)}</div></CardContent></Card>
            </div>
          ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Combined Sales */}
            <Card className="col-span-2 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Sales Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <StatusRow
                  label="Online Sales"
                  value={
                    <span className="text-[#003DA6] font-semibold">
                      {status ? formatTHB(status.online_sales.total_sales) : '—'}
                      <span className="text-muted-foreground font-normal ml-1.5 text-[11px]">
                        ({formatNumber(status?.online_sales.total_rows ?? 0)} rows)
                      </span>
                    </span>
                  }
                />
                <StatusRow
                  label="Offline Sales"
                  value={
                    <span className="text-[#EE2737] font-semibold">
                      {status ? formatTHB(status.offline_sales.total_sales) : '—'}
                      <span className="text-muted-foreground font-normal ml-1.5 text-[11px]">
                        ({formatNumber(status?.offline_sales.total_rows ?? 0)} rows)
                      </span>
                    </span>
                  }
                />
                <StatusRow
                  label="Combined Total"
                  value={
                    <span className="font-bold">
                      {status ? formatTHB(status.online_sales.total_sales + status.offline_sales.total_sales) : '—'}
                    </span>
                  }
                />
                <StatusRow
                  label="Date Range (Online)"
                  value={`${fmtDate(status?.online_sales.earliest_date ?? null)} – ${fmtDate(status?.online_sales.latest_date ?? null)}`}
                />
                <StatusRow
                  label="Date Range (Offline)"
                  value={`${fmtDate(status?.offline_sales.earliest_date ?? null)} – ${fmtDate(status?.offline_sales.latest_date ?? null)}`}
                />
              </CardContent>
            </Card>

            {/* Leads & Telesales */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Leads & Telesales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <StatusRow label="Total Leads"    value={formatNumber(status?.leads.total_rows ?? 0)} />
                <StatusRow label="Telesales Calls" value={formatNumber(status?.telesales.total_rows ?? 0)} />
                <StatusRow label="Active Agents"  value={formatNumber(status?.telesales.total_agents ?? 0)} />
                <StatusRow
                  label="Call Date Range"
                  value={`${fmtDate(status?.telesales.earliest_date ?? null)} – ${fmtDate(status?.telesales.latest_date ?? null)}`}
                />
              </CardContent>
            </Card>

            {/* Products & Targets */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Products & Targets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <StatusRow label="Total SKUs"     value={formatNumber(status?.products.total_rows ?? 0)} />
                <StatusRow label="Total Brands"   value={formatNumber(status?.products.total_brands ?? 0)} />
                <StatusRow label="Target Periods" value={formatNumber(status?.targets.total_rows ?? 0)} />
                <StatusRow label="Total Target"   value={formatTHB(status?.targets.total_target ?? 0)} />
                <StatusRow label="Incentive Tiers" value={status?.incentives.total_tiers ?? 0} />
              </CardContent>
            </Card>

            {/* Upload Summary */}
            <Card className="col-span-2 lg:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Upload Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Uploads',   value: formatNumber(batches?.length ?? 0) },
                    { label: 'Successful',       value: formatNumber(batches?.filter(b => b.status === 'success').length ?? 0), color: 'text-green-600' },
                    { label: 'Partial',          value: formatNumber(batches?.filter(b => b.status === 'partial').length ?? 0), color: 'text-amber-500' },
                    { label: 'Failed',           value: formatNumber(batches?.filter(b => b.status === 'failed').length ?? 0), color: 'text-red-500' },
                  ].map(item => (
                    <div key={item.label} className="text-center space-y-1">
                      <p className={`text-2xl font-bold tabular-nums ${item.color ?? ''}`}>{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          )}
        </TabsContent>

        {/* Tab: Data Status */}
        <TabsContent value="status">
          {statusValidating && !status ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 grid grid-cols-6 gap-4">
                {['Table','Rows','Details','Date Range','Last Updated','Status'].map(h => (
                  <Skeleton key={h} className="h-4 w-full" />
                ))}
              </div>
              {Array.from({length: 8}).map((_, i) => (
                <div key={i} className="px-4 py-3 grid grid-cols-6 gap-4 border-t">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12 ml-auto" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4 mx-auto rounded-full" />
                </div>
              ))}
            </div>
          ) : (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Table</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rows</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date Range</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Updated</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Online Sales */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Online Sales</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.online_sales.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{status ? formatTHB(status.online_sales.total_sales) : '—'} total</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {fmtDate(status?.online_sales.earliest_date ?? null)} – {fmtDate(status?.online_sales.latest_date ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.online_sales.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.online_sales.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Offline Sales */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Offline Sales</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.offline_sales.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{status ? formatTHB(status.offline_sales.total_sales) : '—'} total</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {fmtDate(status?.offline_sales.earliest_date ?? null)} – {fmtDate(status?.offline_sales.latest_date ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.offline_sales.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.offline_sales.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Leads */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Leads</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.leads.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.leads.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.leads.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Products */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Products</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.products.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatNumber(status?.products.total_brands ?? 0)} brands</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.products.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.products.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Telesales */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Telesales Calls</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.telesales.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatNumber(status?.telesales.total_agents ?? 0)} agents</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {fmtDate(status?.telesales.earliest_date ?? null)} – {fmtDate(status?.telesales.latest_date ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.telesales.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.telesales.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Targets */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Targets</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.targets.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{status ? formatTHB(status.targets.total_target) : '—'} total</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {fmtMonth(status?.targets.earliest_month ?? null)} – {fmtMonth(status?.targets.latest_month ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.targets.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.targets.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Costs */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Costs</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(status?.costs.total_rows ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {fmtMonth(status?.costs.earliest_month ?? null)} – {fmtMonth(status?.costs.latest_month ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.costs.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.costs.total_rows ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
                {/* Incentives */}
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">Incentives</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{status?.incentives.total_tiers ?? 0}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {status?.incentives.tiers.map(t => `${(t * 100).toFixed(0)}%`).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtUpload(status?.incentives.last_uploaded ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {(status?.incentives.total_tiers ?? 0) > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </TabsContent>

        {/* Tab: History */}
        <TabsContent value="history">
          {batchesValidating && !batches ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 grid grid-cols-7 gap-4">
                {['Date','Type','File','Uploaded By','Rows','Errors','Status'].map(h => (
                  <Skeleton key={h} className="h-4 w-full" />
                ))}
              </div>
              {Array.from({length: 10}).map((_, i) => (
                <div key={i} className="px-4 py-3 grid grid-cols-7 gap-4 border-t">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-10 ml-auto" />
                  <Skeleton className="h-4 w-8 ml-auto" />
                  <Skeleton className="h-4 w-4 mx-auto rounded-full" />
                </div>
              ))}
            </div>
          ) : !batches || batches.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No upload history</p>
          ) : (() => {
            const filteredBatches = batches.filter(b => {
              const matchesSearch = !historySearch || 
                (b.filename?.toLowerCase().includes(historySearch.toLowerCase()) || 
                 b.table_name.toLowerCase().includes(historySearch.toLowerCase()))
              const matchesType = historyTypeFilter === 'all' || b.table_name === historyTypeFilter
              const matchesStatus = historyStatusFilter === 'all' || b.status === historyStatusFilter
              return matchesSearch && matchesType && matchesStatus
            })

            const totalPages = Math.ceil(filteredBatches.length / HISTORY_PAGE_SIZE)
            const pageRows  = filteredBatches.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)

            return (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-lg border border-dashed">
                  <div className="flex-1 min-w-[200px]">
                    <input 
                      type="text" 
                      placeholder="Search filename or type..." 
                      value={historySearch}
                      onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1) }}
                      className="w-full text-xs px-3 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-[#003DA6]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Type:</span>
                    <select 
                      value={historyTypeFilter}
                      onChange={e => { setHistoryTypeFilter(e.target.value); setHistoryPage(1) }}
                      className="text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none"
                    >
                      <option value="all">All Types</option>
                      {Array.from(new Set(batches.map(b => b.table_name))).map(type => (
                        <option key={type} value={type}>
                          {FILE_TYPE_CONFIGS[type as UploadFileType]?.label ?? type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <select 
                      value={historyStatusFilter}
                      onChange={e => { setHistoryStatusFilter(e.target.value); setHistoryPage(1) }}
                      className="text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="success">Success</option>
                      <option value="partial">Partial</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  {(historySearch || historyTypeFilter !== 'all' || historyStatusFilter !== 'all') && (
                    <button 
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryTypeFilter('all');
                        setHistoryStatusFilter('all');
                        setHistoryPage(1);
                      }}
                      className="text-[10px] text-[#003DA6] hover:underline"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>

                {filteredBatches.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-10 text-center">
                    <p className="text-sm text-muted-foreground">No matches found for your filters</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">File</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uploaded By</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rows</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Errors</th>
                            <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map(b => (
                            <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {new Date(b.uploaded_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary">
                                  {FILE_TYPE_CONFIGS[b.table_name as UploadFileType]?.label ?? b.table_name}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-sm max-w-[200px] truncate">{b.filename ?? '-'}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {b.user_profiles
                                  ? (b.user_profiles.full_name || b.user_profiles.email)
                                  : <span className="italic">— (ยังไม่มี Auth)</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right">{b.row_count ?? 0}</td>
                              <td className="px-4 py-2.5 text-right">
                                {b.error_count > 0 ? <span className="text-amber-500">{b.error_count}</span> : 0}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={cn(
                                  'text-xs font-semibold',
                                  b.status === 'success' ? 'text-green-600'
                                  : b.status === 'partial' ? 'text-amber-500'
                                  : b.status === 'failed'  ? 'text-red-500'
                                  : 'text-gray-400',
                                )}>
                                  {b.status === 'success' ? 'Success'
                                   : b.status === 'partial' ? 'Partial'
                                   : b.status === 'failed'  ? 'Failed'
                                   : 'Processing'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-xs text-muted-foreground">
                        Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, filteredBatches.length)} of {filteredBatches.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHistoryPage(1)}
                          disabled={historyPage === 1}
                          className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
                        >«</button>
                        <button
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={historyPage === 1}
                          className="px-2.5 py-1 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
                        >‹</button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - historyPage) <= 1)
                          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
                            acc.push(p)
                            return acc
                          }, [])
                          .map((p, idx) =>
                            p === '…' ? (
                              <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-muted-foreground">…</span>
                            ) : (
                              <button
                                key={p}
                                onClick={() => setHistoryPage(p as number)}
                                className={cn(
                                  'px-2.5 py-1 rounded border text-xs transition-colors',
                                  historyPage === p
                                    ? 'bg-[#003DA6] text-white border-[#003DA6]'
                                    : 'hover:bg-muted',
                                )}
                              >{p}</button>
                            )
                          )}

                        <button
                          onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                          disabled={historyPage === totalPages}
                          className="px-2.5 py-1 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
                        >›</button>
                        <button
                          onClick={() => setHistoryPage(totalPages)}
                          disabled={historyPage === totalPages}
                          className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
                        >»</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </TabsContent>
        {/* Tab: Recovery */}
        <TabsContent value="recovery">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Replay from R2 Storage</CardTitle>
              <p className="text-sm text-muted-foreground">
                Re-process encrypted backups from R2 into the database. Safe to run multiple times — uses ON CONFLICT upsert.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Table</label>
                <select
                  value={replayTable}
                  onChange={e => { setReplayTable(e.target.value); setReplayResult(null) }}
                  disabled={replayLoading}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6] disabled:opacity-50"
                >
                  {REPLAY_TABLES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {replayTable === 'telesales_calls' && (
                  <p className="text-xs text-muted-foreground">
                    Will scan both <code className="bg-muted px-1 rounded">telesales/</code> (CSV uploads) and <code className="bg-muted px-1 rounded">leads-activity/</code> (Apps Script)
                  </p>
                )}
              </div>

              <button
                onClick={startReplay}
                disabled={replayLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors disabled:opacity-50"
              >
                {replayLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {replayLoading ? 'Replaying…' : 'Start Replay'}
              </button>

              {replayResult && (
                <div className={cn(
                  'rounded-lg border p-4 space-y-2',
                  replayResult.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
                )}>
                  <div className="flex items-center gap-2">
                    {replayResult.ok
                      ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <p className="text-sm font-medium">
                      {replayResult.ok ? 'Replay complete' : 'Replay completed with errors'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded bg-white/60 border px-3 py-2 text-center">
                      <p className="text-xl font-bold tabular-nums">{replayResult.replayed_files}</p>
                      <p className="text-xs text-muted-foreground">Files replayed</p>
                    </div>
                    <div className="rounded bg-white/60 border px-3 py-2 text-center">
                      <p className="text-xl font-bold tabular-nums">{replayResult.inserted.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Rows upserted</p>
                    </div>
                  </div>
                  {(replayResult.errors?.length ?? 0) > 0 && (
                    <div className="space-y-1 pt-1 border-t border-dashed border-red-200">
                      {replayResult.errors!.map((e, i) => (
                        <p key={i} className="text-xs text-red-600 break-all">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
