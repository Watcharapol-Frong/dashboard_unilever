'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Users, Phone, PhoneOff, PhoneCall, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const TIER_ORDER = ['0-5000', '5000-10000', '10000-20000', '20000-50000', '50000+']

interface TelesalesCall {
  call_status: string | null
  agent: string | null
  first_connected_date: string | null
  reason_group: string | null
}

interface Lead {
  mmid: string
  cust_name: string | null
  mobile: string | null
  lead_customers: string | null
  updated_at: string | null
  telesales_calls: TelesalesCall | null
}

interface TierBreakdown {
  category: string
  total: number
  called: number
  notCalled: number
}

interface LeadsData {
  total: number
  called: number
  notCalled: number
  reached: number
  callStatusCounts: Record<string, number>
  tierBreakdown: TierBreakdown[]
  leads: Lead[]
  page: number
  limit: number
}

const CALL_STATUS_COLOR: Record<string, string> = {
  'รับสาย':            'bg-green-100 text-green-800',
  'ไม่รับสาย 1':       'bg-yellow-100 text-yellow-800',
  'ฝากข้อความ':        'bg-blue-100 text-blue-800',
  'หมายเลขไม่ถูกต้อง': 'bg-red-100 text-red-800',
  'สายไม่ว่าง':        'bg-orange-100 text-orange-800',
}

const tierChartConfig = {
  called:    { label: 'Called',     color: '#003DA6' },
  notCalled: { label: 'Not Called', color: '#cbd5e1' },
} satisfies ChartConfig

export default function LeadsPage() {
  const [page, setPage] = useState(1)
  const LIMIT = 50

  const { data, isLoading } = useSWR<LeadsData>(
    `/api/kpi/leads?page=${page}&limit=${LIMIT}`,
    fetcher
  )

  // Sort tier chart data by TIER_ORDER
  const tierChartData = TIER_ORDER
    .map(cat => data?.tierBreakdown.find(r => r.category === cat))
    .filter(Boolean)
    .map(r => ({ category: r!.category, called: r!.called, notCalled: r!.notCalled }))

  const callBar = Object.entries(data?.callStatusCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }))

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1

  const columns = [
    {
      key: 'mmid',
      header: 'MMID',
      render: (r: Lead) => <span className="font-mono text-xs">{r.mmid}</span>,
    },
    {
      key: 'cust_name',
      header: 'Customer Name',
      render: (r: Lead) => r.cust_name ?? '-',
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (r: Lead) => <span className="font-mono text-xs">{r.mobile ?? '-'}</span>,
    },
    {
      key: 'lead_customers',
      header: 'Category',
      render: (r: Lead) => r.lead_customers
        ? <Badge variant="outline">{r.lead_customers}</Badge>
        : '-',
    },
    {
      key: 'call_status',
      header: 'Call Status',
      render: (r: Lead) => {
        const status = r.telesales_calls?.call_status
        if (!status) return <span className="text-muted-foreground text-xs">Not called</span>
        const cls = CALL_STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-700'
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
            {status}
          </span>
        )
      },
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (r: Lead) => r.telesales_calls?.agent ?? '-',
    },
    {
      key: 'first_connected_date',
      header: 'First Contact Date',
      render: (r: Lead) => r.telesales_calls?.first_connected_date ?? '-',
    },
    {
      key: 'reason_group',
      header: 'Reason Group',
      render: (r: Lead) => r.telesales_calls?.reason_group ?? '-',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lead List</h1>
        <p className="text-muted-foreground text-sm mt-1">Leads assigned to the Telesales team for outreach</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Leads" value={formatNumber(data?.total ?? 0)} icon={Users} loading={isLoading} />
        <KpiCard
          title="Called"
          value={formatNumber(data?.called ?? 0)}
          subtitle={data?.total ? `${((data.called / data.total) * 100).toFixed(1)}% of total` : undefined}
          icon={Phone}
          loading={isLoading}
        />
        <KpiCard
          title="Not Called"
          value={formatNumber(data?.notCalled ?? 0)}
          subtitle={data?.total ? `${((data.notCalled / data.total) * 100).toFixed(1)}% of total` : undefined}
          icon={PhoneOff}
          loading={isLoading}
        />
        <KpiCard
          title="Reached"
          value={formatNumber(data?.reached ?? 0)}
          subtitle={data?.called ? `${((data.reached / data.called) * 100).toFixed(1)}% of called` : undefined}
          icon={PhoneCall}
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Leads Category — Stacked Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads Category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={tierChartConfig} className="h-64 w-full">
                <BarChart data={tierChartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="category"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatNumber(v)}
                    width={55}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="called"
                    stackId="a"
                    fill="var(--color-called)"
                    radius={[0, 0, 4, 4]}
                  />
                  <Bar
                    dataKey="notCalled"
                    stackId="a"
                    fill="var(--color-notCalled)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Call Status Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Call Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-64 w-full" />
              : <NivoBar
                  data={callBar.map(d => ({ status: d.status, count: d.count }))}
                  keys={['count']}
                  indexBy="status"
                  height={260}
                  layout="horizontal"
                  legend={false}
                />
            }
          </CardContent>
        </Card>
      </div>

      {/* Table with server-side pagination */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              All Leads
              {data && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({formatNumber(data.total)} records)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <Skeleton className="h-96 w-full rounded-none" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {columns.map(col => (
                      <th key={col.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.leads ?? []).map((row, i) => (
                    <tr key={row.mmid} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                      {columns.map(col => (
                        <td key={col.key} className="px-4 py-2.5 align-middle whitespace-nowrap">
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(data?.leads ?? []).length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                        No leads found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
