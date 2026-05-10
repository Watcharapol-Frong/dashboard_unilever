'use client'
import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertCircle, Upload, FileText, Clock, RefreshCw } from 'lucide-react'
import { FILE_TYPE_CONFIGS, validateHeaders } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'
import { cn, formatTHB, formatNumber } from '@/lib/utils'

const FILE_TYPES = Object.entries(FILE_TYPE_CONFIGS) as [UploadFileType, typeof FILE_TYPE_CONFIGS[UploadFileType]][]

// ── Data Status types ──────────────────────────────────────
interface DataStatus {
  order_sales: { total_rows: number; online_rows: number; offline_rows: number; total_sales: number; online_sales: number; offline_sales: number; earliest_date: string | null; latest_date: string | null; last_uploaded: string | null }
  leads:       { total_rows: number; last_uploaded: string | null }
  products:    { total_rows: number; total_brands: number; last_uploaded: string | null }
  telesales:   { total_rows: number; total_agents: number; earliest_date: string | null; latest_date: string | null; last_uploaded: string | null }
  targets:     { total_rows: number; earliest_month: string | null; latest_month: string | null; total_target: number; last_uploaded: string | null }
  costs:       { total_rows: number; earliest_month: string | null; latest_month: string | null; last_uploaded: string | null }
  incentives:  { total_tiers: number; tiers: number[]; last_uploaded: string | null }
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtMonth(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
}
function fmtUpload(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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
  return <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีข้อมูล</p>
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
            อัปเดตล่าสุด: {lastUploaded}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

type Step = 'select' | 'validate' | 'preview' | 'uploading' | 'done'

interface UploadBatch {
  id: string; table_name: string; filename: string | null
  row_count: number | null; error_count: number; status: string; uploaded_at: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function UploadPage() {
  const [fileType, setFileType]         = useState<UploadFileType>('online_sales')
  const [step, setStep]                 = useState<Step>('select')
  const [file, setFile]                 = useState<File | null>(null)
  const [headers, setHeaders]           = useState<string[]>([])
  const [extraColumns, setExtraColumns] = useState<string[]>([])
  const [preview, setPreview]           = useState<Record<string, string>[]>([])
  const [validError, setValidError]     = useState<string | null>(null)
  const [result, setResult]             = useState<{ ok: boolean; row_count?: number; error_count?: number; errors?: string[]; error?: string; extra_columns?: string[] } | null>(null)
  const [dragOver, setDragOver]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: batches, mutate } = useSWR<UploadBatch[]>('/api/upload/history', fetcher)
  const { data: status, mutate: mutateStatus, isLoading: statusLoading } = useSWR<DataStatus>('/api/upload/status', fetcher)

  const processFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setValidError(null)

    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      preview: 6,
      transformHeader: (h) => h.trim(),
      complete: ({ data }) => {
        if (!data.length) { setValidError('ไฟล์ว่างเปล่า'); setStep('validate'); return }
        const hdrs = Object.keys(data[0])
        setHeaders(hdrs)
        const { ok, error, extraColumns: extras } = validateHeaders(hdrs, fileType)
        setValidError(ok ? null : (error ?? null))
        setExtraColumns(ok ? extras : [])
        setPreview(data.slice(0, 5))
        setStep(ok ? 'preview' : 'validate')
      },
      error: () => { setValidError('ไม่สามารถอ่านไฟล์ได้'); setStep('validate') },
    })
  }, [fileType])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) processFile(f)
  }, [processFile])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
    e.target.value = ''
  }, [processFile])

  const reset = () => {
    setStep('select'); setFile(null); setHeaders([])
    setExtraColumns([]); setPreview([]); setValidError(null); setResult(null)
  }

  const onTypeChange = (t: UploadFileType) => {
    setFileType(t); reset()
  }

  const doUpload = async () => {
    if (!file) return
    setStep('uploading')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/upload/${fileType}`, { method: 'POST', body: form })
      const json = await res.json()
      setResult(json)
      setStep('done')
      mutate()
      mutateStatus()
    } catch {
      setResult({ ok: false, error: 'Network error' })
      setStep('done')
    }
  }

  const cfg = FILE_TYPE_CONFIGS[fileType]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          อัปโหลด CSV — ระบบตรวจสอบ header อัตโนมัติก่อน import เข้า database
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Upload CSV</CardTitle></CardHeader>
        <CardContent className="space-y-5">

          {/* Step 1: File Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">File Type</label>
            <div className="flex flex-wrap gap-2">
              {(['online_sales', 'offline_sales', 'telesales'] as UploadFileType[]).map(type => {
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
                value={['online_sales', 'offline_sales', 'telesales'].includes(fileType) ? "" : fileType}
                onChange={e => {
                  if (e.target.value) onTypeChange(e.target.value as UploadFileType)
                }}
                className={cn(
                  "border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none transition-all cursor-pointer",
                  !['online_sales', 'offline_sales', 'telesales'].includes(fileType)
                    ? "bg-[#003DA6] text-white border-[#003DA6] shadow-sm ring-2 ring-[#003DA6] ring-offset-1"
                    : "bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground"
                )}
              >
                <option value="" disabled className="text-muted-foreground bg-background">ประเภทอื่นๆ...</option>
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
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileInput} />
            {!file ? (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium">วางไฟล์ที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
                <p className="text-xs text-muted-foreground mt-1">รองรับเฉพาะไฟล์ .csv</p>
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
                <p className="text-sm font-semibold text-red-700">Header ไม่ตรง</p>
                <p className="text-sm text-red-600 mt-0.5">{validError}</p>
                <button onClick={reset} className="text-xs underline text-red-500 mt-2">เลือกไฟล์ใหม่</button>
              </div>
            </div>
          )}

          {/* Preview table */}
          {(step === 'preview' || step === 'uploading') && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm font-medium text-green-700">Header ถูกต้อง — ตัวอย่าง 5 แถวแรก</p>
                {extraColumns.length > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {extraColumns.length} column นอก schema — เก็บใน Storage แต่ไม่ import ลง DB
                  </span>
                )}
              </div>
              <div className="rounded-lg border overflow-auto max-h-52">
                <table className="text-xs w-full">
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
                              'px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate',
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

          {/* Upload result */}
          {step === 'done' && result && (
            <div className={cn(
              'rounded-lg border p-4',
              result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
            )}>
              <div className="flex items-center gap-2 mb-1">
                {result.ok
                  ? <CheckCircle className="h-5 w-5 text-green-500" />
                  : <XCircle className="h-5 w-5 text-red-500" />}
                <p className={cn('text-sm font-semibold', result.ok ? 'text-green-700' : 'text-red-700')}>
                  {result.ok ? 'Upload สำเร็จ' : 'Upload ล้มเหลว'}
                </p>
              </div>
              {result.ok && (
                <p className="text-sm text-green-600">
                  {result.row_count} rows imported
                  {(result.error_count ?? 0) > 0 && `, ${result.error_count} rows skipped`}
                </p>
              )}
              {!result.ok && <p className="text-sm text-red-600">{result.error}</p>}
              {(result.errors?.length ?? 0) > 0 && (
                <div className="mt-2 text-xs text-amber-700 space-y-0.5">
                  {result.errors!.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <button onClick={reset} className="text-xs underline mt-3 text-muted-foreground">Upload ไฟล์ใหม่</button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {step === 'preview' && (
              <>
                <button
                  onClick={doUpload}
                  className="px-5 py-2 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors"
                >
                  ยืนยัน Upload
                </button>
                <button onClick={reset} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">
                  ยกเลิก
                </button>
              </>
            )}
            {step === 'uploading' && (
              <button disabled className="px-5 py-2 rounded-lg bg-[#003DA6]/60 text-white text-sm font-medium cursor-not-allowed flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                กำลัง Upload...
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">สถานะข้อมูลปัจจุบัน</h2>
            <p className="text-xs text-muted-foreground">ข้อมูลที่อยู่ใน database ขณะนี้</p>
          </div>
          <button
            onClick={() => mutateStatus()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', statusLoading && 'animate-spin')} />
            รีเฟรช
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Online Sales */}
          <StatusCard
            title="Online Sales"
            badge={status ? formatNumber(status.order_sales.online_rows) + ' rows' : undefined}
            lastUploaded={fmtUpload(status?.order_sales.last_uploaded ?? null)}
            empty={!status || status.order_sales.online_rows === 0}
          >
            <StatusRow label="Order ล่าสุด" value={fmtDate(status?.order_sales.latest_date ?? null)} />
            <StatusRow label="Order เก่าสุด" value={fmtDate(status?.order_sales.earliest_date ?? null)} />
            <StatusRow label="ยอดรวม" value={<span className="text-[#003DA6]">{formatTHB(status?.order_sales.online_sales ?? 0)}</span>} />
          </StatusCard>

          {/* Offline Sales */}
          <StatusCard
            title="Offline Sales"
            badge={status ? formatNumber(status.order_sales.offline_rows) + ' rows' : undefined}
            lastUploaded={fmtUpload(status?.order_sales.last_uploaded ?? null)}
            empty={!status || status.order_sales.offline_rows === 0}
          >
            <StatusRow label="Order ล่าสุด" value={fmtDate(status?.order_sales.latest_date ?? null)} />
            <StatusRow label="Order เก่าสุด" value={fmtDate(status?.order_sales.earliest_date ?? null)} />
            <StatusRow label="ยอดรวม" value={<span className="text-[#EE2737]">{formatTHB(status?.order_sales.offline_sales ?? 0)}</span>} />
          </StatusCard>

          {/* Leads */}
          <StatusCard
            title="Lead Customers"
            badge={status ? formatNumber(status.leads.total_rows) + ' leads' : undefined}
            lastUploaded={fmtUpload(status?.leads.last_uploaded ?? null)}
            empty={!status || status.leads.total_rows === 0}
          >
            <StatusRow label="จำนวน Lead" value={formatNumber(status?.leads.total_rows ?? 0)} />
          </StatusCard>

          {/* Products */}
          <StatusCard
            title="Products"
            badge={status ? formatNumber(status.products.total_rows) + ' SKUs' : undefined}
            lastUploaded={fmtUpload(status?.products.last_uploaded ?? null)}
            empty={!status || status.products.total_rows === 0}
          >
            <StatusRow label="จำนวน SKU" value={formatNumber(status?.products.total_rows ?? 0)} />
            <StatusRow label="จำนวน Brand" value={formatNumber(status?.products.total_brands ?? 0)} />
          </StatusCard>

          {/* Telesales */}
          <StatusCard
            title="Telesales"
            badge={status ? formatNumber(status.telesales.total_rows) + ' rows' : undefined}
            lastUploaded={fmtUpload(status?.telesales.last_uploaded ?? null)}
            empty={!status || status.telesales.total_rows === 0}
          >
            <StatusRow label="วันที่ล่าสุด" value={fmtDate(status?.telesales.latest_date ?? null)} />
            <StatusRow label="วันที่เก่าสุด" value={fmtDate(status?.telesales.earliest_date ?? null)} />
            <StatusRow label="จำนวน Agent" value={formatNumber(status?.telesales.total_agents ?? 0)} />
          </StatusCard>

          {/* Targets */}
          <StatusCard
            title="Targets"
            badge={status ? formatNumber(status.targets.total_rows) + ' rows' : undefined}
            lastUploaded={fmtUpload(status?.targets.last_uploaded ?? null)}
            empty={!status || status.targets.total_rows === 0}
          >
            <StatusRow label="เดือนล่าสุด" value={fmtMonth(status?.targets.latest_month ?? null)} />
            <StatusRow label="เดือนเก่าสุด" value={fmtMonth(status?.targets.earliest_month ?? null)} />
            <StatusRow label="ยอด Target รวม" value={formatTHB(status?.targets.total_target ?? 0)} />
          </StatusCard>

          {/* Costs */}
          <StatusCard
            title="Costs"
            badge={status ? formatNumber(status.costs.total_rows) + ' เดือน' : undefined}
            lastUploaded={fmtUpload(status?.costs.last_uploaded ?? null)}
            empty={!status || status.costs.total_rows === 0}
          >
            <StatusRow label="เดือนล่าสุด" value={fmtMonth(status?.costs.latest_month ?? null)} />
            <StatusRow label="เดือนเก่าสุด" value={fmtMonth(status?.costs.earliest_month ?? null)} />
          </StatusCard>

          {/* Incentives */}
          <StatusCard
            title="Incentives"
            badge={status ? status.incentives.total_tiers + ' tiers' : undefined}
            lastUploaded={fmtUpload(status?.incentives.last_uploaded ?? null)}
            empty={!status || status.incentives.total_tiers === 0}
          >
            <StatusRow label="จำนวน Tier" value={status?.incentives.total_tiers ?? 0} />
            <StatusRow
              label="Tiers"
              value={status?.incentives.tiers.map(t => `${(t * 100).toFixed(0)}%`).join(', ') ?? '-'}
            />
          </StatusCard>
        </div>
      </div>

      {/* Upload History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Upload History</CardTitle></CardHeader>
        <CardContent>
          {!batches || batches.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">ยังไม่มีประวัติการ upload</p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">File</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rows</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Errors</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(b.uploaded_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">
                          {FILE_TYPE_CONFIGS[b.table_name as UploadFileType]?.label ?? b.table_name}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-sm max-w-[200px] truncate">{b.filename ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right">{b.row_count ?? 0}</td>
                      <td className="px-4 py-2.5 text-right">
                        {b.error_count > 0 ? <span className="text-amber-500">{b.error_count}</span> : 0}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {b.status === 'success' ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          : b.status === 'partial' ? <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />
                          : b.status === 'failed'  ? <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                          : <Clock className="h-4 w-4 text-gray-400 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
