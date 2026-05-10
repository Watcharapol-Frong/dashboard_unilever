'use client'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { NivoPie } from '@/components/charts/NivoPie'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatDate } from '@/lib/utils'
import { Users, Clock, CheckCircle, XCircle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Lead { customer_id: string; customer_name: string | null; mobile: string | null; segment: string | null; assigned_company: string | null; assigned_date: string | null; status: string }
interface LeadsData { leads: Lead[]; statusCounts: { pending: number; called: number; converted: number; lost: number }; total: number }

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'secondary', called: 'warning', converted: 'success', lost: 'destructive',
}

export default function LeadsPage() {
  const { data, isLoading } = useSWR<LeadsData>('/api/kpi/leads', fetcher)

  const pie = data?.statusCounts ? [
    { id: 'Pending', label: 'Pending', value: data.statusCounts.pending },
    { id: 'Called', label: 'Called', value: data.statusCounts.called },
    { id: 'Converted', label: 'Converted', value: data.statusCounts.converted },
    { id: 'Lost', label: 'Lost', value: data.statusCounts.lost },
  ].filter(d => d.value > 0) : []

  const columns = [
    { key: 'customer_id', header: 'Customer ID', sortable: true },
    { key: 'customer_name', header: 'Name', render: (r: Lead) => r.customer_name ?? '-' },
    { key: 'mobile', header: 'Mobile', render: (r: Lead) => r.mobile ?? '-' },
    { key: 'segment', header: 'Segment', render: (r: Lead) => r.segment ?? '-' },
    { key: 'assigned_company', header: 'Telesales Co.', render: (r: Lead) => r.assigned_company ?? '-', sortable: true },
    { key: 'assigned_date', header: 'Assigned', render: (r: Lead) => r.assigned_date ? formatDate(r.assigned_date) : '-', sortable: true },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (r: Lead) => <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{r.status}</Badge>
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lead List</h1>
        <p className="text-muted-foreground text-sm mt-1">Leads assigned by Makro to Telesales companies</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Leads" value={formatNumber(data?.total ?? 0)} icon={Users} loading={isLoading} />
        <KpiCard title="Pending" value={formatNumber(data?.statusCounts.pending ?? 0)} icon={Clock} loading={isLoading} />
        <KpiCard title="Converted" value={formatNumber(data?.statusCounts.converted ?? 0)} subtitle="Lead → Customer" icon={CheckCircle} loading={isLoading} />
        <KpiCard title="Lost / Not Interested" value={formatNumber(data?.statusCounts.lost ?? 0)} icon={XCircle} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Lead Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <NivoPie data={pie} height={260} legend={false} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">All Leads</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              data={(data?.leads ?? []) as unknown as Record<string, unknown>[]}
              columns={columns as never}
              pageSize={15}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
