import Papa from 'papaparse'
import { SCHEMAS } from '@/lib/schemas'
import type { FileType, SchemaField } from '@/types'

export interface ParseResult {
  valid: Record<string, unknown>[]
  errors: string[]
  headers: string[]
}

function coerce(value: string, field: SchemaField): unknown {
  const v = value?.toString().trim() ?? ''
  if (v === '' || v === '-' || v === 'N/A') return null
  switch (field.type) {
    case 'number': {
      const n = parseFloat(v.replace(/,/g, ''))
      return isNaN(n) ? null : n
    }
    case 'date': {
      const d = new Date(v)
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
    }
    case 'boolean':
      return v.toLowerCase() === 'true' || v === '1'
    default:
      return v
  }
}

export function parseCSV(text: string, fileType: FileType, columnMap: Record<string, string> = {}): ParseResult {
  const schema = SCHEMAS[fileType]
  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parseErrors.length > 0) {
    return { valid: [], errors: parseErrors.map((e) => e.message), headers: [] }
  }

  const rawHeaders = data.length > 0 ? Object.keys(data[0]) : []
  const valid: Record<string, unknown>[] = []
  const errors: string[] = []

  data.forEach((row, i) => {
    const mapped: Record<string, unknown> = {}
    let hasError = false

    for (const field of schema) {
      const csvKey = columnMap[field.key] ?? field.key
      const rawValue = row[csvKey] ?? ''
      const coerced = coerce(rawValue, field)

      if (field.required && (coerced === null || coerced === '')) {
        errors.push(`Row ${i + 2}: Missing required field "${field.label}"`)
        hasError = true
        break
      }
      mapped[field.key] = coerced
    }

    if (!hasError) valid.push(mapped)
  })

  return { valid, errors, headers: rawHeaders }
}
