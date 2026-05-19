'use client'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FILE_TYPE_LABELS, SCHEMAS } from '@/lib/schemas'
import { Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { FileType } from '@/types'

interface UploadResult { ok?: boolean; row_count?: number; error_count?: number; errors?: string[]; error?: string }

export function CsvUploader({ onUploaded }: { onUploaded?: () => void }) {
  const [fileType, setFileType] = useState<FileType>('online_sales')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const schema = SCHEMAS[fileType]

  async function handleFile(f: File) {
    setFile(f)
    setResult(null)
    const text = await f.text()
    const lines = text.split('\n').filter(Boolean)
    const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) ?? []

    // Parse first 5 rows for preview
    const rows: Record<string, string>[] = []
    for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
      const values = lines[i]?.split(',').map(v => v.replace(/"/g, '').trim()) ?? []
      const row: Record<string, string> = {}
      headers.forEach((h, j) => { row[h] = values[j] ?? '' })
      rows.push(row)
    }
    setPreview(rows)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`/api/data/upload/${fileType}`, { method: 'POST', body: formData })
    const data: UploadResult = await res.json()
    setResult(data)
    setUploading(false)
    if (data.ok) { setFile(null); setPreview([]); onUploaded?.() }
  }

  const csvHeaders = preview.length > 0 ? Object.keys(preview[0]) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" /> Upload CSV Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Type Selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Data Type</label>
          <Select value={fileType} onChange={e => { setFileType(e.target.value as FileType); setFile(null); setPreview([]) }}>
            {(Object.entries(FILE_TYPE_LABELS) as [FileType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>

        {/* Schema reference */}
        <div className="text-xs text-muted-foreground">
          Required columns: {schema.filter(f => f.required).map(f => f.label).join(', ')}
        </div>

        {/* Drop Zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        >
          {file ? (
            <div>
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Drag & drop CSV file here, or click to browse</p>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {/* Preview Table */}
        {preview.length > 0 && (
          <div className="rounded border overflow-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-muted">
                  {csvHeaders.slice(0, 8).map(h => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t">
                    {csvHeaders.slice(0, 8).map(h => <td key={h} className="px-2 py-1 truncate max-w-24">{row[h] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground p-2">Showing first 5 rows (up to 8 columns)</p>
          </div>
        )}

        {/* Upload Button */}
        {file && (
          <Button onClick={handleUpload} disabled={uploading} className="w-full">
            {uploading ? 'Uploading...' : `Upload ${FILE_TYPE_LABELS[fileType]}`}
          </Button>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-lg p-4 flex items-start gap-3 ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
            <div>
              {result.ok ? (
                <p className="font-medium">Upload successful! {result.row_count} rows imported{result.error_count ? `, ${result.error_count} skipped` : '.'}</p>
              ) : (
                <p className="font-medium">{result.error}</p>
              )}
              {result.errors && result.errors.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i} className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {e}</li>)}
                  {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
