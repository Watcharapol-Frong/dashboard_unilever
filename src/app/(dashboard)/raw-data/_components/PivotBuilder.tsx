'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { useUser } from '@clerk/nextjs'
import { ColumnDef } from '@tanstack/react-table'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  GRANULARITY_DEFS, ALL_COLUMNS, DEFAULT_METRICS,
  type GranularityId,
} from '@/lib/pivot-config'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FilterOptions {
  months:        string[]
  cmgs:          string[]
  channels:      string[]
  customerTypes: string[]
}

interface PreviewResult {
  ok:      boolean
  headers: string[]
  data:    Record<string, unknown>[]
  total:   number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const optsFetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data as FilterOptions
}

const pivotFetcher = async (key: string): Promise<PreviewResult> => {
  const res  = await fetch('/api/data/pivot', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    key,
  })
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as PreviewResult
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

const CTYPE_LABELS: Record<string, string> = {
  new_customer:               'New Customer',
  retention:                  'Retention',
  first_order_not_converted:  'First Order (Not Conv.)',
  retention_not_converted:    'Retention (Not Conv.)',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PivotBuilder() {
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'

  const [gran,    setGran]    = useState<GranularityId>('month')
  const [selCols, setSelCols] = useState<string[]>(DEFAULT_METRICS.month)
  const [filters, setFilters] = useState({
    startMonth: '', endMonth: '', cmg: '', channel: '', customerType: '',
  })
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)

  const { data: opts, isLoading: optsLoading } =
    useSWR<FilterOptions>('/api/data/pivot', optsFetcher, {
      revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 3_600_000,
    })

  const granDef = GRANULARITY_DEFS.find(g => g.id === gran)!
  const isRaw   = gran === 'order_line'

  const availBreakdowns = ALL_COLUMNS.filter(c => c.type === 'breakdown' && granDef.breakdowns.includes(c.id))
  const availMetrics    = ALL_COLUMNS.filter(c => c.type === 'metric'    && granDef.metrics.includes(c.id))

  const hasMetric = isRaw || selCols.some(c => granDef.metrics.includes(c))

  // Build the POST body — null when it shouldn't fire (no metric selected)
  const postBody = useMemo(() => {
    if (!hasMetric) return null
    return JSON.stringify({
      granularity: gran,
      columns:     isRaw ? [] : selCols,
      filters: {
        startMonth:   filters.startMonth   || undefined,
        endMonth:     filters.endMonth     || undefined,
        cmg:          filters.cmg          || undefined,
        channel:      filters.channel      || undefined,
        customerType: filters.customerType || undefined,
      },
      format: 'json',
    })
  }, [gran, selCols, filters, isRaw, hasMetric])

  // Debounce the SWR key so rapid checkbox toggling doesn't fire on every click
  const [debouncedKey, setDebouncedKey] = useState<string | null>(postBody)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(postBody), 400)
    return () => clearTimeout(t)
  }, [postBody])

  const { data: preview, isLoading: running, error: runError } =
    useSWR<PreviewResult>(debouncedKey, pivotFetcher, {
      keepPreviousData:      true,
      revalidateOnFocus:     false,
      revalidateOnReconnect: false,
    })

  const toggleCol = useCallback((id: string) => {
    setSelCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }, [])

  const changeGran = (id: GranularityId) => {
    setGran(id)
    setSelCols(DEFAULT_METRICS[id])
  }

  const setFilter = (k: keyof typeof filters, v: string) =>
    setFilters(prev => ({ ...prev, [k]: v }))

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format)
    try {
      const body = JSON.stringify({
        granularity: gran,
        columns:     isRaw ? [] : selCols,
        filters: {
          startMonth:   filters.startMonth   || undefined,
          endMonth:     filters.endMonth     || undefined,
          cmg:          filters.cmg          || undefined,
          channel:      filters.channel      || undefined,
          customerType: filters.customerType || undefined,
        },
        format,
      })
      const res = await fetch('/api/data/pivot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `pivot_${gran}_${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const previewColumns = useMemo((): ColumnDef<Record<string, unknown>>[] => {
    if (!preview?.headers?.length) return []
    return preview.headers.map((h, i) => ({
      id:         String(i),
      accessorFn: (row) => Object.values(row)[i],
      header:     ({ column }) => <DataTableColumnHeader column={column} title={h} />,
      cell:       ({ getValue }) => {
        const v = getValue()
        return (
          <span className="text-xs font-mono">
            {v == null ? <span className="text-muted-foreground/40">—</span> : String(v)}
          </span>
        )
      },
    }))
  }, [preview?.headers])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Granularity */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Row by</p>
        <div className="flex flex-wrap gap-2">
          {GRANULARITY_DEFS.map(g => (
            <button
              key={g.id}
              onClick={() => changeGran(g.id)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                gran === g.id
                  ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                  : 'border-gray-200 text-muted-foreground hover:border-gray-300 hover:text-foreground bg-background',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</p>
        {optsLoading ? (
          <div className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-28" />)}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.startMonth}
              onChange={e => setFilter('startMonth', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
            >
              <option value="">From month</option>
              {(opts?.months ?? []).map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>

            <select
              value={filters.endMonth}
              onChange={e => setFilter('endMonth', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
            >
              <option value="">To month</option>
              {(opts?.months ?? []).map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>

            <select
              value={filters.cmg}
              onChange={e => setFilter('cmg', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
            >
              <option value="">All CMG</option>
              {(opts?.cmgs ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filters.channel}
              onChange={e => setFilter('channel', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
            >
              <option value="">All Channels</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>

            <select
              value={filters.customerType}
              onChange={e => setFilter('customerType', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
            >
              <option value="">All Types</option>
              {(opts?.customerTypes ?? []).map(t => (
                <option key={t} value={t}>{CTYPE_LABELS[t] ?? t}</option>
              ))}
            </select>

            {Object.values(filters).some(Boolean) && (
              <button
                onClick={() => setFilters({ startMonth: '', endMonth: '', cmg: '', channel: '', customerType: '' })}
                className="h-8 px-3 text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Column selector */}
      {!isRaw && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Columns</p>
          <div className="rounded-lg border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {availBreakdowns.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Breakdowns</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {availBreakdowns.map(col => (
                    <label key={col.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selCols.includes(col.id)}
                        onChange={() => toggleCol(col.id)}
                        className="h-3.5 w-3.5 rounded accent-[#003DA6]"
                      />
                      <span className={cn('text-xs', selCols.includes(col.id) ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {availMetrics.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Metrics</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {availMetrics.map(col => (
                    <label key={col.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selCols.includes(col.id)}
                        onChange={() => toggleCol(col.id)}
                        className="h-3.5 w-3.5 rounded accent-[#003DA6]"
                      />
                      <span className={cn('text-xs', selCols.includes(col.id) ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {!hasMetric && (
            <p className="text-xs text-muted-foreground">Select at least one metric to see results.</p>
          )}
        </div>
      )}

      {/* Export buttons — admin only */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={!!exporting || !preview}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-gray-300 transition-all disabled:opacity-40"
          >
            {exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting || !preview}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-gray-300 transition-all disabled:opacity-40"
          >
            {exporting === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Export XLSX
          </button>
        </div>
      )}

      {/* Status / preview */}
      {runError && (
        <p className="text-xs text-destructive font-medium">{(runError as Error).message}</p>
      )}

      {running && !preview && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 flex gap-4 border-b">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4 border-b last:border-0">
                {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className={cn('space-y-2', running && 'opacity-60 pointer-events-none transition-opacity')}>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {preview.total.toLocaleString()} total rows
              {preview.total > 100 && <span className="ml-1">· showing first 100 — export for full data</span>}
            </p>
            {running && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <DataTable columns={previewColumns} data={preview.data} hidePagination />
        </div>
      )}
    </div>
  )
}
