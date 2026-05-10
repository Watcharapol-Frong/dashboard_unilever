'use client'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { formatTHB, formatDate } from '@/lib/utils'
import { Gift } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Incentive {
  id: string
  period_start: string
  period_end: string
  product_sku: string | null
  product_brand: string | null
  incentive_type: string | null
  incentive_value: number | null
  description: string | null
}

export default function IncentivesPage() {
  const { data, isLoading } = useSWR<Incentive[]>('/api/incentives', fetcher)

  const columns = [
    { key: 'period_start', header: 'Period Start', render: (r: Incentive) => formatDate(r.period_start), sortable: true },
    { key: 'period_end', header: 'Period End', render: (r: Incentive) => formatDate(r.period_end) },
    { key: 'product_brand', header: 'Brand', render: (r: Incentive) => r.product_brand ?? 'All Unilever' },
    { key: 'product_sku', header: 'SKU', render: (r: Incentive) => r.product_sku ?? 'All SKUs' },
    { key: 'incentive_type', header: 'Type', render: (r: Incentive) => r.incentive_type ?? '-' },
    { key: 'incentive_value', header: 'Value (THB)', align: 'right' as const, render: (r: Incentive) => r.incentive_value ? formatTHB(r.incentive_value) : '-' },
    { key: 'description', header: 'Description', render: (r: Incentive) => r.description ?? '-' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Gift className="h-6 w-6 text-[#003DA6]" />
        <div>
          <h1 className="text-2xl font-bold">Incentives & Bonuses</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Unilever incentive programs and conditions</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active Incentive Programs</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <DataTable
              data={(data ?? []) as unknown as Record<string, unknown>[]}
              columns={columns as never}
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Upload incentive data via <strong>Upload Data</strong> page using the <strong>Incentive / Bonus Data</strong> file type.
            Incentive conditions are set by Unilever per period.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
