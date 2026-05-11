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
  schemaHeaders: string[]      // ALL columns the ETL reads; extras beyond this are ignored
  forbiddenHeaders?: string[]  // fingerprint — must NOT exist (sales mismatch check)
  mismatchHint?: string        // shown when forbidden header detected
}

export const FILE_TYPE_CONFIGS: Record<UploadFileType, FileTypeConfig> = {
  online_sales: {
    label: 'Online Sales',
    table: 'online_sales',
    storageFolder: 'order_sales/online',
    storageFilename: 'online_sales',
    conflictKey: 'order_number,prod_num',
    requiredHeaders: ['order_number', 'ITEM_ID', 'Sales In VAT'],
    schemaHeaders: ['order_number', 'order_date', 'mmid', 'mobile', 'dynamic_cmg', 'ITEM_ID', 'Qty Sold (Online)', 'Sales In VAT', 'is_in_paid_sales_report'],
    forbiddenHeaders: ['sls_trx_id', 'Sales Ex VAT'],
    mismatchHint: 'This file appears to be Offline Sales — please select "Offline Sales"',
  },
  offline_sales: {
    label: 'Offline Sales',
    table: 'offline_sales',
    storageFolder: 'order_sales/offline',
    storageFilename: 'offline_sales',
    conflictKey: 'order_number,prod_num',
    requiredHeaders: ['sls_trx_id', 'TRANSACTION_DATE', 'Sales Ex VAT'],
    schemaHeaders: ['sls_trx_id', 'TRANSACTION_DATE', 'mmid', 'mobile', 'dynamic_cmg', 'prod_num', 'sales_qty', 'Sales Ex VAT'],
    forbiddenHeaders: ['order_number', 'Sales In VAT'],
    mismatchHint: 'This file appears to be Online Sales — please select "Online Sales"',
  },
  leads: {
    label: 'Lead Customers',
    table: 'leads',
    storageFolder: 'leads',
    storageFilename: 'leads',
    conflictKey: 'mmid',
    requiredHeaders: ['mmid', 'lead_customers'],
    schemaHeaders: ['mmid', 'cust_name', 'mobile', 'lead_customers'],
  },
  products: {
    label: 'Products',
    table: 'products',
    storageFolder: 'products',
    storageFilename: 'products',
    conflictKey: 'prod_num',
    requiredHeaders: ['prod_num', 'brands'],
    schemaHeaders: ['prod_num', 'product_name_th', 'product_name_en', 'brands', 'senior_buyer_name', 'buyer_name', 'class_name', 'subclass', 'is1PX', 'url_makro_pro'],
  },
  telesales: {
    label: 'Telesales Calls',
    table: 'telesales_calls',
    storageFolder: 'telesales',
    storageFilename: 'telesales',
    conflictKey: 'mmid',
    requiredHeaders: ['mmid', 'call_status', 'agent'],
    schemaHeaders: ['mmid', 'mobile', 'first_conected_date', 'call_status', 'reason_group', 'reason_subgroup', 'contact_note', 'agent', 'source_tab'],
  },
  targets: {
    label: 'Targets',
    table: 'targets',
    storageFolder: 'targets',
    storageFilename: 'targets',
    conflictKey: 'month,dynamic_cmg',
    requiredHeaders: ['month', 'dynamic_cmg', 'sales_target'],
    schemaHeaders: ['month', 'dynamic_cmg', 'sales_target', 'buying_target', 'contact_target'],
  },
  costs: {
    label: 'Costs',
    table: 'costs',
    storageFolder: 'costs',
    storageFilename: 'costs',
    conflictKey: 'month',
    requiredHeaders: ['month', 'cost_per_agent'],
    schemaHeaders: ['month', 'cost_per_agent', 'cost_per_supervisor'],
  },
  incentives: {
    label: 'Incentives',
    table: 'incentives',
    storageFolder: 'incentives',
    storageFilename: 'incentives',
    conflictKey: 'tier',
    requiredHeaders: ['tier', 'incentive_per_head'],
    schemaHeaders: ['tier', 'incentive_per_head'],
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
): { ok: boolean; error?: string; extraColumns: string[] } {
  const cfg = FILE_TYPE_CONFIGS[type]

  // Check forbidden headers first (sales mismatch)
  if (cfg.forbiddenHeaders) {
    const found = cfg.forbiddenHeaders.filter(h => headers.includes(h))
    if (found.length > 0) {
      return { ok: false, error: cfg.mismatchHint ?? `Found unexpected columns: ${found.join(', ')}`, extraColumns: [] }
    }
  }

  // Check required headers
  const missing = cfg.requiredHeaders.filter(h => !headers.includes(h))
  if (missing.length > 0) {
    return { ok: false, error: `Missing required columns: ${missing.join(', ')}`, extraColumns: [] }
  }

  // Columns in file that are NOT in schema — will be stored in Storage but ignored in Silver
  const extraColumns = headers.filter(h => !cfg.schemaHeaders.includes(h))

  return { ok: true, extraColumns }
}
