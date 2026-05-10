import type { UploadFileType } from './config'

// "Feb 2026" → "2026-02-01"
function parseMonth(raw: string | undefined): string | null {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const m = raw?.trim().match(/^(\w{3})\s+(\d{4})$/)
  if (!m) return null
  const month = months[m[1]]
  if (!month) return null
  return `${m[2]}-${month}-01`
}

// All helpers accept string | undefined — extra CSV columns return undefined at runtime
function toDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function toNum(raw: string | undefined): number {
  const n = parseFloat(String(raw ?? '').replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function toBool(raw: string | undefined): boolean | null {
  const v = String(raw ?? '').trim().toUpperCase()
  if (v === 'TRUE' || v === '1' || v === 'YES') return true
  if (v === 'FALSE' || v === '0' || v === 'NO') return false
  return null
}

function str(raw: string | undefined): string | null {
  const v = String(raw ?? '').trim()
  return v === '' ? null : v
}

// Row allows undefined values — columns not present in the file return undefined
type Row = Record<string, string | undefined>
type SilverRow = Record<string, unknown>

const ETL_TRANSFORMS: Record<UploadFileType, (row: Row, batchId: string) => SilverRow> = {
  online_sales: (row, batchId) => ({
    order_number:      str(row['order_number']),
    order_date:        toDate(row['order_date']),
    mmid:              str(row['mmid']),
    mobile:            str(row['mobile']),
    dynamic_cmg:       str(row['dynamic_cmg']),
    prod_num:          str(row['ITEM_ID']),
    sales_qty:         toNum(row['Qty Sold (Online)']),
    sales_in_vat:      toNum(row['Sales In VAT']),
    channel:           'Online',
    is_in_paid_report: toBool(row['is_in_paid_sales_report']),
    batch_id:          batchId,
  }),

  offline_sales: (row, batchId) => ({
    order_number:      str(row['sls_trx_id']),
    order_date:        toDate(row['TRANSACTION_DATE']),
    mmid:              str(row['mmid']),
    mobile:            str(row['mobile']),
    dynamic_cmg:       str(row['dynamic_cmg']),
    prod_num:          str(row['prod_num']),
    sales_qty:         toNum(row['sales_qty']),
    sales_in_vat:      Math.round(toNum(row['Sales Ex VAT']) * 1.07 * 10000) / 10000,
    channel:           'Offline',
    is_in_paid_report: null,
    batch_id:          batchId,
  }),

  leads: (row, batchId) => ({
    mmid:           str(row['mmid']),
    cust_name:      str(row['cust_name']),
    mobile:         str(row['mobile']),
    lead_customers: str(row['lead_customers']),
    batch_id:       batchId,
  }),

  products: (row, batchId) => ({
    prod_num:          str(row['prod_num']),
    product_name_th:   str(row['product_name_th']),
    product_name_en:   str(row['product_name_en']),
    brands:            str(row['brands']),
    senior_buyer_name: str(row['senior_buyer_name']),
    buyer_name:        str(row['buyer_name']),
    class_name:        str(row['class_name']),
    subclass:          str(row['subclass']),
    is_1px:            toBool(row['is1PX']),
    url_makro_pro:     str(row['url_makro_pro']),
    batch_id:          batchId,
  }),

  telesales: (row, batchId) => ({
    mmid:                 str(row['mmid']),
    mobile:               str(row['mobile']),
    first_connected_date: toDate(row['first_conected_date']),  // typo in source
    call_status:          str(row['call_status']),
    reason_group:         str(row['reason_group']),
    reason_subgroup:      str(row['reason_subgroup']),
    contact_note:         str(row['contact_note']),
    agent:                str(row['agent']),
    lead_customers:       str(row['source_tab']),
    batch_id:             batchId,
  }),

  targets: (row, batchId) => ({
    month:          parseMonth(row['month']),
    dynamic_cmg:    str(row['dynamic_cmg']),
    sales_target:   toNum(row['sales_target']),
    buying_target:  toNum(row['buying_target']),
    contact_target: toNum(row['contact_target']),
    batch_id:       batchId,
  }),

  costs: (row, batchId) => ({
    month:               parseMonth(row['month']),
    cost_per_agent:      toNum(row['cost_per_agent']),
    cost_per_supervisor: toNum(row['cost_per_supervisor']),
    batch_id:            batchId,
  }),

  incentives: (row, batchId) => ({
    tier:               toNum(row['Tier']),
    incentive_per_head: toNum(row['incentive_per_head']),
    batch_id:           batchId,
  }),
}

export function transformRows(
  rows: Row[],
  type: UploadFileType,
  batchId: string,
): { transformed: SilverRow[]; errors: string[] } {
  const transform = ETL_TRANSFORMS[type]
  const transformed: SilverRow[] = []
  const errors: string[] = []

  rows.forEach((row, i) => {
    try {
      const result = transform(row, batchId)
      // Drop rows with null primary keys
      if (result['order_number'] === null && type === 'online_sales') {
        errors.push(`Row ${i + 2}: order_number is empty`)
        return
      }
      if (result['order_number'] === null && type === 'offline_sales') {
        errors.push(`Row ${i + 2}: sls_trx_id is empty`)
        return
      }
      if (result['mmid'] === null && ['leads', 'telesales'].includes(type)) {
        errors.push(`Row ${i + 2}: mmid is empty`)
        return
      }
      transformed.push(result)
    } catch (e) {
      errors.push(`Row ${i + 2}: ${String(e)}`)
    }
  })

  return { transformed, errors }
}
