'use client'

import { useState, useCallback, useMemo } from 'react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  GRANULARITY_DEFS,
  ALL_COLUMNS,
  DEFAULT_METRICS,
  type GranularityId,
} from '@/lib/pivot-config'
import { Download, FileSpreadsheet, AlertCircle, ChevronDown } from 'lucide-react'

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

const optsFetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data as FilterOptions
}

const pivotFetcher = async ([, body]: [string, object]) => {
  const res  = await fetch('/api/data/pivot', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as PreviewResult
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ExportsClient() {
  const [granularity,   setGranularity]   = useState<GranularityId>('month')
  const [selColumns,    setSelColumns]    = useState<Set<string>>(
    () => new Set(DEFAULT_METRICS['month'])
  )
  const [filterStart,   setFilterStart]   = useState('all')
  const [filterEnd,     setFilterEnd]     = useState('all')
  const [filterCmg,     setFilterCmg]     = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterCustType,setFilterCustType]= useState('all')
  const [exporting,     setExporting]     = useState<'csv' | 'xlsx' | null>(null)
  const [exportError,   setExportError]   = useState<string | null>(null)

  const isRaw   = granularity === 'order_line'
  const granDef = GRANULARITY_DEFS.find(g => g.id === granularity)!

  const availableBreakdowns = ALL_COLUMNS.filter(
    c => c.type === 'breakdown' && granDef.breakdowns.includes(c.id)
  )
  const availableMetrics = ALL_COLUMNS.filter(
    c => c.type === 'metric' && granDef.metrics.includes(c.id)
  )

  // Filter options (months, cmgs)
  const { data: opts, isLoading: optsLoading } = useSWR<FilterOptions>(
    '/api/data/pivot', optsFetcher, { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )

  // Pivot body — memoised so SWR key is stable
  const pivotBody = useMemo(() => ({
    granularity,
    columns: isRaw ? [] : Array.from(selColumns),
    filters: {
      startMonth:   filterStart   !== 'all' ? filterStart   : undefined,
      endMonth:     filterEnd     !== 'all' ? filterEnd     : undefined,
      cmg:          filterCmg     !== 'all' ? filterCmg     : undefined,
      channel:      filterChannel !== 'all' ? filterChannel : undefined,
      customerType: filterCustType !== 'all' ? filterCustType : undefined,
    },
    format: 'json',
  }), [granularity, selColumns, filterStart, filterEnd, filterCmg, filterChannel, filterCustType, isRaw])

  // Auto-fetch preview — key includes serialised body so it refetches on any change
  const swrKey = useMemo(
    () => (isRaw || selColumns.size > 0 ? ['pivot-preview', pivotBody] : null),
    [isRaw, selColumns, pivotBody]
  )
  const { data: preview, isLoading: previewLoading, error: previewError } = useSWR<PreviewResult>(
    swrKey, pivotFetcher, { revalidateOnFocus: false, dedupingInterval: 0, keepPreviousData: true }
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
  }, [])

  const handleExport = async (fmt: 'csv' | 'xlsx') => {
    setExportError(null)
    setExporting(fmt)
    try {
      const res = await fetch('/api/data/pivot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...pivotBody, format: fmt }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(j.error)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `export_${new Date().toISOString().slice(0, 10)}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-6 h-full">

      {/* ── Row granularity — horizontal strip ─────────────────────────────── */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap mr-1">
              Row by
            </span>
            {GRANULARITY_DEFS.map(g => (
              <button
                key={g.id}
                onClick={() => handleGranChange(g.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                  granularity === g.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted hover:bg-muted/80 text-foreground'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Filters — horizontal strip ──────────────────────────────────────── */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              Filter
            </span>

            {/* Period */}
            {optsLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <Select value={filterStart} onValueChange={setFilterStart}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue placeholder="From" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {(opts?.months ?? []).map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-xs">–</span>
                <Select value={filterEnd} onValueChange={setFilterEnd}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue placeholder="To" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {(opts?.months ?? []).map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <Separator orientation="vertical" className="h-6" />

            {/* CMG */}
            {optsLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <Select value={filterCmg} onValueChange={setFilterCmg}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All CMGs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All CMGs</SelectItem>
                  {(opts?.cmgs ?? []).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Channel */}
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>

            {/* Customer type */}
            {!isRaw && (
              <Select value={filterCustType} onValueChange={setFilterCustType}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="new_customer">New Customer</SelectItem>
                  <SelectItem value="retention">Retention</SelectItem>
                  <SelectItem value="first_order_not_converted">First Order (Not Conv.)</SelectItem>
                  <SelectItem value="retention_not_converted">Retention (Not Conv.)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Main area: Columns (left) + Preview (right) ─────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Columns panel — fixed left */}
        <Card className="w-52 shrink-0 flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Columns
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto flex-1 pb-4">
            {isRaw ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-2">All columns included</p>
                {granDef.keyLabels.map(l => (
                  <Badge key={l} variant="secondary" className="block w-full text-xs truncate mb-1">{l}</Badge>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Key columns */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Key</p>
                  <div className="space-y-1">
                    {granDef.keyLabels.map(l => (
                      <Badge key={l} variant="secondary" className="block text-xs w-full truncate">{l}</Badge>
                    ))}
                  </div>
                </div>

                {availableBreakdowns.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Breakdowns</p>
                      <div className="space-y-2">
                        {availableBreakdowns.map(col => (
                          <div key={col.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${col.id}`}
                              checked={selColumns.has(col.id)}
                              onCheckedChange={v => toggleCol(col.id, !!v)}
                            />
                            <Label htmlFor={`col-${col.id}`} className="text-xs cursor-pointer leading-tight">{col.label}</Label>
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
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Metrics</p>
                      <div className="space-y-2">
                        {availableMetrics.map(col => (
                          <div key={col.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${col.id}`}
                              checked={selColumns.has(col.id)}
                              onCheckedChange={v => toggleCol(col.id, !!v)}
                            />
                            <Label htmlFor={`col-${col.id}`} className="text-xs cursor-pointer leading-tight">{col.label}</Label>
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

        {/* Preview panel — fills remaining space */}
        <Card className="flex-1 min-w-0 flex flex-col">
          <CardHeader className="pb-2 shrink-0 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Preview
              {preview && !previewLoading && (
                <span className="text-muted-foreground font-normal text-xs">
                  {preview.data.length} of {preview.total.toLocaleString()} rows
                </span>
              )}
              {previewLoading && (
                <span className="text-muted-foreground font-normal text-xs">Loading…</span>
              )}
            </CardTitle>

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={exporting !== null || (!preview && !previewLoading)}
                  className="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium flex items-center gap-1.5 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {exporting ? (
                    <span>Exporting…</span>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      Export
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2 cursor-pointer">
                  <Download className="h-4 w-4" />
                  <div>
                    <div className="text-sm">CSV</div>
                    <div className="text-xs text-muted-foreground">max 500,000 rows</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  <div>
                    <div className="text-sm">Excel (.xlsx)</div>
                    <div className="text-xs text-muted-foreground">max {isRaw ? '100,000' : '500,000'} rows</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
            {/* Error states */}
            {(previewError || exportError) && (
              <div className="flex items-center gap-2 text-sm text-destructive border-b border-destructive/20 bg-destructive/5 px-4 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {exportError ?? (previewError instanceof Error ? previewError.message : 'Query failed')}
              </div>
            )}

            {/* No metric selected — prompt */}
            {!isRaw && selColumns.size === 0 && (
              <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
                Select at least one metric column on the left
              </div>
            )}

            {/* Loading skeleton */}
            {previewLoading && (isRaw || selColumns.size > 0) && (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            )}

            {/* Table */}
            {preview && !previewLoading && (
              <div className="overflow-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted/80 backdrop-blur-sm">
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
                  <p className="text-center text-muted-foreground text-sm py-10">No data for selected filters</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
