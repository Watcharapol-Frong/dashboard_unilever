'use client'
import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { CsvUploader } from '@/components/upload/CsvUploader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FILE_TYPE_LABELS } from '@/lib/schemas'
import { formatDate } from '@/lib/utils'
import type { UploadBatch, FileType } from '@/types'
import { CheckCircle, XCircle, Clock } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function UploadPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: batches, mutate } = useSWR<UploadBatch[]>(`/api/upload/history?_=${refreshKey}`, fetcher)

  const onUploaded = useCallback(() => {
    setRefreshKey(k => k + 1)
    mutate()
  }, [mutate])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Data</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload CSV files from all 7 data sources. Drag & drop or click to browse.</p>
      </div>

      <CsvUploader onUploaded={onUploaded} />

      {/* Upload History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Upload History</CardTitle></CardHeader>
        <CardContent>
          {!batches || batches.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No uploads yet</p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">File</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rows</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Errors</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(b.uploaded_at)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{FILE_TYPE_LABELS[b.type as FileType] ?? b.type}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-sm">{b.filename ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right">{b.row_count ?? 0}</td>
                      <td className="px-4 py-2.5 text-right">{b.error_count > 0 ? <span className="text-amber-500">{b.error_count}</span> : 0}</td>
                      <td className="px-4 py-2.5 text-center">
                        {b.status === 'success' ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : b.status === 'pending' ? (
                          <Clock className="h-4 w-4 text-amber-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
