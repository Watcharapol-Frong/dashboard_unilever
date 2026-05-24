'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GRANULARITY_DEFS,
  ALL_COLUMNS,
  DEFAULT_METRICS,
  type GranularityId,
} from '@/lib/pivot-config'
import { Play, Download, FileSpreadsheet, AlertCircle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FilterOptions {
  months:        string[]
  cmgs:          string[]
  channels:      string[]
  customerTypes: string[]
}

interface PreviewResult {
  headers: string[]
  data:    Record<string, unknown>[]
  total:   number
}

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data as FilterOptions
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ExportsClient() {
  const [granularity,  setGranularity]  = useState<GranularityId>('month')
  const [selColumns,   setSelColumns]   = useState<Set<string>>(
    () => new Set(DEFAULT_METRICS['month'])
  )
  const [filterStart,  setFilterStart]  = useState('')
  const [filterEnd,    setFilterEnd]    = useState('')
  const [filterCmg,    setFilterCmg]    = useState('')
  const [filterChannel,setFilterChannel]= useState('')
  const [filterCustType,setFilterCustType] = useState('')

  const [preview,      setPreview]      = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [running,      setRunning]      = useState(false)
  const [exporting,    setExporting]    = useState<'csv' | 'xlsx' | null>(null)

  const { data: opts, isLoading: optsLoading } = useSWR<FilterOptions>(
    '/api/data/pivot', fetcher, { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )

  const granDef = GRANULARITY_DEFS.find(g => g.id === granularity)!
  const isRaw   = granularity === 'order_line'

  const availableBreakdowns = ALL_COLUMNS.filter(
    c => c.type === 'breakdown' && granDef.breakdowns.includes(c.id)
  )
  const availableMetrics = ALL_COLUMNS.filter(
    c => c.type === 'metric' && granDef.metrics.includes(c.id)
  )

  const toggleCol = useCallback((id: string, checked: boolean) => {
    setSelColumns(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleGranChange = useCallback((gran: GranularityId) => {
    setGranularity(gran)
    setSelColumns(new Set(DEFAULT_METRICS[gran]))
    setPreview(null)
    setPreviewError(null)
  }, [])

  const buildBody = (fmt: 'json' | 'csv' | 'xlsx') => ({
    granularity,
    columns: isRaw ? [] : Array.from(selColumns),
    filters: {
      startMonth:   filterStart  || undefined,
      endMonth:     filterEnd    || undefined,
      cmg:          filterCmg    || undefined,
      channel:      filterChannel || undefined,
      customerType: filterCustType || undefined,
    },
    format: fmt,
  })

  const handleRun = async () => {
    if (!isRaw && selColumns.size === 0) {
      setPreviewError('Select at least one metric column.')
      return
    }
    setRunning(true)
    setPreviewError(null)
    try {
      const res  = await fetch('/api/data/pivot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody('json')) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Unknown error')
      setPreview(json)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to run query')
    } finally {
      setRunning(false)
    }
  }

  const handleExport = async (fmt: 'csv' | 'xlsx') => {
    if (!isRaw && selColumns.size === 0) {
      setPreviewError('Select at least one metric column.')
      return
    }
    setExporting(fmt)
    try {
      const res = await fetch('/api/data/pivot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildBody(fmt)),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(j.error)
      }
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = `export_${new Date().toISOString().slice(0,10)}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Config row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 1 — Row granularity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Row by
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {GRANULARITY_DEFS.map(g => (
              <button
                key={g.id}
                onClick={() => handleGranChange(g.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  granularity === g.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {g.label}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* 2 — Columns */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Columns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isRaw ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground mb-2">All columns included (raw mode)</p>
                {granDef.keyLabels.map(l => (
                  <Badge key={l} variant="secondary" className="mr-1 mb-1 text-xs">{l}</Badge>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Key columns (always on) */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Key (always shown)</p>
                  <div className="flex flex-wrap gap-1">
                    {granDef.keyLabels.map(l => (
                      <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>
                    ))}
                  </div>
                </div>

                {availableBreakdowns.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Breakdowns</p>
                      <div className="space-y-2">
                        {availableBreakdowns.map(col => (
                          <div key={col.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${col.id}`}
                              checked={selColumns.has(col.id)}
                              onCheckedChange={v => toggleCol(col.id, !!v)}
                            />
                            <Label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {availableMetrics.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Metrics</p>
                      <div className="space-y-2">
                        {availableMetrics.map(col => (
                          <div key={col.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${col.id}`}
                              checked={selColumns.has(col.id)}
                              onCheckedChange={v => toggleCol(col.id, !!v)}
                            />
                            <Label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3 — Filters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Period */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <div className="flex items-center gap-2">
                {optsLoading ? (
                  <Skeleton className="h-8 flex-1" />
                ) : (
                  <>
                    <Select value={filterStart} onValueChange={setFilterStart}>
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="From" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        {(opts?.months ?? []).map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-xs">–</span>
                    <Select value={filterEnd} onValueChange={setFilterEnd}>
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="To" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        {(opts?.months ?? []).map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>

            {/* CMG */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">CMG</Label>
              {optsLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Select value={filterCmg} onValueChange={setFilterCmg}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All CMGs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    {(opts?.cmgs ?? []).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Channel */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              <Select value={filterChannel} onValueChange={setFilterChannel}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Customer type — hidden for order_line */}
            {!isRaw && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Customer Type</Label>
                <Select value={filterCustType} onValueChange={setFilterCustType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="new_customer">New Customer</SelectItem>
                    <SelectItem value="retention">Retention</SelectItem>
                    <SelectItem value="first_order_not_converted">First Order (Not Converted)</SelectItem>
                    <SelectItem value="retention_not_converted">Retention (Not Converted)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <Play className="h-4 w-4" />
              {running ? 'Running…' : 'Run Preview'}
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {previewError && (
        <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {previewError}
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Preview
              <span className="ml-2 text-muted-foreground font-normal text-xs">
                {preview.data.length} of {preview.total.toLocaleString()} rows
              </span>
            </CardTitle>

            {/* Export buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting !== null}
                className="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium flex items-center gap-1.5 hover:bg-muted disabled:opacity-60 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting === 'csv' ? 'Exporting…' : 'CSV'}
                <span className="text-muted-foreground">(max 500k)</span>
              </button>
              <button
                onClick={() => handleExport('xlsx')}
                disabled={exporting !== null}
                className="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium flex items-center gap-1.5 hover:bg-muted disabled:opacity-60 transition-colors"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
                <span className="text-muted-foreground">(max {isRaw ? '100k' : '500k'})</span>
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {preview.headers.map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.data.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2 whitespace-nowrap">
                          {v == null ? <span className="text-muted-foreground">—</span> : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.data.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No data for selected filters</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state — before first run */}
      {!preview && !running && !previewError && (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2 border-2 border-dashed rounded-lg">
          <Play className="h-6 w-6 opacity-40" />
          Configure your query above, then click <strong>Run Preview</strong>
        </div>
      )}

      {/* Loading skeleton */}
      {running && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
