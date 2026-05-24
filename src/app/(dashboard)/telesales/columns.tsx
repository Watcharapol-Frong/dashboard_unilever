"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { formatNumber, formatPct } from "@/lib/formatters"
import { AgentPerformance } from "@/types"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export const columns: ColumnDef<AgentPerformance>[] = [
  {
    accessorKey: "agent",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Agent" />
    ),
    cell: ({ row }) => row.original.agent ?? "-",
  },
  {
    accessorKey: "total_calls",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Calls" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatNumber(row.original.total_calls)}
      </div>
    ),
  },
  {
    accessorKey: "reached",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reached" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatNumber(row.original.reached)}
      </div>
    ),
  },
  {
    accessorKey: "not_reached",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Not Reached" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatNumber(row.original.not_reached)}
      </div>
    ),
  },
  {
    accessorKey: "reach_rate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reach Rate" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Badge variant={row.original.reach_rate >= 0.7 ? 'success' : row.original.reach_rate >= 0.5 ? 'warning' : 'destructive'}>
          {formatPct(row.original.reach_rate)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "conversion_rate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversion" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Badge variant={row.original.conversion_rate >= 0.15 ? 'success' : row.original.conversion_rate >= 0.08 ? 'warning' : 'destructive'}>
          {formatPct(row.original.conversion_rate)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "calls_per_day",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Calls/Day" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right text-sm tabular-nums">
        {row.original.calls_per_day.toFixed(1)}
      </div>
    ),
  },
]
