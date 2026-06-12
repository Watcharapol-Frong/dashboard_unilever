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
    header: "Segment",
    cell: ({ row }) => row.original.dynamic_cmg ?? "-",
  },
  {
    accessorKey: "agent",
    header: "Agent",
    cell: ({ row }) => row.original.agent ?? "-",
  },
  {
    accessorKey: "call_status",
    header: "Call Status",
    cell: ({ row }) => {
      const raw = row.original.call_status
      if (!raw) return <span className="text-muted-foreground">—</span>
      const isOrder    = raw === 'สั่งซื้อสินค้าเรียบร้อย' || raw === 'สั่งสินค้าอื่นๆ'
      const isNoAnswer = raw.startsWith('ไม่รับสาย') || raw === 'ปิดเครื่อง/ติดต่อไม่ได้'
      return (
        <Badge
          variant={isOrder ? 'default' : isNoAnswer ? 'secondary' : 'outline'}
          className="text-[10px] whitespace-nowrap px-1.5 py-0"
        >
          {raw}
        </Badge>
      )
    },
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
