'use client'

import { useMemo } from 'react'
import { fmt } from '@/lib/formatters'

type Stage = { label: string; value: number }
type Props  = { stages: Stage[]; title?: string }

const SVG_W = 400
const SVG_H = 110

export function SalesFunnelChart({ stages, title = 'Sales Funnel' }: Props) {
  const n = stages.length
  if (n === 0) return null

  const { areaPath, linePath } = useMemo(() => {
    const maxVal = Math.max(...stages.map(s => s.value), 1)
    const colW   = SVG_W / n
    const cx     = (i: number) => (i + 0.5) * colW

    // y from SVG top — tallest column reaches near the top (10% padding)
    const topY = stages.map(s => SVG_H * (1 - (s.value / maxVal) * 0.9))

    let line = `M 0 ${topY[0]} L ${cx(0)} ${topY[0]}`
    for (let i = 0; i < n - 1; i++) {
      const midX = (cx(i) + cx(i + 1)) / 2
      line += ` C ${midX} ${topY[i]} ${midX} ${topY[i + 1]} ${cx(i + 1)} ${topY[i + 1]}`
    }
    line += ` L ${SVG_W} ${topY[n - 1]}`

    const area = `${line} L ${SVG_W} ${SVG_H} L 0 ${SVG_H} Z`
    return { areaPath: area, linePath: line }
  }, [stages, n])

  const colW = SVG_W / n

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>

      {/* Column headers */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {stages.map((s, i) => (
          <div key={i} className={i > 0 ? 'pl-3 border-l border-border/50' : ''}>
            <p className="text-[11px] text-muted-foreground leading-none mb-1">{s.label}</p>
            <p className="text-xl font-bold tabular-nums tracking-tight">{fmt(s.value)}</p>
          </div>
        ))}
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        preserveAspectRatio="none"
        className="block overflow-hidden rounded-md"
      >
        <defs>
          <linearGradient id="funnel-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#93c5fd" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.30" />
          </linearGradient>
        </defs>

        {/* Filled area */}
        <path d={areaPath} fill="url(#funnel-grad)" />

        {/* Top curve */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

        {/* Column dividers — white lines that cut through the fill */}
        {Array.from({ length: n - 1 }, (_, i) => (
          <line
            key={i}
            x1={(i + 1) * colW} y1={0}
            x2={(i + 1) * colW} y2={SVG_H}
            stroke="white"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  )
}
