"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { formatTHB, formatNumber, formatPct } from "@/lib/utils"
import { ProductRow } from "@/types"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export const columns: ColumnDef<ProductRow>[] = [
  {
    accessorKey: "prod_num",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Product #" />
    ),
  },
  {
    accessorKey: "brands",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Brand" />
    ),
    cell: ({ row }) => row.original.brands ?? "-",
  },
  {
    accessorKey: "product_name_th",
    header: "Product Name (TH)",
    cell: ({ row }) => (
      <div className="max-w-[400px] truncate" title={row.original.product_name_th ?? ""}>
        {row.original.product_name_th ?? "-"}
      </div>
    ),
  },
  {
    accessorKey: "is_uni_hoc_pd",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Unilever HOC" className="justify-center" />
    ),
    cell: ({ row }) => row.original.is_uni_hoc_pd ? (
      <div className="flex justify-center">
        <Badge variant="default" className="text-xs">Unilever</Badge>
      </div>
    ) : (
      <div className="flex justify-center">
        <span className="text-muted-foreground text-xs">—</span>
      </div>
    ),
  },
  {
    accessorKey: "total_qty",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Qty Sold" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatNumber(row.original.total_qty)}
      </div>
    ),
  },
  {
    accessorKey: "total_sales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Revenue (THB)" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatTHB(row.original.total_sales)}
      </div>
    ),
  },
  {
    accessorKey: "pct_of_total",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="% of Total" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatPct(row.original.pct_of_total)}
      </div>
    ),
  },
]
