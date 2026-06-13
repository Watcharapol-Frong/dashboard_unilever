'use client'

import { ChartCard } from '@/components/dashboard/ChartCard'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts'

type ChartRow = { label: string; sales: number; target: number }

const fmt = (v: number) =>
  v >= 1_000_000 ? `฿${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `฿${(v / 1_000).toFixed(0)}K`
  : `฿${v.toFixed(0)}`

export default function SalesChart({ data }: { data: ChartRow[] }) {
  return (
    <ChartCard title="HOC Sales vs Target — by Month" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={64} />
        <Tooltip
          formatter={(v: number, name: string) => [fmt(v), name]}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sales" name="HOC Sales" fill="#003DA6" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar dataKey="target" name="Target"   fill="#d1d5db" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ChartCard>
  )
}
