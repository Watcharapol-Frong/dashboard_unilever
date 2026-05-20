'use client'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'
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
  const { data } = useSWR<Incentive[]>('/api/config/incentives', fetcher)

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
          <DataTable
            data={data ?? []}
            columns={columns}
            searchKey="product_brand"
          />
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
