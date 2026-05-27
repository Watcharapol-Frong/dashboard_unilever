"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { formatTHB, formatNumber, formatDate } from "@/lib/formatters"
import { RecentOrder } from "@/types"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export const columns: ColumnDef<RecentOrder>[] = [
  {
    accessorKey: "order_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatDate(row.original.order_date),
  },
  {
    accessorKey: "order_number",
    header: "Order #",
  },
  {
    accessorKey: "mmid",
    header: "MMID",
    cell: ({ row }) => row.original.mmid ?? "-",
  },
  {
    accessorKey: "prod_num",
    header: "Product #",
    cell: ({ row }) => row.original.prod_num ?? "-",
  },
  {
    accessorKey: "dynamic_cmg",
    header: "CMG",
    cell: ({ row }) => row.original.dynamic_cmg ?? "-",
  },
  {
    accessorKey: "agent",
    header: "Agent",
    cell: ({ row }) => row.original.agent ?? "-",
  },
  {
    accessorKey: "sales_qty",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Qty" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatNumber(row.original.sales_qty)}
      </div>
    ),
  },
  {
    accessorKey: "sales_in_vat",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount (incl. VAT)" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatTHB(row.original.sales_in_vat)}
      </div>
    ),
  },
  {
    accessorKey: "channel",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Channel" className="justify-center" />
    ),
    cell: ({ row }) => (
      <div className="flex justify-center">
        <Badge variant={row.original.channel === 'Online' ? 'default' : 'secondary'}>
          {row.original.channel}
        </Badge>
      </div>
    ),
  },
]
