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
  lead_customers: string
  dynamic_cmg: string
  total_calls: number
  reached: number
  ordered: number
  new_customers: number
  retention: number
  hoc_orders: number
  hoc_sales: number
  actual_sales: number
  sales_target: number
  achievement_ratio: number
  total_incentive: number
  total_agent_cost: number
  total_expense: number
  roi: number
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data as Row[])

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : n.toFixed(0)

const fmtBaht = (n: number) => `฿${fmt(n)}`

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useSWR<Row[]>('/api/data/overview', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const months        = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const leadOptions   = useMemo(() => ['all', ...new Set(rows.map(r => r.lead_customers)).values()], [rows])
  const cmgOptions    = useMemo(() => ['all', ...new Set(rows.map(r => r.dynamic_cmg)).values()], [rows])

  const [filterLead, setFilterLead] = useState('all')
  const [filterCmg,  setFilterCmg]  = useState('all')
  const [filterFrom, setFilterFrom] = useState('all')
  const [filterTo,   setFilterTo]   = useState('all')

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterLead !== 'all' && r.lead_customers !== filterLead) return false
      if (filterCmg  !== 'all' && r.dynamic_cmg    !== filterCmg)  return false
      if (filterFrom !== 'all' && r.month < filterFrom) return false
      if (filterTo   !== 'all' && r.month > filterTo)   return false
      return true
    })
  }, [rows, filterLead, filterCmg, filterFrom, filterTo])

  // KPIs — sum across filtered rows
  const kpi = useMemo(() => {
    const sum = (key: keyof Row) => filtered.reduce((a, r) => a + (r[key] as number), 0)
    const hoc_sales     = sum('hoc_sales')
    const sales_target  = sum('sales_target')
    const total_expense = sum('total_expense')
    return {
      hoc_sales,
      sales_target,
      achievement:   sales_target > 0 ? (hoc_sales / sales_target) * 100 : 0,
      new_customers: sum('new_customers'),
      retention:     sum('retention'),
      total_calls:   sum('total_calls'),
      reached:       sum('reached'),
      roi:           total_expense > 0 ? hoc_sales / total_expense : 0,
    }
  }, [filtered])

  // Monthly chart data — group by month
  const byMonth = useMemo(() => {
    const map = new Map<string, {
      month: string; month_label: string
      hoc_sales: number; sales_target: number
      new_customers: number; retention: number; roi_sum: number; roi_count: number
    }>()
    for (const r of filtered) {
      const k = r.month
      if (!map.has(k)) map.set(k, { month: r.month, month_label: r.month_label, hoc_sales: 0, sales_target: 0, new_customers: 0, retention: 0, roi_sum: 0, roi_count: 0 })
      const m = map.get(k)!
      m.hoc_sales     += r.hoc_sales
      m.sales_target  += r.sales_target
      m.new_customers += r.new_customers
      m.retention     += r.retention
      if (r.roi > 0) { m.roi_sum += r.roi; m.roi_count++ }
    }
    return [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        achievement: m.sales_target > 0 ? Math.round((m.hoc_sales / m.sales_target) * 100) : 0,
        roi: m.roi_count > 0 ? Math.round((m.roi_sum / m.roi_count) * 100) / 100 : 0,
      }))
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

        <Select value={filterLead} onValueChange={setFilterLead}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Lead Customers" />
          </SelectTrigger>
          <SelectContent>
            {leadOptions.map(v => (
              <SelectItem key={v} value={v}>{v === 'all' ? 'ทุก Lead' : v}</SelectItem>
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

        {(filterLead !== 'all' || filterCmg !== 'all' || filterFrom !== 'all' || filterTo !== 'all') && (
          <button
            onClick={() => { setFilterLead('all'); setFilterCmg('all'); setFilterFrom('all'); setFilterTo('all') }}
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
          value={`${kpi.roi.toFixed(2)}x`}
          sub="ยอดขาย / ค่าใช้จ่าย"
          highlight={kpi.roi >= 10 ? 'green' : kpi.roi >= 5 ? 'yellow' : 'red'}
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
                  if (name === 'achievement') return [`${value}%`, 'Achievement']
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

      {/* New vs Retention */}
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
                <Bar dataKey="new_customers" name="New" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
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
                <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={v => `${v}x`} />
                <Tooltip formatter={(v: number) => [`${v}x`, 'ROI']} />
                <Line dataKey="roi" name="ROI" type="monotone" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">ตารางสรุปรายเดือน</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">เดือน</th>
                <th className="text-left py-2 pr-3 font-medium">Lead</th>
                <th className="text-left py-2 pr-3 font-medium">CMG</th>
                <th className="text-right py-2 pr-3 font-medium">HOC Sales</th>
                <th className="text-right py-2 pr-3 font-medium">Target</th>
                <th className="text-right py-2 pr-3 font-medium">Achievement</th>
                <th className="text-right py-2 pr-3 font-medium">New</th>
                <th className="text-right py-2 pr-3 font-medium">Retention</th>
                <th className="text-right py-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-1.5 pr-3">{r.month_label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.lead_customers}</td>
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
  const color = highlight === 'green' ? 'text-green-600' : highlight === 'yellow' ? 'text-yellow-600' : highlight === 'red' ? 'text-red-500' : ''
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
  const color = value >= 100 ? 'bg-green-100 text-green-700' : value >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>{value.toFixed(1)}%</span>
}
