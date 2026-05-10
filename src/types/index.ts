export type UserRole = 'admin' | 'viewer_telesales'

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

export interface UploadBatch {
  id: string
  type: string
  filename: string | null
  row_count: number | null
  error_count: number
  uploaded_at: string
  status: string
}

export interface Target {
  id: string
  period_label: string
  period_start: string
  period_end: string
  sales_target_thb: number
  new_customer_target: number
  call_target: number
  channel: string
}

export interface OverviewKpi {
  // customers
  new_customers: number
  new_customers_per_day: number
  returning_customers: number
  retention_rate: number
  total_customers: number
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
  contacted: number
  // conversion
  conversion_count: number
  conversion_rate: number
  engaged: number
  engaged_rate: number
  // comparison (vs previous period)
  prev_new_customers: number
  prev_total_sales: number
  prev_total_calls: number
  prev_conversion_rate: number
  prev_engaged_rate: number
}

export interface AgentPerformance {
  agent_name: string
  agent_company: string | null
  total_calls: number
  contacted: number
  interested: number
  ordered: number
  connection_rate: number
  conversion_rate: number
}

export interface TelesalesKpi {
  summary: {
    total_calls: number
    contacted: number
    no_answer: number
    interested: number
    not_interested: number
    ordered: number
  }
  by_agent: AgentPerformance[]
  by_date: { date: string; total_calls: number; contacted: number }[]
  sankey: {
    nodes: { id: string }[]
    links: { source: string; target: string; value: number }[]
  }
}

export interface SalesKpi {
  total_sales: number
  total_sales_online: number
  total_sales_offline: number
  target: number
  target_pct: number
  new_customers: number
  avg_order_value: number
  by_date: { date: string; online: number; offline: number }[]
  recent_orders: RecentOrder[]
}

export interface RecentOrder {
  order_id: string
  order_date: string
  customer_name: string | null
  product_sku: string
  product_brand: string | null
  qty: number
  sales_amount: number
  channel: string
}

export interface ProductKpi {
  by_sku: {
    product_sku: string
    product_brand: string | null
    qty: number
    sales_amount: number
    pct_of_total: number
  }[]
  total_revenue: number
}

export type FileType =
  | 'sales_online'
  | 'sales_offline'
  | 'product_list'
  | 'incentive'
  | 'telesales_call_log'
  | 'lead_list'
  | 'target'

export interface SchemaField {
  key: string
  label: string
  required: boolean
  type: 'string' | 'date' | 'number' | 'boolean'
}
