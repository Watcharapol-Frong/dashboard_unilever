'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Mode = 'weekly' | 'monthly' | 'custom'

type OverviewRow = {
  period_key:       string
  period_label:     string
  dynamic_cmg:      string
  total_calls:      number
  reached:          number
  ordered:          number
  new_customers:    number
  retention:        number
  hoc_orders:       number
  hoc_sales:        number
  sales_target:     number
  achievement_ratio:number
  total_incentive:  number
  total_agent_cost: number
  total_expense:    number
  roi:              number
}

type Agg = {
  hoc_sales: number; new_customers: number; retention: number
  ordered: number; hoc_orders: number; total_calls: number
  reached: number; sales_target: number; total_expense: number; roi: number; achievement: number
}

function aggregate(rows: OverviewRow[]): Agg {
  const s = (k: keyof OverviewRow) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')

  const seen = new Set<string>()
  let total_calls = 0, reached = 0, total_expense = 0
  for (const r of rows) {
    if (!seen.has(r.period_key)) {
      seen.add(r.period_key)
      total_calls   += r.total_calls
      reached       += r.reached
      total_expense += r.total_expense
    }
  }

  const roi         = total_expense > 0 ? hoc_sales / total_expense : 0
  const achievement = sales_target  > 0 ? (hoc_sales / sales_target) * 100 : 0
  return { hoc_sales, new_customers, retention, ordered, hoc_orders, total_calls, reached, sales_target, total_expense, roi, achievement }
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(d => {
    if (!d.ok) throw new Error(d.error ?? 'API error')
    return d.data as OverviewRow[]
  })

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

const fmtBaht = (n: number) => `฿${fmt(n)}`

function todayStr() { return new Date().toISOString().slice(0, 10) }
function weeksAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n * 7)
  return d.toISOString().slice(0, 10)
}

// Shorten weekly label for chart axis: "W01-06/Jan-12/Jan" → "06/Jan"
function shortLabel(label: string, mode: Mode) {
  if (mode === 'monthly') return label
  const m = label.match(/W\d+-(\d+\/\w+)/)
  return m ? m[1] : label
}

