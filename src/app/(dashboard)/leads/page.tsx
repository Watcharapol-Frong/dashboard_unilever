'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { NivoBar } from '@/components/charts/NivoBar'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { Users, Phone, PhoneCall, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const TIER_ORDER = ['0-5000', '5000-10000', '10000-20000', '20000-50000', '50000+']

type Filter = 'all' | 'retry' | 'reached' | 'invalid'

interface AgentPerf {
  agent: string
  totalCalls: number
  reached: number
  reachRate: number
}

interface ReasonGroup {
  reasonGroup: string
  total: number
}

interface TierBreakdown {
  category: string
  total: number
  called: number
  notCalled: number
}

interface CallRow {
  mmid: string
  mobile: string | null
  call_status: string | null
  agent: string | null
  first_connected_date: string | null
  reason_group: string | null
  lead_customers: string | null
}

interface LeadsData {
  total: number
  called: number
  notCalled: number
  reached: number
  reachRate: number
  callStatusCounts: Record<string, number>
  tierBreakdown: TierBreakdown[]
  agentPerformance: AgentPerf[]
  reasonGroups: ReasonGroup[]
  rows: CallRow[]
  rowsTotal: number
  page: number
  limit: number
}

const CALL_STATUS_BADGE: Record<string, string> = {
  'รับสาย':            'bg-green-100 text-green-800',
  'ไม่รับสาย 1':       'bg-yellow-100 text-yellow-800',
  'ฝากข้อความ':        'bg-blue-100 text-blue-800',
  'หมายเลขไม่ถูกต้อง': 'bg-red-100 text-red-800',
  'สายไม่ว่าง':        'bg-orange-100 text-orange-800',
}

const FILTER_LABELS: Record<Filter, string> = {
  all:     'All Records',
  retry:   'Retry Needed',
  reached: 'Reached',
  invalid: 'Invalid Number',
}

const tierChartConfig = {
  called:    { label: 'Called',     color: '#003DA6' },
  notCalled: { label: 'Not Called', color: '#cbd5e1' },
} satisfies ChartConfig

const agentChartConfig = {
  totalCalls: { label: 'Total Calls', color: '#003DA6' },
  reached:    { label: 'Reached',     color: '#22c55e' },
} satisfies ChartConfig

