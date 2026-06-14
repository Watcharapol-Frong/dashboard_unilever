"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"
import { Input } from "@/components/ui/input"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  toolbarLeft?: React.ReactNode
  /** Total number of rows for server-side pagination */
  rowCount?: number
  /** Pagination state for server-side pagination */
  pagination?: PaginationState
  /** Callback for pagination changes in server-side pagination */
  onPaginationChange?: (pagination: PaginationState) => void
  /** Default page size for client-side pagination (default: 10) */
  defaultPageSize?: number
  /** When true, disables internal client-side pagination. Automatically true if rowCount/pagination/onPaginationChange are provided. */
  manualPagination?: boolean
  /** When true, hides the pagination footer */
  hidePagination?: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  toolbarLeft,
  rowCount,
  pagination,
  onPaginationChange,
  defaultPageSize,
  manualPagination: manualPaginationProp,
  hidePagination,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])

  const isServerSide = rowCount !== undefined && pagination !== undefined && onPaginationChange !== undefined
  const manualPagination = isServerSide || !!manualPaginationProp

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      ...(isServerSide ? { pagination } : {}),
    },
    initialState: {
      pagination: isServerSide ? undefined : { pageSize: manualPagination ? 10_000 : (defaultPageSize ?? 10) },
    },
    manualPagination: manualPagination,
    rowCount: rowCount,
    onPaginationChange: isServerSide ? (updater) => {
      if (typeof updater === 'function') {
        onPaginationChange(updater(pagination!))
      } else {
        onPaginationChange(updater)
      }
    } : undefined,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: isServerSide ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center space-x-2 flex-wrap gap-y-2">
          {toolbarLeft}
          {searchKey && (
            <Input
              placeholder={searchPlaceholder || `Filter ${searchKey}...`}
              value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn(searchKey)?.setFilterValue(event.target.value)
              }
              className="h-8 w-[150px] lg:w-[250px]"
            />
          )}
          {searchValue !== undefined && onSearchChange && (
            <Input
              placeholder={searchPlaceholder || "Search..."}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-8 w-[150px] lg:w-[250px]"
            />
          )}
        </div>
        <DataTableViewOptions table={table} />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && <DataTablePagination table={table} />}
    </div>
  )
}