export default function OverviewClient() {
  const [mode,       setMode]       = useState<Mode>('weekly')
  const [weekFrom,   setWeekFrom]   = useState(weeksAgoStr(8))
  const [weekTo,     setWeekTo]     = useState(todayStr())
  const [monthFrom,  setMonthFrom]  = useState('all')
  const [monthTo,    setMonthTo]    = useState('all')
  const [customFrom, setCustomFrom] = useState(weeksAgoStr(4))
  const [customTo,   setCustomTo]   = useState(todayStr())
  const [filterCmg,  setFilterCmg]  = useState('all')

  const apiUrl = useMemo(() => {
    if (mode === 'monthly') {
      const p = new URLSearchParams({ mode: 'monthly' })
      if (monthFrom !== 'all') p.set('from', monthFrom)
      if (monthTo   !== 'all') p.set('to',   monthTo)
      return `/api/data/overview?${p}`
    }
    const from = mode === 'custom' ? customFrom : weekFrom
    const to   = mode === 'custom' ? customTo   : weekTo
    return `/api/data/overview?mode=weekly&from=${from}&to=${to}`
  }, [mode, weekFrom, weekTo, monthFrom, monthTo, customFrom, customTo])

  const { data: rows = [], isLoading, error } = useSWR<OverviewRow[]>(apiUrl, fetcher, {
    revalidateOnFocus:    false,
    revalidateOnReconnect:false,
    dedupingInterval:     60_000,
  })

  const periodKeys = useMemo(() => [...new Set(rows.map(r => r.period_key))].sort(), [rows])
  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))].sort(), [rows])

  const filtered = useMemo(() =>
    rows.filter(r => filterCmg === 'all' || r.dynamic_cmg === filterCmg),
    [rows, filterCmg]
  )

  const kpi = useMemo(() => aggregate(filtered), [filtered])

  const byPeriod = useMemo(() =>
    periodKeys.map(pk => {
      const pRows = filtered.filter(r => r.period_key === pk)
      const agg   = aggregate(pRows)
      return { period_key: pk, period_label: pRows[0]?.period_label ?? pk, ...agg }
    }),
    [filtered, periodKeys]
  )

  const isMonthly = mode === 'monthly'
  const hasTarget = isMonthly && kpi.sales_target > 0

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">กำลังโหลดข้อมูล...</div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500 text-sm">โหลดข้อมูลไม่สำเร็จ: {error.message}</div>
  )

  return (
    <div className="space-y-5">

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 border rounded-lg p-1 w-fit bg-muted/30">
        {(['weekly', 'monthly', 'custom'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-white dark:bg-zinc-800 shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'weekly' ? 'สัปดาห์' : m === 'monthly' ? 'เดือน' : 'กำหนดเอง'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {mode === 'weekly' && (
          <>
            <DateInput label="จาก" value={weekFrom} onChange={setWeekFrom} />
            <DateInput label="ถึง"  value={weekTo}   onChange={setWeekTo} />
          </>
        )}
        {mode === 'monthly' && (
          <>
            <MonthSelect label="จากเดือน" value={monthFrom} onChange={setMonthFrom} options={periodKeys} />
            <MonthSelect label="ถึงเดือน" value={monthTo}   onChange={setMonthTo}   options={periodKeys} />
          </>
        )}
        {mode === 'custom' && (
          <>
            <DateInput label="จากวันที่" value={customFrom} onChange={setCustomFrom} />
            <DateInput label="ถึงวันที่" value={customTo}   onChange={setCustomTo} />
          </>
        )}
        {cmgOptions.length > 0 && (
          <Select value={filterCmg} onValueChange={setFilterCmg}>
            <SelectTrigger className="h-8 w-full sm:w-44 text-sm">
              <SelectValue placeholder="Dynamic CMG" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุก CMG</SelectItem>
              {cmgOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterCmg !== 'all' && (
          <button onClick={() => setFilterCmg('all')} className="text-xs text-muted-foreground underline">
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
          <p>ไม่พบข้อมูลในช่วงที่เลือก</p>
          <p className="text-xs">{isMonthly ? 'กรุณา Build Mart ก่อนใช้งาน' : 'ลองขยายช่วงวันที่ หรือ Build Mart ก่อน'}</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <KpiCard title="HOC Sales" value={fmtBaht(kpi.hoc_sales)}
              sub={hasTarget ? `เป้า ${fmtBaht(kpi.sales_target)}` : undefined} />
            {hasTarget && (
              <KpiCard
                title="Achievement" value={`${kpi.achievement.toFixed(1)}%`}
                sub={kpi.achievement >= 100 ? 'บรรลุเป้า ✓' : 'ต่ำกว่าเป้า'}
                highlight={kpi.achievement >= 100 ? 'green' : kpi.achievement >= 80 ? 'yellow' : 'red'}
              />
            )}
            <KpiCard title="New Customers" value={kpi.new_customers.toLocaleString()} sub="ลูกค้าใหม่ HOC" />
            <KpiCard title="Retention"     value={kpi.retention.toLocaleString()}     sub="ลูกค้าซื้อซ้ำ HOC" />
            <KpiCard title="Total Calls"   value={kpi.total_calls.toLocaleString()}   sub={`รับสาย ${kpi.reached.toLocaleString()}`} />
            {isMonthly && kpi.roi > 0 && (
              <KpiCard
                title="ROI" value={`${kpi.roi.toFixed(2)}x`}
                sub="ยอดขาย HOC / ค่าใช้จ่ายรวม"
                highlight={kpi.roi >= 10 ? 'green' : kpi.roi >= 5 ? 'yellow' : 'red'}
              />
            )}
          </div>

          {/* HOC Sales Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {isMonthly ? 'HOC Sales vs Target รายเดือน' : 'HOC Sales รายสัปดาห์'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={byPeriod.map(d => ({ ...d, period_label: shortLabel(d.period_label, mode) }))}
                  margin={{ top: 4, right: 16, bottom: isMonthly ? 4 : 20, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11 }}
                    angle={isMonthly ? 0 : -35} textAnchor={isMonthly ? 'middle' : 'end'}
                    height={isMonthly ? 30 : 52} />
                  <YAxis yAxisId="sales" tickFormatter={fmt} tick={{ fontSize: 11 }} width={56} />
                  {hasTarget && (
                    <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={44} />
                  )}
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'achievement')  return [`${value.toFixed(1)}%`, 'Achievement']
                      if (name === 'hoc_sales')    return [fmtBaht(value), 'HOC Sales']
                      if (name === 'sales_target') return [fmtBaht(value), 'Target']
                      return [value, name]
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="sales" dataKey="hoc_sales" name="HOC Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  {hasTarget && (
                    <>
                      <Bar yAxisId="sales" dataKey="sales_target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="pct" dataKey="achievement" name="achievement" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* New vs Retention + (Calls or ROI) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">New vs Retention Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={byPeriod.map(d => ({ ...d, period_label: shortLabel(d.period_label, mode) }))}
                    margin={{ top: 4, right: 8, bottom: isMonthly ? 4 : 20, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period_label" tick={{ fontSize: 11 }}
                      angle={isMonthly ? 0 : -35} textAnchor={isMonthly ? 'middle' : 'end'}
                      height={isMonthly ? 30 : 52} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="new_customers" name="New"       stackId="a" fill="#22c55e" />
                    <Bar dataKey="retention"     name="Retention" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {isMonthly ? 'ROI รายเดือน (เท่า)' : 'Calls รายสัปดาห์'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={byPeriod.map(d => ({ ...d, period_label: shortLabel(d.period_label, mode) }))}
                    margin={{ top: 4, right: 8, bottom: isMonthly ? 4 : 20, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period_label" tick={{ fontSize: 11 }}
                      angle={isMonthly ? 0 : -35} textAnchor={isMonthly ? 'middle' : 'end'}
                      height={isMonthly ? 30 : 52} />
                    <YAxis tick={{ fontSize: 11 }} width={48}
                      tickFormatter={isMonthly ? (v: number) => `${v}x` : undefined} />
                    <Tooltip
                      formatter={isMonthly
                        ? (v: number) => [`${v.toFixed(2)}x`, 'ROI']
                        : (v: number, n: string) => [v.toLocaleString(), n === 'total_calls' ? 'Total Calls' : 'Reached']}
                    />
                    <Legend />
                    {isMonthly
                      ? <Bar dataKey="roi" name="ROI" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      : <>
                          <Bar dataKey="total_calls" name="Total Calls" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="reached"     name="Reached"     fill="#3b82f6" radius={[2, 2, 0, 0]} />
                        </>
                    }
                  </BarChart>
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
                    <th className="text-left py-2 pr-3 font-medium">{isMonthly ? 'เดือน' : 'สัปดาห์'}</th>
                    <th className="text-left py-2 pr-3 font-medium">CMG</th>
                    <th className="text-right py-2 pr-3 font-medium">HOC Sales</th>
                    {hasTarget && <>
                      <th className="text-right py-2 pr-3 font-medium">Target</th>
                      <th className="text-right py-2 pr-3 font-medium">Achiev.</th>
                    </>}
                    <th className="text-right py-2 pr-3 font-medium">New</th>
                    <th className="text-right py-2 pr-3 font-medium">Retention</th>
                    {isMonthly && <th className="text-right py-2 font-medium">ROI</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.period_label}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.dynamic_cmg}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBaht(r.hoc_sales)}</td>
                      {hasTarget && <>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtBaht(r.sales_target)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          <AchievementBadge value={r.achievement_ratio * 100} />
                        </td>
                      </>}
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.new_customers}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.retention}</td>
                      {isMonthly && (
                        <td className="py-1.5 text-right tabular-nums">{r.roi > 0 ? `${r.roi.toFixed(2)}x` : '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DateInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <input
        type="date" value={value} onChange={e => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  )
}

function MonthSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full sm:w-36 text-sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map(m => (
          <SelectItem key={m} value={m}>
            {new Date(m).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function KpiCard({ title, value, sub, highlight }: {
  title: string; value: string; sub?: string; highlight?: 'green' | 'yellow' | 'red'
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
