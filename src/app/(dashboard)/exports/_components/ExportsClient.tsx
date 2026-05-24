'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { type OverviewRow } from '@/app/(dashboard)/overview/_components/columns'
import {
  BarChart3, ShoppingBag, Phone, Users, Package,
  Calculator, Download, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Export type definitions ──────────────────────────────────────────────────

interface ExportCard {
  id: string
  title: string
  description: string
  icon: React.ElementType
  iconClass: string
  hasCmgFilter: boolean
  hasDateFilter: boolean
}

const EXPORT_CARDS: ExportCard[] = [
  {
    id: 'overview',
    title: 'Performance Overview',
    description: 'Monthly KPIs per CMG — sales, target, achievement, ROI, new/retention customers.',
    icon: BarChart3,
    iconClass: 'bg-blue-50 text-blue-600',
    hasCmgFilter: true,
    hasDateFilter: true,
  },
  {
    id: 'sales',
    title: 'Sales Orders',
    description: 'All HOC sales order lines with order number, date, product, channel, and amount.',
    icon: ShoppingBag,
    iconClass: 'bg-green-50 text-green-600',
    hasCmgFilter: false,
    hasDateFilter: true,
  },
  {
    id: 'telesales',
    title: 'Telesales Calls',
    description: 'All telesales call records — agent, call status, reason group, and call date.',
    icon: Phone,
    iconClass: 'bg-purple-50 text-purple-600',
    hasCmgFilter: false,
    hasDateFilter: true,
  },
  {
    id: 'leads',
    title: 'Leads',
    description: 'Full leads list with contact status, conversion status, agent, and HOC orders.',
    icon: Users,
    iconClass: 'bg-orange-50 text-orange-600',
    hasCmgFilter: true,
    hasDateFilter: false,
  },
  {
    id: 'products',
    title: 'Product Performance',
    description: 'Products grouped by SKU — qty sold, revenue, and Unilever HOC flag.',
    icon: Package,
    iconClass: 'bg-pink-50 text-pink-600',
    hasCmgFilter: false,
    hasDateFilter: true,
  },
  {
    id: 'incentives',
    title: 'Incentives & Costs',
    description: 'Monthly incentive payments, headcount cost, total expense, and ROI per CMG.',
    icon: Calculator,
    iconClass: 'bg-amber-50 text-amber-600',
    hasCmgFilter: true,
    hasDateFilter: true,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'done' | 'error'

export default function ExportsClient() {
  const { data: overviewRows = [] } = useDashboardSWR<OverviewRow[]>('/api/data/overview')

  const months     = useMemo(() => [...new Set(overviewRows.map(r => r.month))].sort(), [overviewRows])
  const cmgOptions = useMemo(() => [...new Set(overviewRows.map(r => r.dynamic_cmg))].sort(), [overviewRows])

  const [startMonth, setStartMonth] = useState('all')
  const [endMonth,   setEndMonth]   = useState('all')
  const [filterCmg,  setFilterCmg]  = useState('all')

  const [statuses, setStatuses] = useState<Record<string, Status>>({})

  const monthOptions = useMemo(() =>
    months.map(m => ({
      value: m,
      label: new Date(m).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    })),
  [months])

  function setStatus(id: string, s: Status) {
    setStatuses(prev => ({ ...prev, [id]: s }))
  }

  async function handleDownload(card: ExportCard) {
    setStatus(card.id, 'loading')
    try {
      const sp = new URLSearchParams()
      if (card.hasDateFilter) {
        if (startMonth !== 'all') sp.set('start', startMonth.slice(0, 7))  // YYYY-MM
        if (endMonth   !== 'all') sp.set('end',   endMonth.slice(0, 7))
      }
      if (card.hasCmgFilter && filterCmg !== 'all') sp.set('cmg', filterCmg)

      const res = await fetch(`/api/data/export/${card.id}?${sp.toString()}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: `${card.id}-${new Date().toISOString().slice(0, 10)}.csv`,
      })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setStatus(card.id, 'done')
      setTimeout(() => setStatus(card.id, 'idle'), 3000)
    } catch (err) {
      console.error('[export]', err)
      setStatus(card.id, 'error')
      setTimeout(() => setStatus(card.id, 'idle'), 4000)
    }
  }

  const hasDateFilter = startMonth !== 'all' || endMonth !== 'all'
  const hasCmgFilter  = filterCmg  !== 'all'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Data Exports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Download filtered data as CSV. Admin only. Max 100,000 rows per file.
        </p>
      </div>

      {/* Global Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
            <FilterSelect
              label="From Month"
              value={startMonth}
              onChange={v => { setStartMonth(v); if (endMonth !== 'all' && v > endMonth) setEndMonth(v) }}
              options={monthOptions}
              width="w-36"
            />
            <FilterSelect
              label="To Month"
              value={endMonth}
              onChange={v => { setEndMonth(v); if (startMonth !== 'all' && v < startMonth) setStartMonth(v) }}
              options={monthOptions}
              width="w-36"
            />
            <div className="w-px h-5 bg-border hidden sm:block" />
            <FilterSelect
              label="All CMG"
              value={filterCmg}
              onChange={setFilterCmg}
              options={cmgOptions.map(v => ({ value: v, label: v }))}
              width="w-36"
            />
            {(hasDateFilter || hasCmgFilter) && (
              <button
                onClick={() => { setStartMonth('all'); setEndMonth('all'); setFilterCmg('all') }}
                className="text-xs text-muted-foreground underline"
              >
                Clear
              </button>
            )}
          </div>

          {(hasDateFilter || hasCmgFilter) && (
            <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t">
              {startMonth !== 'all' && (
                <Badge variant="secondary" className="text-xs font-normal">
                  From: {new Date(startMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </Badge>
              )}
              {endMonth !== 'all' && (
                <Badge variant="secondary" className="text-xs font-normal">
                  To: {new Date(endMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </Badge>
              )}
              {filterCmg !== 'all' && (
                <Badge variant="secondary" className="text-xs font-normal">CMG: {filterCmg}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORT_CARDS.map(card => {
          const status = statuses[card.id] ?? 'idle'
          const Icon   = card.icon

          return (
            <Card key={card.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className={cn('p-2 rounded-lg shrink-0', card.iconClass)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold">{card.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-2 mt-auto">
                {/* Active filter indicators */}
                <div className="flex gap-1.5 flex-wrap mb-3 min-h-[20px]">
                  {card.hasDateFilter && startMonth !== 'all' && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {new Date(startMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      {endMonth !== 'all' && endMonth !== startMonth && (
                        <> → {new Date(endMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</>
                      )}
                    </span>
                  )}
                  {card.hasCmgFilter && filterCmg !== 'all' && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      CMG: {filterCmg}
                    </span>
                  )}
                  {(!card.hasDateFilter || startMonth === 'all') && (!card.hasCmgFilter || filterCmg === 'all') && (
                    <span className="text-[10px] text-muted-foreground/50">All data</span>
                  )}
                </div>

                <button
                  onClick={() => handleDownload(card)}
                  disabled={status === 'loading'}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all',
                    status === 'loading' && 'bg-muted text-muted-foreground cursor-not-allowed',
                    status === 'done'    && 'bg-green-50 text-green-700 border border-green-200',
                    status === 'error'   && 'bg-red-50 text-red-600 border border-red-200',
                    status === 'idle'    && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {status === 'done'    && <CheckCircle2 className="h-4 w-4" />}
                  {status === 'error'   && <AlertCircle className="h-4 w-4" />}
                  {status === 'idle'    && <Download className="h-4 w-4" />}
                  {status === 'loading' && 'Generating…'}
                  {status === 'done'    && 'Downloaded'}
                  {status === 'error'   && 'Download failed'}
                  {status === 'idle'    && 'Download CSV'}
                </button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
