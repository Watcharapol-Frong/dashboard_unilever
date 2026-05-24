// Shared UI configuration for the pivot table builder.
// No SQL — client-safe.

export type GranularityId = 'month' | 'cmg' | 'customer' | 'product' | 'brand' | 'agent' | 'order_line'

export interface GranularityDef {
  id:         GranularityId
  label:      string
  keyLabels:  string[]   // always-shown key column headers
  breakdowns: string[]   // optional breakdown column IDs (add to GROUP BY)
  metrics:    string[]   // metric column IDs
}

export interface ColumnDef {
  id:    string
  label: string
  type:  'breakdown' | 'metric'
}

export const GRANULARITY_DEFS: GranularityDef[] = [
  {
    id:         'month',
    label:      'Month',
    keyLabels:  ['Month'],
    breakdowns: ['dynamic_cmg', 'channel', 'customer_type', 'agent', 'brands', 'class_name'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
  },
  {
    id:         'cmg',
    label:      'CMG',
    keyLabels:  ['CMG'],
    breakdowns: ['month', 'channel', 'customer_type', 'agent', 'brands'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
  },
  {
    id:         'customer',
    label:      'Customer (MMID)',
    keyLabels:  ['MMID', 'Customer Name'],
    breakdowns: ['month', 'dynamic_cmg', 'channel'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers'],
  },
  {
    id:         'product',
    label:      'Product',
    keyLabels:  ['Product Code', 'Product Name', 'Brand'],
    breakdowns: ['month', 'dynamic_cmg', 'channel', 'class_name'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'unique_customers'],
  },
  {
    id:         'brand',
    label:      'Brand',
    keyLabels:  ['Brand'],
    breakdowns: ['month', 'dynamic_cmg', 'channel', 'class_name'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'unique_customers'],
  },
  {
    id:         'agent',
    label:      'Agent',
    keyLabels:  ['Agent'],
    breakdowns: ['month', 'dynamic_cmg', 'channel'],
    metrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
  },
  {
    id:         'order_line',
    label:      'Order Line (Raw)',
    keyLabels:  ['Order#', 'Date', 'Month', 'MMID', 'Customer', 'CMG', 'Channel', 'Type', 'Product', 'Brand', 'Qty', 'Sales', 'Agent', 'Days'],
    breakdowns: [],
    metrics:    [],
  },
]

export const ALL_COLUMNS: ColumnDef[] = [
  // Breakdowns
  { id: 'month',         label: 'Month',         type: 'breakdown' },
  { id: 'dynamic_cmg',   label: 'CMG',            type: 'breakdown' },
  { id: 'channel',       label: 'Channel',        type: 'breakdown' },
  { id: 'customer_type', label: 'Customer Type',  type: 'breakdown' },
  { id: 'agent',         label: 'Agent',          type: 'breakdown' },
  { id: 'brands',        label: 'Brand',          type: 'breakdown' },
  { id: 'class_name',    label: 'Class',          type: 'breakdown' },
  // Metrics
  { id: 'hoc_orders',          label: 'Orders',           type: 'metric' },
  { id: 'hoc_sales',           label: 'Sales (THB)',       type: 'metric' },
  { id: 'qty',                 label: 'Qty',               type: 'metric' },
  { id: 'new_customers',       label: 'New Customers',     type: 'metric' },
  { id: 'retention_customers', label: 'Retention Cust.',   type: 'metric' },
  { id: 'unique_customers',    label: 'Unique Customers',  type: 'metric' },
]

export const DEFAULT_METRICS: Record<GranularityId, string[]> = {
  month:      ['hoc_orders', 'hoc_sales', 'new_customers', 'retention_customers'],
  cmg:        ['hoc_orders', 'hoc_sales', 'new_customers', 'retention_customers'],
  customer:   ['hoc_orders', 'hoc_sales'],
  product:    ['hoc_orders', 'hoc_sales', 'qty'],
  brand:      ['hoc_orders', 'hoc_sales', 'qty'],
  agent:      ['hoc_orders', 'hoc_sales', 'new_customers', 'retention_customers'],
  order_line: [],
}
