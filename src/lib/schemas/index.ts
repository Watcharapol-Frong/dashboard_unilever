import type { SchemaField, FileType } from '@/types'

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  online_sales:     'Sales Order — Online (Makro Pro)',
  offline_sales:    'Sales Order — Offline (Makro Store)',
  products:         'Product List / SKU Reference',
  incentives:       'Incentive / Bonus Data',
  telesales:        'Telesales Call Log',
  leads:            'Lead List',
  targets:          'Target / Budget',
  costs:            'Cost per Agent / Supervisor',
}

export const SCHEMAS: Record<FileType, SchemaField[]> = {
  online_sales: [
    { key: 'order_number',     label: 'Order Number',        required: true,  type: 'string' },
    { key: 'order_date',       label: 'Order Date',          required: true,  type: 'date'   },
    { key: 'mmid',             label: 'MMID',                required: false, type: 'string' },
    { key: 'mobile',           label: 'Mobile',              required: false, type: 'string' },
    { key: 'dynamic_cmg',      label: 'Dynamic CMG',         required: false, type: 'string' },
    { key: 'prod_num',         label: 'Product Number',      required: true,  type: 'string' },
    { key: 'sales_qty',        label: 'Sales Qty',           required: true,  type: 'number' },
    { key: 'sales_in_vat',     label: 'Sales incl. VAT',     required: true,  type: 'number' },
    { key: 'is_in_paid_report',label: 'In Paid Report',      required: false, type: 'boolean'},
  ],

  offline_sales: [
    { key: 'order_number',  label: 'Order Number',    required: true,  type: 'string' },
    { key: 'order_date',    label: 'Order Date',      required: true,  type: 'date'   },
    { key: 'mmid',          label: 'MMID',            required: false, type: 'string' },
    { key: 'mobile',        label: 'Mobile',          required: false, type: 'string' },
    { key: 'dynamic_cmg',   label: 'Dynamic CMG',     required: false, type: 'string' },
    { key: 'prod_num',      label: 'Product Number',  required: true,  type: 'string' },
    { key: 'sales_qty',     label: 'Sales Qty',       required: true,  type: 'number' },
    { key: 'sales_in_vat',  label: 'Sales incl. VAT', required: true,  type: 'number' },
  ],

  telesales: [
    { key: 'mmid',                label: 'MMID',               required: true,  type: 'string' },
    { key: 'mobile',              label: 'Mobile',             required: false, type: 'string' },
    { key: 'first_connected_date',label: 'First Connected Date',required: true,  type: 'date'   },
    { key: 'call_status',         label: 'Call Status',        required: true,  type: 'string' },
    { key: 'reason_group',        label: 'Reason Group',       required: false, type: 'string' },
    { key: 'reason_subgroup',     label: 'Reason Subgroup',    required: false, type: 'string' },
    { key: 'contact_note',        label: 'Contact Note',       required: false, type: 'string' },
    { key: 'agent',               label: 'Agent Name',         required: true,  type: 'string' },
    { key: 'lead_customers',      label: 'Lead Customer Group',required: false, type: 'string' },
  ],

  leads: [
    { key: 'mmid',          label: 'MMID',         required: true,  type: 'string' },
    { key: 'cust_name',     label: 'Customer Name',required: false, type: 'string' },
    { key: 'mobile',        label: 'Mobile',       required: false, type: 'string' },
    { key: 'lead_customers',label: 'Lead Category',required: false, type: 'string' },
  ],

  products: [
    { key: 'prod_num',          label: 'Product Number',    required: true,  type: 'string'  },
    { key: 'product_name_th',   label: 'Product Name (TH)', required: false, type: 'string'  },
    { key: 'product_name_en',   label: 'Product Name (EN)', required: false, type: 'string'  },
    { key: 'brands',            label: 'Brand',             required: false, type: 'string'  },
    { key: 'senior_buyer_name', label: 'Senior Buyer',      required: false, type: 'string'  },
    { key: 'buyer_name',        label: 'Buyer',             required: false, type: 'string'  },
    { key: 'class_name',        label: 'Class',             required: false, type: 'string'  },
    { key: 'subclass',          label: 'Subclass',          required: false, type: 'string'  },
    { key: 'is_1px',            label: 'Is 1PX',            required: false, type: 'boolean' },
    { key: 'url_makro_pro',     label: 'URL Makro Pro',     required: false, type: 'string'  },
  ],

  incentives: [
    { key: 'tier',               label: 'Tier',             required: true,  type: 'number' },
    { key: 'incentive_per_head', label: 'Incentive/Head',   required: true,  type: 'number' },
  ],

  targets: [
    { key: 'month',          label: 'Month (YYYY-MM-01)',   required: true,  type: 'date'   },
    { key: 'dynamic_cmg',    label: 'Dynamic CMG',          required: true,  type: 'string' },
    { key: 'sales_target',   label: 'Sales Target (THB)',   required: false, type: 'number' },
    { key: 'buying_target',  label: 'Buying Target (THB)',  required: false, type: 'number' },
    { key: 'contact_target', label: 'Contact Target',       required: false, type: 'number' },
  ],

  costs: [
    { key: 'month',               label: 'Month (YYYY-MM-01)', required: true,  type: 'date'   },
    { key: 'cost_per_agent',      label: 'Cost per Agent',     required: true,  type: 'number' },
    { key: 'cost_per_supervisor', label: 'Cost per Supervisor',required: true,  type: 'number' },
  ],
}
