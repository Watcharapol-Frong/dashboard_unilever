export type UserRole = 'admin' | 'viewer'

export interface UserRoleRecord {
  user_id: string
  role: UserRole
  company: string | null
  created_at: string
}

export interface DateRange {
  from: Date
  to: Date
}

export interface Target {
  month: string        // 'YYYY-MM-DD' (first of month)
  dynamic_cmg: string
  sales_target: number | null
  buying_target: number | null
  contact_target: number | null
  batch_id: string | null
  updated_at: string
}

export interface UploadBatch {
  id: string
  table_name: string
  filename: string | null
  storage_path: string | null
  row_count: number
  error_count: number
  uploaded_at: string
  status: string
}

export interface OverviewKpi {
  // customers
  new_customers: number
  new_customers_per_day: number
  // sales
  total_sales: number
  total_sales_online: number
  total_sales_offline: number
  order_count: number
  aov: number
  sales_target: number
  target_pct: number
  // calls
  total_calls: number
  calls_per_day: number
  connection_rate: number
  contacted: number           // = reached (รับสาย)
  not_reached: number
  // comparison (vs previous period)
  prev_new_customers: number
  prev_total_sales: number
  prev_total_calls: number
  prev_connection_rate: number
  // call status map
  callStatusMap: Record<string, number>
}

export interface AgentPerformance {
  agent: string
  total_calls: number
  reached: number
  not_reached: number
  reach_rate: number
  conversion_rate: number
  calls_per_day: number
}

export interface TelesalesKpi {
  summary: {
    total_calls: number
    reached: number
    not_reached: number
    call_status_breakdown: Record<string, number>
  }
  by_agent: AgentPerformance[]
  by_period: { period: string; total_calls: number; reached: number }[]
  sankey: {
    nodes: { id: string }[]
    links: { source: string; target: string; value: number }[]
  }
  callStatusMap: Record<string, number>
}

export interface SalesKpi {
  total_sales: number
  total_sales_online: number
  total_sales_offline: number
  total_orders: number
  target: number
  target_pct: number
  new_customers: number
  avg_order_value: number
  by_period: { period: string; online: number; offline: number }[]
  recent_orders: RecentOrder[]
  mtd_sales: number
  forecast: number
  forecast_vs_target_pct: number
  days_elapsed: number
  days_in_month: number
  month_target: number
}

export interface RecentOrder {
  order_number: string
  order_date: string
  mmid: string | null
  prod_num: string | null
  sales_qty: number
  sales_in_vat: number
  dynamic_cmg: string | null
  channel: string
  agent: string | null
}

export interface ProductKpi {
  by_product: ProductRow[]
  by_brand: BrandRow[]
  total_revenue: number
  uni_revenue: number
  uni_revenue_pct: number
  uni_product_count: number
}

export interface ProductRow {
  prod_num: string
  brands: string | null
  product_name_th: string | null
  product_name_en: string | null
  is_uni_hoc_pd: boolean
  total_qty: number
  total_sales: number
  pct_of_total: number
}

export interface BrandRow {
  brands: string
  total_sales: number
  total_qty: number
  product_count: number
  pct_of_total: number
}

// FileType must match UploadFileType in src/lib/upload/config.ts
export type FileType =
  | 'online_sales'
  | 'offline_sales'
  | 'products'
  | 'incentives'
  | 'telesales'
  | 'leads'
  | 'targets'
  | 'costs'

export interface SchemaField {
  key: string
  label: string
  required: boolean
  type: 'string' | 'date' | 'number' | 'boolean'
}
