-- ============================================================
-- Silver Layer — 7 tables
-- ============================================================

-- Meta: Upload batch log (referenced by all silver tables)
CREATE TABLE upload_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text NOT NULL,
  filename     text,
  storage_path text,
  row_count    integer DEFAULT 0,
  error_count  integer DEFAULT 0,
  status       text DEFAULT 'success' CHECK (status IN ('success','partial','failed')),
  uploaded_by  text,
  uploaded_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 1. order_sales  (Online + Offline merged)
-- ============================================================
CREATE TABLE order_sales (
  order_number      text PRIMARY KEY,
  order_date        date          NOT NULL,
  mmid              text,
  mobile            text,
  dynamic_cmg       text,
  prod_num          text,
  sales_qty         integer       NOT NULL DEFAULT 0,
  sales_in_vat      numeric(14,4) NOT NULL DEFAULT 0,
  channel           text          NOT NULL CHECK (channel IN ('Online','Offline')),
  is_in_paid_report boolean,
  batch_id          uuid          REFERENCES upload_batches(id),
  created_at        timestamptz   DEFAULT now()
);

CREATE INDEX idx_order_sales_date    ON order_sales (order_date);
CREATE INDEX idx_order_sales_mmid    ON order_sales (mmid);
CREATE INDEX idx_order_sales_prod    ON order_sales (prod_num);
CREATE INDEX idx_order_sales_channel ON order_sales (channel);
CREATE INDEX idx_order_sales_cmg     ON order_sales (dynamic_cmg);

-- ============================================================
-- 2. leads
-- ============================================================
CREATE TABLE leads (
  mmid           text PRIMARY KEY,
  cust_name      text,
  mobile         text,
  lead_customers text,
  batch_id       uuid REFERENCES upload_batches(id),
  updated_at     timestamptz DEFAULT now()
);

-- ============================================================
-- 3. products
-- ============================================================
CREATE TABLE products (
  prod_num          text PRIMARY KEY,
  product_name_th   text,
  product_name_en   text,
  brands            text,
  senior_buyer_name text,
  buyer_name        text,
  class_name        text,
  subclass          text,
  is_1px            boolean,
  url_makro_pro     text,
  batch_id          uuid REFERENCES upload_batches(id),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_products_brands ON products (brands);

-- ============================================================
-- 4. telesales_calls
-- ============================================================
CREATE TABLE telesales_calls (
  mmid                 text PRIMARY KEY,
  mobile               text,
  first_connected_date date,
  call_status          text,
  reason_group         text,
  reason_subgroup      text,
  contact_note         text,
  agent                text,
  source_tab           text,
  batch_id             uuid REFERENCES upload_batches(id),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_telesales_agent  ON telesales_calls (agent);
CREATE INDEX idx_telesales_status ON telesales_calls (call_status);

-- ============================================================
-- 5. targets
-- ============================================================
CREATE TABLE targets (
  month          date          NOT NULL,
  dynamic_cmg    text          NOT NULL,
  sales_target   numeric(14,2),
  buying_target  numeric(14,2),
  contact_target numeric(14,2),
  batch_id       uuid          REFERENCES upload_batches(id),
  updated_at     timestamptz   DEFAULT now(),
  PRIMARY KEY (month, dynamic_cmg)
);

CREATE INDEX idx_targets_month ON targets (month);

-- ============================================================
-- 6. costs
-- ============================================================
CREATE TABLE costs (
  month               date PRIMARY KEY,
  cost_per_agent      numeric(12,2),
  cost_per_supervisor numeric(12,2),
  batch_id            uuid REFERENCES upload_batches(id),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================
-- 7. incentives
-- ============================================================
CREATE TABLE incentives (
  tier               numeric(5,2) PRIMARY KEY,
  incentive_per_head numeric(12,2) NOT NULL,
  batch_id           uuid          REFERENCES upload_batches(id),
  updated_at         timestamptz   DEFAULT now()
);
