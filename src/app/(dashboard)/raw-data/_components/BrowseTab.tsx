'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/clerk-client'
import { ColumnDef } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Download, Phone, ShoppingBag, Store, Package } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { PageError } from '@/components/dashboard/PageState'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type TableName = 'telesales_calls' | 'online_sales' | 'offline_sales' | 'products'

interface ApiResponse {
  ok:      boolean
  table:   TableName
  columns: string[]
  data:    Record<string, unknown>[]
  total:   number
  page:    number
  limit:   number
  pages:   number
}

const TABLES: { key: TableName; label: string; icon: React.ElementType }[] = [
  { key: 'telesales_calls', label: 'Telesales Calls', icon: Phone       },
  { key: 'online_sales',    label: 'Online Sales',    icon: ShoppingBag },
  { key: 'offline_sales',   label: 'Offline Sales',   icon: Store       },
  { key: 'products',        label: 'Products',        icon: Package     },
]

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as ApiResponse
}

export default function BrowseTab() {
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'

  const [activeTable, setActiveTable] = useState<TableName>('telesales_calls')
  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  useEffect(() => { setPage(1); setSearch(''); setDebouncedSearch('') }, [activeTable])

  const url = useMemo(() => {
    const sp = new URLSearchParams({ table: activeTable, page: String(page) })
    if (debouncedSearch) sp.set('search', debouncedSearch)
    return `/api/data/raw?${sp}`
  }, [activeTable, page, debouncedSearch])

  const { data, isLoading, error } = useSWR<ApiResponse>(url, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const columns = useMemo((): ColumnDef<Record<string, unknown>>[] => {
    if (!data?.columns?.length) return []
    return data.columns.map(col => ({
      accessorKey: col,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={col.replace(/_/g, ' ')} />
      ),
      cell: ({ row }) => {
        const val = row.original[col]
        return (
          <span className="text-xs font-mono">
            {val == null ? <span className="text-muted-foreground/40">—</span> : String(val)}
          </span>
        )
      },
    }))
  }, [data?.columns])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/data/raw/export?table=${activeTable}`)
      if (!res.ok) { alert('Export failed — admin access required'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${activeTable}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const rows       = data?.data  ?? []
  const total      = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  return (
    <div className="space-y-4">

      {/* Table selector + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TABLES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTable(key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all',
                activeTable === key
                  ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                  : 'border-gray-200 text-muted-foreground hover:border-gray-300 hover:text-foreground bg-background',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-gray-300 transition-all disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Row count + search */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isLoading && !data
            ? 'Loading…'
            : `${total.toLocaleString()} rows${debouncedSearch ? ' (filtered)' : ''}`}
        </p>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 w-48 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA6]/40"
        />
      </div>

      {error && <PageError message={error.message} />}

      {/* Table */}
      {isLoading && !data ? (
        <div className="rounded-md border overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex gap-4 border-b">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4 border-b last:border-0">
              {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
            </div>
          ))}
        </div>
      ) : columns.length > 0 ? (
        <div className={cn('transition-opacity', isLoading ? 'opacity-60 pointer-events-none' : '')}>
          <DataTable
            key={`${activeTable}-${page}`}
            columns={columns}
            data={rows}
            hidePagination
          />
        </div>
      ) : null}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total.toLocaleString()} rows · page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 w-8 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 w-8 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
