export type UploadFileType =
  | 'online_sales'
  | 'offline_sales'
  | 'leads'
  | 'products'
  | 'telesales'
  | 'targets'
  | 'costs'
  | 'incentives'

export interface FileTypeConfig {
  label: string
  table: string
  storageFolder: string
  storageFilename: string      // used in auto-generated filename
  conflictKey: string          // upsert ON CONFLICT
  requiredHeaders: string[]    // fingerprint — must exist
  forbiddenHeaders?: string[]  // fingerprint — must NOT exist (sales mismatch check)
  mismatchHint?: string        // shown when forbidden header detected
}

export const FILE_TYPE_CONFIGS: Record<UploadFileType, FileTypeConfig> = {
  online_sales: {
    label: 'Online Sales',
    table: 'order_sales',
    storageFolder: 'order_sales/online',
    storageFilename: 'online_sales',
    conflictKey: 'order_number',
    requiredHeaders: ['order_number', 'ITEM_ID', 'Sales In VAT'],
    forbiddenHeaders: ['sls_trx_id', 'Sales Ex VAT'],
    mismatchHint: 'ไฟล์นี้ดูเหมือน Offline Sales — กรุณาเลือก "Offline Sales"',
  },
  offline_sales: {
    label: 'Offline Sales',
    table: 'order_sales',
    storageFolder: 'order_sales/offline',
    storageFilename: 'offline_sales',
    conflictKey: 'order_number',
    requiredHeaders: ['sls_trx_id', 'TRANSACTION_DATE', 'Sales Ex VAT'],
    forbiddenHeaders: ['order_number', 'Sales In VAT'],
    mismatchHint: 'ไฟล์นี้ดูเหมือน Online Sales — กรุณาเลือก "Online Sales"',
  },
  leads: {
    label: 'Lead Customers',
    table: 'leads',
    storageFolder: 'leads',
    storageFilename: 'leads',
    conflictKey: 'mmid',
    requiredHeaders: ['mmid', 'lead_customers'],
  },
  products: {
    label: 'Products',
    table: 'products',
    storageFolder: 'products',
    storageFilename: 'products',
    conflictKey: 'prod_num',
    requiredHeaders: ['prod_num', 'brands'],
  },
  telesales: {
    label: 'Telesales Calls',
    table: 'telesales_calls',
    storageFolder: 'telesales',
    storageFilename: 'telesales',
    conflictKey: 'mmid',
    requiredHeaders: ['mmid', 'call_status', 'agent'],
  },
  targets: {
    label: 'Targets',
    table: 'targets',
    storageFolder: 'targets',
    storageFilename: 'targets',
    conflictKey: 'month,dynamic_cmg',
    requiredHeaders: ['month', 'dynamic_cmg', 'sales_target'],
  },
  costs: {
    label: 'Costs',
    table: 'costs',
    storageFolder: 'costs',
    storageFilename: 'costs',
    conflictKey: 'month',
    requiredHeaders: ['month', 'cost_per_agent'],
  },
  incentives: {
    label: 'Incentives',
    table: 'incentives',
    storageFolder: 'incentives',
    storageFilename: 'incentives',
    conflictKey: 'tier',
    requiredHeaders: ['Tier', 'incentive_per_head'],
  },
}

export function generateStoragePath(type: UploadFileType): string {
  const { storageFolder, storageFilename } = FILE_TYPE_CONFIGS[type]
  const ts = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] // 20260510T143022
  return `${storageFolder}/${ts}_${storageFilename}.csv`
}

export function validateHeaders(
  headers: string[],
  type: UploadFileType,
): { ok: boolean; error?: string } {
  const cfg = FILE_TYPE_CONFIGS[type]

  // Check forbidden headers first (sales mismatch)
  if (cfg.forbiddenHeaders) {
    const found = cfg.forbiddenHeaders.filter(h => headers.includes(h))
    if (found.length > 0) {
      return { ok: false, error: cfg.mismatchHint ?? `พบ column ที่ไม่ควรมี: ${found.join(', ')}` }
    }
  }

  // Check required headers
  const missing = cfg.requiredHeaders.filter(h => !headers.includes(h))
  if (missing.length > 0) {
    return { ok: false, error: `ไม่พบ column ที่จำเป็น: ${missing.join(', ')}` }
  }

  return { ok: true }
}
