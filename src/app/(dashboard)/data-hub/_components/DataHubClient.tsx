'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { columns, type UploadBatch } from './columns'
import {
  CheckCircle, XCircle, AlertCircle, Upload, FileText, Clock,
  RefreshCw, Hammer, ShoppingBag, Store, Users, Package, PhoneCall,
  Target, DollarSign, Award, FileSpreadsheet, Database, LayoutDashboard,
} from 'lucide-react'
import { FILE_TYPE_CONFIGS, validateHeaders } from '@/lib/upload-config'
import type { UploadFileType } from '@/lib/upload-config'
import { cn } from '@/lib/utils'
import { fmtBaht, fmt } from '@/lib/formatters'
import { useUploadQueue, MAX_CONCURRENT } from '@/context/UploadQueueContext'
import { useBuild } from '@/context/BuildContext'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SalesStatus {
  total_rows: number; total_sales: number
  earliest_date: string | null; latest_date: string | null; last_uploaded: string | null
}
interface HubData {
  status: {
    online_sales:  SalesStatus
    offline_sales: SalesStatus
    leads:         { total_rows: number; last_uploaded: string | null }
    products:      { total_rows: number; total_brands: number; last_uploaded: string | null }
    telesales:     { total_rows: number; total_agents: number; earliest_date: string | null; latest_date: string | null; last_uploaded: string | null }
    targets:       { total_rows: number; earliest_month: string | null; latest_month: string | null; total_target: number; last_uploaded: string | null }
    costs:         { total_rows: number; earliest_month: string | null; latest_month: string | null; last_uploaded: string | null }
    incentives:    { total_tiers: number; tiers: number[]; last_uploaded: string | null }
  }
  history: UploadBatch[]
  mart: {
    main: {
      row_count: number; min_date: string | null; max_date: string | null
      last_refreshed: string | null; avg_days_to_order: number | null
    }
    performance: {
      row_count: number; min_month: string | null; max_month: string | null; last_refreshed: string | null
    }
    recent_builds: {
      id: string; started_at: string; finished_at: string | null
      attribution_days: number | null; duration_ms: number | null
      status: string; row_counts: Record<string, number> | null; error_message: string | null
    }[]
  }
}

const FILE_TYPES = Object.entries(FILE_TYPE_CONFIGS) as [UploadFileType, typeof FILE_TYPE_CONFIGS[UploadFileType]][]

const FILE_TYPE_METADATA: Record<UploadFileType, { icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  online_sales:    { icon: ShoppingBag,    desc: 'Lazada, Shopee order sales transactions' },
  offline_sales:   { icon: Store,          desc: 'Offline store/direct sales transactions' },
  leads:           { icon: Users,          desc: 'Telesales leads assignment sheet' },
  products:        { icon: Package,        desc: 'Master product list & brand hierarchy' },
  telesales:       { icon: PhoneCall,      desc: 'Telesales call logs and outcomes' },
  targets:         { icon: Target,         desc: 'Sales, buying, and call targets' },
  costs:           { icon: DollarSign,     desc: 'Agent & supervisor monthly costs' },
  incentives:      { icon: Award,          desc: 'Incentive payouts per achievement tier' },
  agent_headcount: { icon: FileSpreadsheet, desc: 'FTE headcount per month' },
}

const MAX_FILE_MB = 50

// ── Helpers ───────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtMonth(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
function fmtUpload(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-xs font-semibold">
      <CheckCircle className="h-3.5 w-3.5" />Ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-gray-50 text-gray-500 border border-gray-200 px-3 py-1 rounded-full text-xs font-semibold">
      <Clock className="h-3.5 w-3.5 text-gray-400" />Empty
    </span>
  )
}

// ── Form state types ──────────────────────────────────────────────────────────
type Step = 'select' | 'validate' | 'preview'
interface PendingFile { id: string; file: File; valid: boolean; error?: string }

