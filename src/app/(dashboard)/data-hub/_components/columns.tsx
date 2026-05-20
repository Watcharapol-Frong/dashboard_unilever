"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { FILE_TYPE_CONFIGS, UploadFileType } from "@/lib/upload/config"
import { cn } from "@/lib/utils"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

interface UploadBatch {
  id: string
  table_name: string
  filename: string | null
  row_count: number | null
  error_count: number
  status: string
  uploaded_at: string
  uploaded_by: string | null
  user_profiles: { email: string; full_name: string | null } | null
}

export const columns: ColumnDef<UploadBatch>[] = [
  {
    accessorKey: "uploaded_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground">
        {new Date(row.original.uploaded_at).toLocaleString('en-US', {
          dateStyle: 'short',
          timeStyle: 'short'
        })}
      </div>
    ),
  },
  {
    accessorKey: "table_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">
        {FILE_TYPE_CONFIGS[row.original.table_name as UploadFileType]?.label ?? row.original.table_name}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      return value === 'all' ? true : row.getValue(id) === value
    },
  },
  {
    accessorKey: "filename",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="File" />
    ),
    cell: ({ row }) => (
      <div className="text-sm max-w-[200px] truncate" title={row.original.filename ?? ""}>
        {row.original.filename ?? "-"}
      </div>
    ),
  },
  {
    accessorKey: "uploaded_by",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uploaded By" />
    ),
    cell: ({ row }) => {
      const profile = row.original.user_profiles
      if (!profile) return <span className="text-xs italic text-muted-foreground">— (ยังไม่มี Auth)</span>
      return (
        <div className="text-xs text-muted-foreground">
          {profile.full_name || profile.email}
        </div>
      )
    },
  },
  {
    accessorKey: "row_count",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rows" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.row_count?.toLocaleString() ?? 0}
      </div>
    ),
  },
  {
    accessorKey: "error_count",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Errors" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className={cn(
        "text-right tabular-nums",
        row.original.error_count > 0 ? "text-amber-500" : "text-muted-foreground"
      )}>
        {row.original.error_count}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" className="justify-center" />
    ),
    cell: ({ row }) => {
      const status = row.original.status
      return (
        <div className="text-center">
          <span className={cn(
            'text-xs font-semibold',
            status === 'success' ? 'text-green-600'
              : status === 'partial' ? 'text-amber-500'
                : status === 'failed' ? 'text-red-500'
                  : 'text-gray-400',
          )}>
            {status === 'success' ? 'Success'
              : status === 'partial' ? 'Partial'
                : status === 'failed' ? 'Failed'
                  : 'Processing'}
          </span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value === 'all' ? true : row.getValue(id) === value
    },
  },
]