export default function LeadsPage() {
  const [page, setPage]     = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  const LIMIT = 50

  const { data, isLoading } = useSWR<LeadsData>(
    `/api/analytics/leads?page=${page}&limit=${LIMIT}&filter=${filter}`,
    fetcher
  )

  function handleFilter(f: Filter) {
    setFilter(f)
    setPage(1)
  }

  const tierChartData = TIER_ORDER
    .map(cat => data?.tierBreakdown.find(r => r.category === cat))
    .filter(Boolean)
    .map(r => ({ category: r!.category, called: r!.called, notCalled: r!.notCalled }))

  const callBar = Object.entries(data?.callStatusCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }))

  const totalPages = data ? Math.ceil(data.rowsTotal / LIMIT) : 1

  const retryCount = (data?.callStatusCounts['ไม่รับสาย 1'] ?? 0)
    + (data?.callStatusCounts['สายไม่ว่าง'] ?? 0)
    + (data?.callStatusCounts['ฝากข้อความ'] ?? 0)

  return (
    <div className="space-y-8">

      {/* ── PROBLEMS ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Problems — Outcomes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Lag indicators: what results are we getting?</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Leads" value={formatNumber(data?.total ?? 0)} icon={Users} loading={isLoading} />
          <KpiCard
            title="Called"
            value={formatNumber(data?.called ?? 0)}
            subtitle={data?.total ? `${((data.called / data.total) * 100).toFixed(1)}% coverage` : undefined}
            icon={Phone}
            loading={isLoading}
          />
          <KpiCard
            title="Reach Rate"
            value={`${data?.reachRate ?? 0}%`}
            subtitle={data?.reached ? `${formatNumber(data.reached)} reached` : undefined}
            icon={PhoneCall}
            loading={isLoading}
          />
          <KpiCard
            title="Retry Needed"
            value={formatNumber(retryCount)}
            subtitle="Unanswered / busy / left message"
            icon={RefreshCw}
            loading={isLoading}
          />
        </div>
      </section>

      {/* ── REASONS ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reasons — Root Causes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Lead indicators: why are results good or bad?</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Coverage by Category */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Coverage by Category</CardTitle>
              <CardDescription className="text-xs">Which tiers have gaps in outreach?</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : (
                <ChartContainer config={tierChartConfig} className="h-52 w-full">
                  <BarChart data={tierChartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="category" tickLine={false} tickMargin={6} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v)} width={50} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="called"    stackId="a" fill="var(--color-called)"    radius={[0, 0, 4, 4]} />
                    <Bar dataKey="notCalled" stackId="a" fill="var(--color-notCalled)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Call Outcome Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Call Outcome Breakdown</CardTitle>
              <CardDescription className="text-xs">What happens when we call?</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading
                ? <Skeleton className="h-52 w-full" />
                : <NivoBar
                    data={callBar.map(d => ({ status: d.status, count: d.count }))}
                    keys={['count']}
                    indexBy="status"
                    height={210}
                    layout="horizontal"
                    legend={false}
                  />
              }
            </CardContent>
          </Card>

          {/* Agent Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Agent Performance</CardTitle>
              <CardDescription className="text-xs">Who is reaching customers most effectively?</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : (data?.agentPerformance ?? []).length === 0 ? (
                <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              ) : (
                <ChartContainer config={agentChartConfig} className="h-52 w-full">
                  <BarChart
                    data={data?.agentPerformance ?? []}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatNumber(v)} />
                    <YAxis type="category" dataKey="agent" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={80} />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="totalCalls" fill="var(--color-totalCalls)" radius={[0, 2, 2, 0]} barSize={10} />
                    <Bar dataKey="reached"    fill="var(--color-reached)"    radius={[0, 2, 2, 0]} barSize={10} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Reason Group Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reason Group Analysis</CardTitle>
              <CardDescription className="text-xs">Why are customers not converting?</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : (data?.reasonGroups ?? []).length === 0 ? (
                <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              ) : (
                <NivoBar
                  data={(data?.reasonGroups ?? []).map(r => ({ group: r.reasonGroup, count: r.total }))}
                  keys={['count']}
                  indexBy="group"
                  height={210}
                  layout="horizontal"
                  legend={false}
                />
              )}
            </CardContent>
          </Card>

        </div>
      </section>

      {/* ── ACTIONS ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions — Workqueue</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Direct action: specific records to call, retry, or fix</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => handleFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      filter === f
                        ? 'bg-[#003DA6] text-white'
                        : 'border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {FILTER_LABELS[f]}
                    {f === 'retry' && retryCount > 0 && (
                      <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
                        filter === f ? 'bg-white/20 text-white' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {formatNumber(retryCount)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {data && <span>{formatNumber(data.rowsTotal)} records</span>}
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>Page {page} / {totalPages}</span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <Skeleton className="h-80 w-full rounded-none" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {['MMID', 'Mobile', 'Call Status', 'Agent', 'Date', 'Category', 'Reason Group'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows ?? []).map((row, i) => {
                      const statusCls = row.call_status
                        ? (CALL_STATUS_BADGE[row.call_status] ?? 'bg-gray-100 text-gray-700')
                        : ''
                      return (
                        <tr key={`${row.mmid}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                          <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{row.mmid}</td>
                          <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{row.mobile ?? '-'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {row.call_status ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusCls}`}>
                                {row.call_status}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs">{row.agent ?? '-'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs">{row.first_connected_date ?? '-'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {row.lead_customers
                              ? <Badge variant="outline" className="text-xs">{row.lead_customers}</Badge>
                              : <span className="text-muted-foreground text-xs">-</span>}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs">{row.reason_group ?? '-'}</td>
                        </tr>
                      )
                    })}
                    {(data?.rows ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">
                          No records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  )
}
