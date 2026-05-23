'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, BarChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Row = {
  month: string
  month_label: string
  dynamic_cmg: string
  total_calls: number
  reached: number
  ordered: number
  new_customers: number
  retention: number
  hoc_orders: number
  hoc_sales: number
  sales_target: number
  achievement_ratio: number
  total_incentive: number
  total_agent_cost: number
  total_expense: number
  roi: number
}

type Agg = {
  hoc_sales: number
  new_customers: number
  retention: number
  ordered: number
  hoc_orders: number
  total_incentive: number
  sales_target: number
  total_calls: number
  reached: number
  total_agent_cost: number
  total_expense: number
  roi: number
  achievement: number
}

// mart_performance grain: (month, dynamic_cmg)
// total_calls/reached/total_incentive/total_agent_cost are month-level — dedup by month before summing
function aggregate(rows: Row[]): Agg {
  const s = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0)

  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')

  const monthSeen = new Set<string>()
  let total_calls = 0, reached = 0, total_incentive = 0, total_agent_cost = 0
  for (const r of rows) {
    if (!monthSeen.has(r.month)) {
      monthSeen.add(r.month)
      total_calls      += r.total_calls
      reached          += r.reached
      total_incentive  += r.total_incentive
      total_agent_cost += r.total_agent_cost
    }
  }

  const total_expense = total_incentive + total_agent_cost
  const roi           = total_expense > 0 ? hoc_sales  / total_expense : 0
  const achievement   = sales_target  > 0 ? (hoc_sales / sales_target) * 100 : 0

  return {
    hoc_sales, new_customers, retention, ordered, hoc_orders, total_incentive,
    sales_target, total_calls, reached,
    total_agent_cost, total_expense, roi, achievement,
  }
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(d => d.data as Row[])

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

const fmtBaht = (n: number) => `฿${fmt(n)}`

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useSWR<Row[]>('/api/data/overview', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const months     = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const cmgOptions = useMemo(() => ['all', ...[...new Set(rows.map(r => r.dynamic_cmg))]], [rows])

  const [filterCmg,  setFilterCmg]  = useState('all')
  const [filterFrom, setFilterFrom] = useState('all')
  const [filterTo,   setFilterTo]   = useState('all')

  const filtered = useMemo(() => rows.filter(r => {
    if (filterCmg  !== 'all' && r.dynamic_cmg !== filterCmg)  return false
    if (filterFrom !== 'all' && r.month < filterFrom) return false
    if (filterTo   !== 'all' && r.month > filterTo)   return false
    return true
  }), [rows, filterCmg, filterFrom, filterTo])

  const kpi = useMemo(() => aggregate(filtered), [filtered])

  const byMonth = useMemo(() => {
    const monthSet = [...new Set(filtered.map(r => r.month))].sort()
    return monthSet.map(month => {
      const mRows = filtered.filter(r => r.month === month)
      const agg = aggregate(mRows)
      const label = mRows[0]?.month_label ?? month
      return { month, month_label: label, ...agg }
    })
  }, [filtered])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        กำลังโหลดข้อมูล...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <p>ยังไม่มีข้อมูล</p>
        <p className="text-xs">กรุณา Build Mart ก่อนใช้งาน</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterFrom} onValueChange={setFilterFrom}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="จากเดือน" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {new Date(m).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTo} onValueChange={setFilterTo}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="ถึงเดือน" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {new Date(m).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCmg} onValueChange={setFilterCmg}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Dynamic CMG" />
          </SelectTrigger>
          <SelectContent>
            {cmgOptions.map(v => (
              <SelectItem key={v} value={v}>{v === 'all' ? 'ทุก CMG' : v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filterCmg !== 'all' || filterFrom !== 'all' || filterTo !== 'all') && (
          <button
            onClick={() => { setFilterCmg('all'); setFilterFrom('all'); setFilterTo('all') }}
            className="text-xs text-muted-foreground underline"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard title="HOC Sales" value={fmtBaht(kpi.hoc_sales)} sub={`เป้า ${fmtBaht(kpi.sales_target)}`} />
        <KpiCard
          title="Achievement"
          value={`${kpi.achievement.toFixed(1)}%`}
          sub={kpi.achievement >= 100 ? 'บรรลุเป้า ✓' : 'ต่ำกว่าเป้า'}
          highlight={kpi.achievement >= 100 ? 'green' : kpi.achievement >= 80 ? 'yellow' : 'red'}
        />
        <KpiCard title="New Customers" value={kpi.new_customers.toLocaleString()} sub="ลูกค้าใหม่ HOC" />
        <KpiCard title="Retention" value={kpi.retention.toLocaleString()} sub="ลูกค้าซื้อซ้ำ HOC" />
        <KpiCard title="Total Calls" value={kpi.total_calls.toLocaleString()} sub={`รับสาย ${kpi.reached.toLocaleString()}`} />
        <KpiCard
          title="ROI"
          value={kpi.roi > 0 ? `${kpi.roi.toFixed(2)}x` : '—'}
          sub="ยอดขาย HOC / ค่าใช้จ่ายรวม"
          highlight={kpi.roi >= 10 ? 'green' : kpi.roi >= 5 ? 'yellow' : kpi.roi > 0 ? 'red' : undefined}
        />
      </div>

      {/* Sales vs Target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">HOC Sales vs Target รายเดือน</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={byMonth} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="sales" tickFormatter={fmt} tick={{ fontSize: 11 }} width={56} />
              <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'achievement') return [`${value.toFixed(1)}%`, 'Achievement']
                  return [fmtBaht(value), name === 'hoc_sales' ? 'HOC Sales' : 'Target']
                }}
              />
              <Legend />
              <Bar yAxisId="sales" dataKey="hoc_sales" name="HOC Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="sales" dataKey="sales_target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              <Line yAxisId="pct" dataKey="achievement" name="achievement" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* New vs Retention + ROI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">New vs Retention Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip />
                <Legend />
                <Bar dataKey="new_customers" name="New" stackId="a" fill="#22c55e" />
                <Bar dataKey="retention" name="Retention" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">ROI รายเดือน (เท่า)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v}x`} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}x`, 'ROI']} />
                <Line dataKey="roi" name="ROI" type="monotone" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">ตารางรายละเอียด</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">เดือน</th>
                <th className="text-left py-2 pr-3 font-medium">CMG</th>
                <th className="text-right py-2 pr-3 font-medium">HOC Sales</th>
                <th className="text-right py-2 pr-3 font-medium">Target</th>
                <th className="text-right py-2 pr-3 font-medium">Achiev.</th>
                <th className="text-right py-2 pr-3 font-medium">New</th>
                <th className="text-right py-2 pr-3 font-medium">Retention</th>
                <th className="text-right py-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-1.5 pr-3">{r.month_label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.dynamic_cmg}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBaht(r.hoc_sales)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtBaht(r.sales_target)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    <AchievementBadge value={r.achievement_ratio * 100} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.new_customers}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.retention}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.roi > 0 ? `${r.roi.toFixed(2)}x` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({ title, value, sub, highlight }: {
  title: string
  value: string
  sub?: string
  highlight?: 'green' | 'yellow' | 'red'
}) {
  const color =
    highlight === 'green'  ? 'text-green-600' :
    highlight === 'yellow' ? 'text-yellow-600' :
    highlight === 'red'    ? 'text-red-500' : ''
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function AchievementBadge({ value }: { value: number }) {
  const color =
    value >= 100 ? 'bg-green-100 text-green-700' :
    value >= 80  ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {value.toFixed(1)}%
    </span>
  )
}
