"use client"

import { ColumnDef } from "@tanstack/react-table"
import { formatTHB, formatDate } from "@/lib/formatters"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

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

export const columns: ColumnDef<Incentive>[] = [
  {
    accessorKey: "period_start",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Period Start" />
    ),
    cell: ({ row }) => formatDate(row.original.period_start),
  },
  {
    accessorKey: "period_end",
    header: "Period End",
    cell: ({ row }) => formatDate(row.original.period_end),
  },
  {
    accessorKey: "product_brand",
    header: "Brand",
    cell: ({ row }) => row.original.product_brand ?? 'All Unilever',
  },
  {
    accessorKey: "product_sku",
    header: "SKU",
    cell: ({ row }) => row.original.product_sku ?? 'All SKUs',
  },
  {
    accessorKey: "incentive_type",
    header: "Type",
    cell: ({ row }) => row.original.incentive_type ?? '-',
  },
  {
    accessorKey: "incentive_value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Value (THB)" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.incentive_value ? formatTHB(row.original.incentive_value) : '-'}
      </div>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => row.original.description ?? '-',
  },
]