// ── Component ─────────────────────────────────────────────────────────────────
export function DataHubClient() {
  const { jobs, enqueueJob, dismissJob } = useUploadQueue()
  const { buildLoading, elapsedSeconds, buildResult, clearBuildResult, startBuild } = useBuild()

  // Form state
  const [fileType, setFileType]         = useState<UploadFileType>('online_sales')
  const [step, setStep]                 = useState<Step>('select')
  const [file, setFile]                 = useState<File | null>(null)
  const [headers, setHeaders]           = useState<string[]>([])
  const [extraColumns, setExtraColumns] = useState<string[]>([])
  const [preview, setPreview]           = useState<Record<string, string>[]>([])
  const [validError, setValidError]     = useState<string | null>(null)
  const [dragOver, setDragOver]         = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])

  // Build state
  const [attributionDays, setAttributionDays] = useState<number | 'custom'>(14)
  const [customDays, setCustomDays]           = useState('')
  const effectiveDays = attributionDays === 'custom' ? Number(customDays) || 14 : attributionDays

  const inputRef = useRef<HTMLInputElement>(null)

  const { data: hub, mutate, isValidating } = useSWR<HubData>(
    '/api/data/hub',
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  )
  const status  = hub?.status
  const batches = hub?.history
  const mart    = hub?.mart

  // ── File processing ───────────────────────────────────────────────────────
  const reset = () => {
    setStep('select'); setFile(null); setHeaders([])
    setExtraColumns([]); setPreview([]); setValidError(null)
    setPendingFiles([])
  }
  const onTypeChange = (t: UploadFileType) => { setFileType(t); reset() }

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

  const validateFiles = useCallback((files: File[]) => {
    setPendingFiles([])
    let resolved = 0
    const results: PendingFile[] = files.map(f => ({ id: crypto.randomUUID(), file: f, valid: false }))
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

  const confirmPendingUpload = useCallback(() => {
    pendingFiles.filter(p => p.valid).forEach(p => {
      enqueueJob({ id: p.id, fileType, file: p.file, label: FILE_TYPE_CONFIGS[fileType].label })
    })
    setPendingFiles([])
  }, [pendingFiles, fileType, enqueueJob])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'))
    if (!files.length) return
    files.length === 1 ? processFile(files[0]) : (reset(), validateFiles(files))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processFile, validateFiles])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    files.length === 1 ? processFile(files[0]) : (reset(), validateFiles(files))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processFile, validateFiles])

  const doUpload = () => {
    if (!file) return
    enqueueJob({ id: crypto.randomUUID(), fileType, file, label: FILE_TYPE_CONFIGS[fileType].label })
    reset()
  }

  const cfg = FILE_TYPE_CONFIGS[fileType]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Upload Card ──────────────────────────────────────────────────────── */}
      <Card className="shadow-sm border-gray-100">
        <CardHeader className="pb-4 border-b border-gray-50 bg-gray-50/20">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[#003DA6]" />
            <CardTitle className="text-base font-semibold">Upload Raw CSV Data</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">

          {/* Step 1: File Type */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold">1. Select File Type</label>
              <p className="text-xs text-muted-foreground mt-0.5">Match the dataset type to its validation schema.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onTypeChange('online_sales')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-bold transition-all outline-none select-none',
                  fileType === 'online_sales'
                    ? 'border-[#0F0E9A] bg-[#0F0E9A]/5 text-[#0F0E9A] ring-1 ring-[#0F0E9A]'
                    : 'border-gray-200 bg-background hover:border-gray-300 hover:bg-gray-50/50 text-muted-foreground',
                )}
              >
                <ShoppingBag className="h-4 w-4 shrink-0 text-[#0F0E9A]" />
                Online Sales
              </button>
              <button
                type="button"
                onClick={() => onTypeChange('offline_sales')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-bold transition-all outline-none select-none',
                  fileType === 'offline_sales'
                    ? 'border-purple-600 bg-purple-50 text-purple-700 ring-1 ring-purple-600'
                    : 'border-gray-200 bg-background hover:border-gray-300 hover:bg-gray-50/50 text-muted-foreground',
                )}
              >
                <Store className="h-4 w-4 shrink-0 text-purple-600" />
                Offline Sales
              </button>
              <div className="flex-1 relative">
                <select
                  value={['online_sales', 'offline_sales'].includes(fileType) ? '' : fileType}
                  onChange={(e) => { if (e.target.value) onTypeChange(e.target.value as UploadFileType) }}
                  className={cn(
                    'w-full pl-4 pr-10 py-2.5 rounded-lg border text-xs font-bold transition-all outline-none appearance-none cursor-pointer text-center',
                    !['online_sales', 'offline_sales'].includes(fileType)
                      ? 'border-[#003DA6] bg-[#003DA6]/5 text-[#003DA6] ring-1 ring-[#003DA6]'
                      : 'border-gray-200 bg-background hover:border-gray-300 hover:bg-gray-50/50 text-muted-foreground',
                  )}
                >
                  <option value="" disabled>Other Datasets…</option>
                  {FILE_TYPES.filter(([t]) => t !== 'online_sales' && t !== 'offline_sales').map(([t, c]) => (
                    <option key={t} value={t}>{c.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 opacity-60" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
            {FILE_TYPE_METADATA[fileType]?.desc && (
              <p className="text-[10px] text-muted-foreground/80 font-medium flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#003DA6]" />
                Schema: <strong className="text-foreground">{FILE_TYPE_METADATA[fileType].desc}</strong>
              </p>
            )}
          </div>

          {/* Step 2: Drop Zone */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">2. Drop or Browse CSV File</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                dragOver
                  ? 'border-[#003DA6] bg-blue-50/70 scale-[0.99] shadow-inner'
                  : 'border-gray-200 bg-muted/20 hover:border-gray-300 hover:bg-muted/40 hover:shadow-sm',
                step !== 'select' && 'border-solid border-gray-200 bg-background',
              )}
            >
              <input ref={inputRef} type="file" accept=".csv" multiple className="hidden" onChange={onFileInput} />
              {!file ? (
                <div className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#003DA6]">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Drag and drop files here, or{' '}
                      <span className="text-[#003DA6] font-bold">click to browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">CSV files only · Max {MAX_FILE_MB} MB per file</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gray-100 text-[10px] text-muted-foreground font-medium">
                    Supports uploading multiple files (up to {MAX_CONCURRENT} concurrently)
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-4 py-2">
                  <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#003DA6]">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Validation error */}
          {step === 'validate' && validError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Invalid Headers Detected</p>
                <p className="text-sm text-red-600 mt-0.5">{validError}</p>
                <button onClick={reset} className="text-xs underline text-red-500 font-medium mt-2 block">
                  Choose another file
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {step === 'preview' && preview.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm font-semibold text-green-700">Valid Headers — Preview of first row</p>
                {extraColumns.length > 0 && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {extraColumns.length} extra columns will be stored but ignored by ETL
                  </span>
                )}
              </div>
              <div className="rounded-xl border border-gray-100 overflow-x-auto max-h-52 shadow-inner bg-gray-50/30">
                <table className="text-xs min-w-max w-full">
                  <thead className="bg-gray-100/80 sticky top-0 border-b">
                    <tr>
                      {headers.map(h => {
                        const isExtra = extraColumns.includes(h)
                        return (
                          <th key={h} className={cn(
                            'px-4 py-2.5 text-left font-semibold whitespace-nowrap',
                            isExtra ? 'text-gray-400 bg-gray-200/20' : 'text-muted-foreground',
                          )}>
                            {h}
                            {isExtra && <span className="ml-1 text-[9px] font-normal">(ignored)</span>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {headers.map(h => {
                          const isExtra = extraColumns.includes(h)
                          return (
                            <td key={h} className={cn(
                              'px-4 py-2 whitespace-nowrap max-w-[180px] truncate',
                              isExtra ? 'text-gray-400 bg-gray-200/10' : 'text-foreground',
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
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                <span>
                  Storage: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px]">
                    {cfg.storageFolder}/{'<timestamp>'}_{cfg.storageFilename}.csv
                  </code>
                </span>
                <span>
                  Target table: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px]">{cfg.table}</code>
                </span>
              </div>
            </div>
          )}

          {/* Single-file action buttons */}
          {step === 'preview' && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={doUpload}
                className="px-5 py-2 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors shadow-sm"
              >
                Confirm Upload
              </button>
              <button onClick={reset} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* Multi-file batch list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{pendingFiles.length} files selected</p>
                <div className="flex gap-2">
                  {pendingFiles.some(p => p.valid) && (
                    <button
                      onClick={confirmPendingUpload}
                      className="px-4 py-1.5 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors shadow-sm"
                    >
                      Upload {pendingFiles.filter(p => p.valid).length} Valid File{pendingFiles.filter(p => p.valid).length !== 1 ? 's' : ''}
                    </button>
                  )}
                  <button onClick={() => setPendingFiles([])} className="px-3 py-1.5 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-colors">
                    Clear
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden shadow-sm">
                {pendingFiles.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50/50">
                    {p.valid
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.file.name}</p>
                      {p.error && <p className="text-xs text-red-500 font-medium mt-0.5">{p.error}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {(p.file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Upload Jobs Progress ──────────────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="space-y-3 bg-gray-50/50 border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Upload Ingestion</h3>
            {jobs.length > 2 && (
              <span className="text-[10px] bg-gray-100 text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                {jobs.length} files in queue
              </span>
            )}
          </div>
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {jobs.map(job => {
              const isUploading = job.status === 'uploading'
              const isQueued    = job.status === 'queued'
              const isDone      = job.status === 'done'
              return (
                <div key={job.id} className={cn(
                  'rounded-xl border p-4 space-y-3 shadow-sm',
                  isUploading || isQueued ? 'border-blue-100 bg-blue-50/20'
                    : isDone ? 'border-green-100 bg-green-50/30'
                    : 'border-red-100 bg-red-50/30',
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 h-9 w-9 rounded-lg bg-white border flex items-center justify-center shadow-sm">
                        <FileText className="h-4 w-4 text-[#003DA6]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{job.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.label} · {(job.file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isQueued && <Badge variant="secondary" className="text-xs">Queued</Badge>}
                      {(isDone || job.status === 'failed') && (
                        <button onClick={() => dismissJob(job.id)} className="text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-gray-100">
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {isQueued    ? 'Waiting for slot…'
                         : isUploading ? 'Uploading to storage & executing ETL…'
                         : isDone && job.result
                           ? `${job.result.row_count?.toLocaleString()} rows imported${(job.result.error_count ?? 0) > 0 ? `, ${job.result.error_count?.toLocaleString()} skipped` : ''}`
                           : job.result?.error ?? 'Upload failed'}
                      </span>
                      <span className={cn(
                        'text-xs font-bold tabular-nums',
                        isUploading || isQueued ? 'text-[#003DA6]'
                          : isDone ? 'text-green-600' : 'text-red-600',
                      )}>
                        {isQueued ? '—' : isUploading ? `${job.progress}%` : isDone ? '100%' : '—'}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
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
                  {(isDone || job.status === 'failed') && (job.result?.errors?.length ?? 0) > 0 && (() => {
                    const groups: Record<string, number> = {}
                    for (const e of job.result!.errors!) {
                      const key = e.replace(/^Row \d+: /, '')
                      groups[key] = (groups[key] ?? 0) + 1
                    }
                    return (
                      <div className="pt-2 space-y-1 border-t border-dashed border-gray-200">
                        {Object.entries(groups).map(([msg, count]) => (
                          <div key={msg} className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50/50 border border-amber-100 rounded-lg px-2.5 py-1">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            {count > 1 ? `${count} rows` : '1 row'}: {msg}
                          </div>
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

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="gap-4">
        <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-gray-100 pb-2">
          <TabsList className="bg-gray-100/80 p-1 rounded-xl shrink-0">
            {[
              { value: 'overview', icon: LayoutDashboard, label: 'Overview' },
              { value: 'status',   icon: Database,        label: 'Data Status' },
              { value: 'history',  icon: Clock,           label: 'History' },
              { value: 'build',    icon: Hammer,          label: 'Build Mart' },
            ].map(({ value, icon: Icon, label }) => (
              <TabsTrigger key={value} value={value} className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-[#003DA6] data-[state=active]:shadow-sm transition-all">
                <Icon className="h-3.5 w-3.5" />{label}
              </TabsTrigger>
            ))}
          </TabsList>
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-muted-foreground hover:bg-gray-50 hover:text-foreground active:scale-95 transition-all shadow-sm disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isValidating && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4">
          {isValidating && !status ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-white space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Online Sales */}
                <div className="border border-gray-100 shadow-sm rounded-lg p-3 bg-white hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-[#0F0E9A]" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Online Sales</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{status ? `${fmt(status.online_sales.total_rows)} rows` : '—'}</span>
                  </div>
                  <p className="text-lg font-black text-[#0F0E9A] tabular-nums">{status ? fmtBaht(status.online_sales.total_sales) : '—'}</p>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Range</span>
                    <span className="font-semibold text-foreground">{status?.online_sales.total_rows ? `${fmtDate(status.online_sales.earliest_date)} – ${fmtDate(status.online_sales.latest_date)}` : '—'}</span>
                  </div>
                </div>

                {/* Offline Sales */}
                <div className="border border-gray-100 shadow-sm rounded-lg p-3 bg-white hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-purple-600" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Offline Sales</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{status ? `${fmt(status.offline_sales.total_rows)} rows` : '—'}</span>
                  </div>
                  <p className="text-lg font-black text-purple-700 tabular-nums">{status ? fmtBaht(status.offline_sales.total_sales) : '—'}</p>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Range</span>
                    <span className="font-semibold text-foreground">{status?.offline_sales.total_rows ? `${fmtDate(status.offline_sales.earliest_date)} – ${fmtDate(status.offline_sales.latest_date)}` : '—'}</span>
                  </div>
                </div>

                {/* Telesales */}
                <div className="border border-gray-100 shadow-sm rounded-lg p-3 bg-white hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <PhoneCall className="h-3.5 w-3.5 text-[#003DA6]" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Telesales</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{status ? `${fmt(status.telesales.total_rows)} calls` : '—'}</span>
                  </div>
                  <p className="text-lg font-black text-[#003DA6] tabular-nums">{status ? fmt(status.telesales.total_rows) : '—'}<span className="text-xs font-normal text-muted-foreground ml-1">calls</span></p>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Agents</span>
                    <span className="font-semibold text-foreground">{status?.telesales.total_agents ? `${fmt(status.telesales.total_agents)} active` : '—'}</span>
                  </div>
                </div>

                {/* Target & SKUs */}
                <div className="border border-gray-100 shadow-sm rounded-lg p-3 bg-white hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-indigo-600" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Target & SKUs</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{status ? `${fmt(status.products.total_rows)} SKUs` : '—'}</span>
                  </div>
                  <p className="text-lg font-black text-indigo-600 tabular-nums">{status ? fmtBaht(status.targets.total_target) : '—'}</p>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Brands</span>
                    <span className="font-semibold text-foreground">{status?.products.total_brands ? `${fmt(status.products.total_brands)} brands` : '—'}</span>
                  </div>
                </div>
              </div>

              {/* Combined banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 border border-gray-100 shadow-sm rounded-lg p-3 bg-white">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-gray-50 pb-1.5 mb-2">Combined Performance Overview</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold">Total Combined Sales</p>
                      <p className="text-xl font-extrabold text-[#003DA6] tabular-nums mt-0.5">
                        {status ? fmtBaht(status.online_sales.total_sales + status.offline_sales.total_sales) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold">Total Aggregated Orders</p>
                      <p className="text-xl font-extrabold tabular-nums mt-0.5">
                        {status ? fmt(status.online_sales.total_rows + status.offline_sales.total_rows) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border border-gray-100 shadow-sm rounded-lg p-3 bg-white">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-gray-50 pb-1.5 mb-2">ETL Upload Status</p>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: 'Files',   value: batches?.length ?? 0,                                    color: 'text-foreground' },
                      { label: 'Success', value: batches?.filter(b => b.status === 'success').length ?? 0, color: 'text-green-600' },
                      { label: 'Partial', value: batches?.filter(b => b.status === 'partial').length ?? 0, color: 'text-amber-600' },
                      { label: 'Failed',  value: batches?.filter(b => b.status === 'failed').length ?? 0,  color: 'text-red-600'   },
                    ].map(item => (
                      <div key={item.label} className="text-center">
                        <p className={cn('text-base font-extrabold tabular-nums leading-tight', item.color)}>{item.value}</p>
                        <p className="text-[9px] font-bold text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Data Status ──────────────────────────────────────────────────── */}
        <TabsContent value="status" className="mt-4">
          {isValidating && !status ? (
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-5 py-4 grid grid-cols-6 gap-4 border-b border-gray-100 items-center">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-12 ml-auto" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-20 mx-auto rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-muted-foreground">
                      {['Table', 'Rows', 'Key Metrics', 'Date Range', 'Last Uploaded', 'Status'].map(h => (
                        <th key={h} className={cn('px-5 py-3.5 text-xs font-bold uppercase tracking-wider', h === 'Rows' || h === 'Status' ? 'text-center' : 'text-left')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      {
                        icon: <ShoppingBag className="h-4 w-4 text-[#0F0E9A]" />,
                        bg: 'bg-[#0F0E9A]/10 text-[#0F0E9A]',
                        name: 'Online Sales', table: 'online_sales',
                        rows: status?.online_sales.total_rows ?? 0,
                        metric: status ? `${fmtBaht(status.online_sales.total_sales)} total` : '—',
                        range: status?.online_sales.total_rows ? `${fmtDate(status.online_sales.earliest_date)} – ${fmtDate(status.online_sales.latest_date)}` : '—',
                        lastUp: status?.online_sales.last_uploaded ?? null,
                        ok: (status?.online_sales.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <Store className="h-4 w-4 text-purple-600" />,
                        bg: 'bg-purple-50 text-purple-600',
                        name: 'Offline Sales', table: 'offline_sales',
                        rows: status?.offline_sales.total_rows ?? 0,
                        metric: status ? `${fmtBaht(status.offline_sales.total_sales)} total` : '—',
                        range: status?.offline_sales.total_rows ? `${fmtDate(status.offline_sales.earliest_date)} – ${fmtDate(status.offline_sales.latest_date)}` : '—',
                        lastUp: status?.offline_sales.last_uploaded ?? null,
                        ok: (status?.offline_sales.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <Users className="h-4 w-4 text-[#003DA6]" />,
                        bg: 'bg-[#003DA6]/10 text-[#003DA6]',
                        name: 'Leads', table: 'leads',
                        rows: status?.leads.total_rows ?? 0,
                        metric: '—',
                        range: '—',
                        lastUp: status?.leads.last_uploaded ?? null,
                        ok: (status?.leads.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <Package className="h-4 w-4 text-indigo-600" />,
                        bg: 'bg-indigo-50 text-indigo-600',
                        name: 'Products', table: 'products',
                        rows: status?.products.total_rows ?? 0,
                        metric: status ? `${fmt(status.products.total_brands)} brands` : '—',
                        range: '—',
                        lastUp: status?.products.last_uploaded ?? null,
                        ok: (status?.products.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <PhoneCall className="h-4 w-4 text-[#003DA6]" />,
                        bg: 'bg-[#003DA6]/10 text-[#003DA6]',
                        name: 'Telesales Calls', table: 'telesales_calls',
                        rows: status?.telesales.total_rows ?? 0,
                        metric: status ? `${fmt(status.telesales.total_agents)} agents` : '—',
                        range: status?.telesales.total_rows ? `${fmtDate(status.telesales.earliest_date)} – ${fmtDate(status.telesales.latest_date)}` : '—',
                        lastUp: status?.telesales.last_uploaded ?? null,
                        ok: (status?.telesales.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <Target className="h-4 w-4 text-purple-600" />,
                        bg: 'bg-purple-50 text-purple-600',
                        name: 'Sales Targets', table: 'targets',
                        rows: status?.targets.total_rows ?? 0,
                        metric: status ? `${fmtBaht(status.targets.total_target)} total` : '—',
                        range: status?.targets.total_rows ? `${fmtMonth(status.targets.earliest_month)} – ${fmtMonth(status.targets.latest_month)}` : '—',
                        lastUp: status?.targets.last_uploaded ?? null,
                        ok: (status?.targets.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <DollarSign className="h-4 w-4 text-rose-600" />,
                        bg: 'bg-rose-50 text-rose-600',
                        name: 'Marketing Costs', table: 'costs',
                        rows: status?.costs.total_rows ?? 0,
                        metric: '—',
                        range: status?.costs.total_rows ? `${fmtMonth(status.costs.earliest_month)} – ${fmtMonth(status.costs.latest_month)}` : '—',
                        lastUp: status?.costs.last_uploaded ?? null,
                        ok: (status?.costs.total_rows ?? 0) > 0,
                      },
                      {
                        icon: <Award className="h-4 w-4 text-amber-600" />,
                        bg: 'bg-amber-50 text-amber-600',
                        name: 'Incentive Rules', table: 'incentives',
                        rows: status?.incentives.total_tiers ?? 0,
                        metric: status?.incentives.tiers.length ? status.incentives.tiers.map(t => `${(t * 100).toFixed(0)}%`).join(', ') : '—',
                        range: '—',
                        lastUp: status?.incentives.last_uploaded ?? null,
                        ok: (status?.incentives.total_tiers ?? 0) > 0,
                      },
                    ].map(row => (
                      <tr key={row.table} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm', row.bg)}>
                              {row.icon}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{row.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{row.table}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-bold text-sm">{fmt(row.rows)}</td>
                        <td className="px-5 py-4 text-xs font-semibold">{row.metric}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{row.range}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{fmtUpload(row.lastUp)}</td>
                        <td className="px-5 py-4"><div className="flex justify-center"><StatusBadge ok={row.ok} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── History ──────────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          {isValidating && !batches ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !batches?.length ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center bg-white shadow-sm">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/60 mb-3" />
              <p className="text-foreground font-semibold text-sm">No upload history found</p>
              <p className="text-muted-foreground text-xs mt-1">Upload CSV files above to populate the ETL log.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm p-1">
              <DataTable columns={columns} data={batches} searchKey="filename" />
            </div>
          )}
        </TabsContent>

        {/* ── Build Mart ───────────────────────────────────────────────────── */}
        <TabsContent value="build" className="space-y-4 mt-4">
          {/* Mart Status */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader className="pb-3 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#003DA6]" />
                  <CardTitle className="text-sm font-semibold">Current Mart Status</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isValidating && !mart ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[0, 1].map(i => (
                    <div key={i} className="rounded-xl border p-4 space-y-3">
                      <Skeleton className="h-3 w-32" /><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* sales_hoc_orders */}
                  <div className={cn(
                    'rounded-xl border p-4 space-y-2 hover:shadow-sm transition-all',
                    (mart?.main.row_count ?? 0) > 0 ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-gray-50/50',
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">sales_hoc_orders</span>
                      <span className={cn('h-2 w-2 rounded-full', (mart?.main.row_count ?? 0) > 0 ? 'bg-green-500' : 'bg-gray-300')} />
                    </div>
                    <p className="text-3xl font-extrabold tracking-tight tabular-nums">
                      {fmt(mart?.main.row_count ?? 0)}<span className="text-sm font-normal text-muted-foreground ml-1.5">rows</span>
                    </p>
                    <div className="pt-2 border-t border-dashed border-gray-200/50 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Order Range</span>
                        <span className="font-semibold text-foreground">
                          {mart?.main.min_date && mart?.main.max_date ? `${fmtDate(mart.main.min_date)} – ${fmtDate(mart.main.max_date)}` : '—'}
                        </span>
                      </div>
                      {mart?.main.avg_days_to_order != null && (
                        <div className="flex justify-between">
                          <span>Avg Order Delay</span>
                          <span className="font-semibold text-foreground">{mart.main.avg_days_to_order} days</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Last Refreshed</span>
                        <span className="font-semibold text-foreground">{fmtUpload(mart?.main.last_refreshed ?? null)}</span>
                      </div>
                    </div>
                  </div>

                  {/* mart_performance_cmg */}
                  <div className={cn(
                    'rounded-xl border p-4 space-y-2 hover:shadow-sm transition-all',
                    (mart?.performance.row_count ?? 0) > 0 ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-gray-50/50',
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">mart_performance_cmg</span>
                      <span className={cn('h-2 w-2 rounded-full', (mart?.performance.row_count ?? 0) > 0 ? 'bg-green-500' : 'bg-gray-300')} />
                    </div>
                    <p className="text-3xl font-extrabold tracking-tight tabular-nums">
                      {fmt(mart?.performance.row_count ?? 0)}<span className="text-sm font-normal text-muted-foreground ml-1.5">rows</span>
                    </p>
                    <div className="pt-2 border-t border-dashed border-gray-200/50 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Month Range</span>
                        <span className="font-semibold text-foreground">
                          {mart?.performance.min_month && mart?.performance.max_month ? `${fmtMonth(mart.performance.min_month)} – ${fmtMonth(mart.performance.max_month)}` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Refreshed</span>
                        <span className="font-semibold text-foreground">{fmtUpload(mart?.performance.last_refreshed ?? null)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent builds */}
              {(mart?.recent_builds?.length ?? 0) > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Builds</p>
                  <div className="space-y-1.5">
                    {mart!.recent_builds.map(b => (
                      <div key={b.id} className={cn(
                        'flex items-center justify-between gap-4 rounded-lg border px-4 py-2.5 text-xs',
                        b.status === 'success' ? 'border-green-100 bg-green-50/30'
                          : b.status === 'failed' ? 'border-red-100 bg-red-50/30'
                          : 'border-gray-100 bg-gray-50/30',
                      )}>
                        <div className="flex items-center gap-2">
                          {b.status === 'success'
                            ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            : b.status === 'failed'
                            ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            : <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                          <span className="text-muted-foreground">{fmtUpload(b.started_at)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          {b.attribution_days && <span>{b.attribution_days}d attribution</span>}
                          {b.duration_ms && <span>{(b.duration_ms / 1000).toFixed(1)}s</span>}
                          {b.row_counts && (
                            <span className="font-semibold text-foreground">
                              {fmt(b.row_counts.mart_main ?? 0)} rows
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Build Card */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader className="pb-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Hammer className="h-5 w-5 text-[#003DA6]" />
                <CardTitle className="text-base font-semibold">Build Analytical Models</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Recompute{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px]">sales_hoc_orders</code>{' '}
                and{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px]">mart_performance_cmg</code>{' '}
                from your uploaded raw CSVs.
              </p>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold">Attribution Window</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Days after a call during which a purchase is counted as telesales-driven.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([14, 30, 90] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => { setAttributionDays(d); clearBuildResult() }}
                      disabled={buildLoading}
                      className={cn(
                        'px-4 py-2 text-sm font-medium rounded-lg border transition-all disabled:opacity-50 shadow-sm',
                        attributionDays === d
                          ? 'bg-[#003DA6] text-white border-[#003DA6]'
                          : 'bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground',
                      )}
                    >
                      {d} days{d === 14 ? ' (default)' : ''}
                    </button>
                  ))}
                  <button
                    onClick={() => { setAttributionDays('custom'); clearBuildResult() }}
                    disabled={buildLoading}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-lg border transition-all disabled:opacity-50 shadow-sm',
                      attributionDays === 'custom'
                        ? 'bg-[#003DA6] text-white border-[#003DA6]'
                        : 'bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground',
                    )}
                  >
                    Custom
                  </button>
                </div>
                {attributionDays === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} max={365}
                      value={customDays} onChange={e => setCustomDays(e.target.value)}
                      placeholder="e.g. 60" disabled={buildLoading}
                      className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6] disabled:opacity-50 bg-white"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                )}
                <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                  A purchase within <strong>{effectiveDays} day{effectiveDays !== 1 ? 's' : ''}</strong> after the first connected call will be attributed to telesales.
                </div>
              </div>

              <button
                onClick={() => startBuild(effectiveDays)}
                disabled={buildLoading || (attributionDays === 'custom' && !customDays)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#003DA6] text-white text-sm font-semibold hover:bg-[#002d80] transition-colors shadow-sm disabled:opacity-50"
              >
                {buildLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
                {buildLoading ? 'Building Mart Models…' : 'Build Tables'}
              </button>

              {buildLoading && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-700 font-medium">Triggering GitHub Actions…</p>
                    <p className="text-xs text-blue-500 mt-0.5">Sending build request to GitHub</p>
                  </div>
                </div>
              )}

              {buildResult && (
                <div className={cn(
                  'rounded-xl border p-4 space-y-3 shadow-sm',
                  buildResult.ok ? 'border-green-200 bg-green-50/55' : 'border-red-200 bg-red-50/55',
                )}>
                  <div className="flex items-center gap-2">
                    {buildResult.ok
                      ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <p className="text-sm font-semibold">
                      {buildResult.ok && buildResult.triggered
                        ? `Build triggered — ${buildResult.attribution_days}-day attribution window`
                        : buildResult.ok
                        ? `Build complete — ${buildResult.attribution_days}-day window applied`
                        : 'Build failed'}
                    </p>
                  </div>
                  {buildResult.ok && buildResult.triggered && (
                    <p className="text-xs text-green-700">
                      GitHub Actions is now running the build (≈2–5 min). Refresh this page after it completes to see updated mart stats.
                    </p>
                  )}
                  {buildResult.ok && buildResult.rows && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="rounded-xl bg-white border border-green-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-black text-green-700 tabular-nums">{buildResult.rows.mart_main.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground font-medium">sales_hoc_orders rows</p>
                      </div>
                      <div className="rounded-xl bg-white border border-green-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-black text-green-700 tabular-nums">{buildResult.rows.performance.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground font-medium">mart_performance rows</p>
                      </div>
                    </div>
                  )}
                  {buildResult.error && <p className="text-sm text-red-600 font-medium">{buildResult.error}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
