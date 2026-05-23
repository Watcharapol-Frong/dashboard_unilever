"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { cn } from "@/lib/utils"

export type OverviewRow = {
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

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)
const fmtBaht = (n: number) => `฿${fmt(n)}`

export const overviewColumns: ColumnDef<OverviewRow>[] = [
  {
    accessorKey: "month_label",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Month" />,
    cell: ({ row }) => <span className="font-medium text-sm">{row.original.month_label}</span>,
  },
  {
    accessorKey: "dynamic_cmg",
    header: ({ column }) => <DataTableColumnHeader column={column} title="CMG" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.dynamic_cmg}</span>
    ),
  },
  {
    accessorKey: "hoc_sales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="HOC Sales" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm font-medium">
        {fmtBaht(row.original.hoc_sales)}
      </div>
    ),
  },
  {
    accessorKey: "sales_target",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Target" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm text-muted-foreground">
        {row.original.sales_target > 0 ? fmtBaht(row.original.sales_target) : '—'}
      </div>
    ),
  },
  {
    accessorKey: "achievement_ratio",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Achievement" className="justify-end" />
    ),
    cell: ({ row }) => {
      const v = row.original.achievement_ratio * 100
      const color =
        v >= 100 ? 'bg-green-100 text-green-700' :
        v >= 80  ? 'bg-yellow-100 text-yellow-700' :
        'bg-red-100 text-red-600'
      return (
        <div className="text-right">
          <span className={cn('inline-block px-1.5 py-0.5 rounded text-xs font-medium', color)}>
            {v.toFixed(1)}%
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "new_customers",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="New" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm">{row.original.new_customers}</div>
    ),
  },
  {
    accessorKey: "retention",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Retention" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm">{row.original.retention}</div>
    ),
  },
  {
    accessorKey: "roi",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ROI" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm">
        {row.original.roi > 0
          ? `${row.original.roi.toFixed(2)}x`
          : <span className="text-muted-foreground/40">—</span>}
      </div>
    ),
  },
]
