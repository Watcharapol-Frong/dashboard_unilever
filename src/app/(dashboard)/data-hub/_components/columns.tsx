"use client"

import { ColumnDef } from "@tanstack/react-table"
import { CheckCircle, Clock, AlertCircle } from "lucide-react"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export interface UploadBatch {
  id: string
  table_name: string
  filename: string | null
  row_count: number | null
  error_count: number
  status: string
  uploaded_at: string
  uploaded_by: string | null
}

function fmtUpload(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TABLE_LABELS: Record<string, string> = {
  online_sales:    'Online Sales',
  offline_sales:   'Offline Sales',
  leads:           'Leads',
  products:        'Products',
  telesales_calls: 'Telesales',
  targets:         'Targets',
  costs:           'Costs',
  incentives:      'Incentives',
  agent_headcount: 'Agent Headcount',
}

export const columns: ColumnDef<UploadBatch>[] = [
  {
    accessorKey: 'uploaded_at',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {fmtUpload(row.original.uploaded_at)}
      </span>
    ),
  },
  {
    accessorKey: 'table_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="File Type" />,
    cell: ({ row }) => (
      <span className="text-xs font-semibold">
        {TABLE_LABELS[row.original.table_name] ?? row.original.table_name}
      </span>
    ),
  },
  {
    accessorKey: 'filename',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Filename" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
        {row.original.filename ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'uploaded_by',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Uploaded By" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.uploaded_by ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'row_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Rows" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right text-xs tabular-nums">
        {row.original.row_count != null ? row.original.row_count.toLocaleString() : '—'}
      </div>
    ),
  },
  {
    accessorKey: 'error_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Errors" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right text-xs tabular-nums">
        {row.original.error_count > 0
          ? <span className="text-amber-600 font-semibold">{row.original.error_count.toLocaleString()}</span>
          : <span className="text-muted-foreground">0</span>
        }
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" className="justify-center" />,
    cell: ({ row }) => {
      const s = row.original.status
      return (
        <div className="flex justify-center">
          {s === 'success' ? (
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              <CheckCircle className="h-3 w-3" />Success
            </span>
          ) : s === 'partial' ? (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              <AlertCircle className="h-3 w-3" />Partial
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              <Clock className="h-3 w-3" />Failed
            </span>
          )}
        </div>
      )
    },
  },
]
