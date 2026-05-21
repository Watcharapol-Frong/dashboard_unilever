'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const ATTR_PRESETS = [14, 30, 90, 365] as const

interface ExportConfig {
  from: string
  to: string
  attr: number | 'custom'
  customDays: string
}

const EXPORT_PRESETS: { label: string; from: string; to: string }[] = [
  { label: 'Feb – Apr 2026', from: '2026-02-01', to: '2026-04-30' },
  { label: 'Q1 2026',        from: '2026-01-01', to: '2026-03-31' },
  { label: 'Last 3 months',  from: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
]

export default function ExportsPage() {
  const [cfg, setCfg] = useState<ExportConfig>({
    from:       '2026-02-01',
    to:         '2026-04-30',
    attr:       365,
    customDays: '',
  })
  const [loading, setLoading] = useState(false)

  const effectiveDays = cfg.attr === 'custom' ? Number(cfg.customDays) || 365 : cfg.attr

  const update = (patch: Partial<ExportConfig>) => setCfg(prev => ({ ...prev, ...patch }))

  const handleExport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        from:        cfg.from,
        to:          cfg.to,
        attribution: String(effectiveDays),
      })
      const res = await fetch(`/api/system/export?${params}`)
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        alert(error ?? 'Export failed')
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'export.csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  const canExport = cfg.from && cfg.to && cfg.from <= cfg.to &&
    !(cfg.attr === 'custom' && !cfg.customDays)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export telesales-attributed sales data as CSV — HOC Unilever products only
        </p>
      </div>

      {/* Telesales Attribution Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telesales Attribution Export</CardTitle>
          <p className="text-sm text-muted-foreground">
            Columns: <code className="bg-muted px-1 rounded text-xs">channel, dynamic_cmg, month, brands, prod_num, sum_sales, sum_qty, frequency</code>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Quick presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {EXPORT_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => update({ from: p.from, to: p.to })}
                  disabled={loading}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border transition-all disabled:opacity-50',
                    cfg.from === p.from && cfg.to === p.to
                      ? 'bg-[#003DA6] text-white border-[#003DA6]'
                      : 'text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={cfg.from}
                onChange={e => update({ from: e.target.value })}
                disabled={loading}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6] disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={cfg.to}
                onChange={e => update({ to: e.target.value })}
                disabled={loading}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Attribution window */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Attribution Window</label>
            <div className="flex flex-wrap gap-2 items-center">
              {ATTR_PRESETS.map(d => (
                <button
                  key={d}
                  onClick={() => update({ attr: d })}
                  disabled={loading}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-lg border transition-all disabled:opacity-50',
                    cfg.attr === d
                      ? 'bg-[#003DA6] text-white border-[#003DA6]'
                      : 'bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground',
                  )}
                >
                  {d}d{d === 365 ? ' (default)' : ''}
                </button>
              ))}
              <button
                onClick={() => update({ attr: 'custom' })}
                disabled={loading}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-lg border transition-all disabled:opacity-50',
                  cfg.attr === 'custom'
                    ? 'bg-[#003DA6] text-white border-[#003DA6]'
                    : 'bg-background text-muted-foreground border-gray-200 hover:border-[#003DA6] hover:text-foreground',
                )}
              >
                Custom
              </button>
              {cfg.attr === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={730}
                    value={cfg.customDays}
                    onChange={e => update({ customDays: e.target.value })}
                    placeholder="days"
                    disabled={loading}
                    className="w-20 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6] disabled:opacity-50"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Purchase within <strong>{effectiveDays} days</strong> of the first connected call = telesales attributed
            </p>
          </div>

          {/* Summary + button */}
          <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date range</span>
              <span className="font-medium">{cfg.from} → {cfg.to}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Attribution window</span>
              <span className="font-medium">{effectiveDays} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filename</span>
              <span className="font-medium text-xs tabular-nums text-muted-foreground">
                telesales_attributed_{cfg.from}_{cfg.to}_attr{effectiveDays}d.csv
              </span>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading || !canExport}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#003DA6] text-white text-sm font-medium hover:bg-[#002d80] transition-colors disabled:opacity-50"
          >
            {loading
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {loading ? 'Exporting…' : 'Download CSV'}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
