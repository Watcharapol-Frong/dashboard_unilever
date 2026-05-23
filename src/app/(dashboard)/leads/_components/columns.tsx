"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { cn } from "@/lib/utils"

export type Lead = {
  mmid: string
  cust_name: string
  lead_customers: string
  contact_status: 'not_called' | 'called_not_reached' | 'reached'
  agent: string | null
  dynamic_cmg: string | null
  conversion_status: 'converted' | 'not_converted' | 'no_hoc_order'
  hoc_orders: number
  hoc_sales: number
}

const CONTACT_LABEL: Record<string, string> = {
  reached:            'Reached',
  called_not_reached: 'Not Reached',
  not_called:         'Not Called',
}
const CONTACT_COLOR: Record<string, string> = {
  reached:            'bg-green-100 text-green-700',
  called_not_reached: 'bg-yellow-100 text-yellow-700',
  not_called:         'bg-slate-100 text-slate-500',
}
const CONV_LABEL: Record<string, string> = {
  converted:     'Converted',
  not_converted: 'Not Converted',
  no_hoc_order:  'No Order',
}
const CONV_COLOR: Record<string, string> = {
  converted:     'bg-blue-100 text-blue-700',
  not_converted: 'bg-orange-100 text-orange-700',
  no_hoc_order:  'bg-slate-100 text-slate-500',
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)
const fmtBaht = (n: number) => `฿${fmt(n)}`

export const leadsColumns: ColumnDef<Lead>[] = [
  {
    accessorKey: "mmid",
    header: ({ column }) => <DataTableColumnHeader column={column} title="MMID" />,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.mmid}</span>
    ),
  },
  {
    accessorKey: "cust_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer Name" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.cust_name || <span className="text-muted-foreground/40">—</span>}
      </span>
    ),
  },
  {
    accessorKey: "lead_customers",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tier" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.lead_customers}</span>
    ),
  },
  {
    accessorKey: "dynamic_cmg",
    header: ({ column }) => <DataTableColumnHeader column={column} title="CMG" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.dynamic_cmg ?? <span className="text-muted-foreground/40">—</span>}
      </span>
    ),
  },
  {
    accessorKey: "agent",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.agent ?? <span className="text-muted-foreground/40">—</span>}
      </span>
    ),
  },
  {
    accessorKey: "contact_status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
    cell: ({ row }) => {
      const s = row.original.contact_status
      return (
        <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', CONTACT_COLOR[s])}>
          {CONTACT_LABEL[s]}
        </span>
      )
    },
  },
  {
    accessorKey: "conversion_status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Conversion" />,
    cell: ({ row }) => {
      const s = row.original.conversion_status
      return (
        <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', CONV_COLOR[s])}>
          {CONV_LABEL[s]}
        </span>
      )
    },
  },
  {
    accessorKey: "hoc_orders",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Orders" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm">
        {row.original.hoc_orders > 0
          ? row.original.hoc_orders
          : <span className="text-muted-foreground/40">—</span>}
      </div>
    ),
  },
  {
    accessorKey: "hoc_sales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="HOC Sales" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-sm">
        {row.original.hoc_sales > 0
          ? fmtBaht(row.original.hoc_sales)
          : <span className="text-muted-foreground/40">—</span>}
      </div>
    ),
  },
]
