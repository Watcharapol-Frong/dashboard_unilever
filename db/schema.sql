-- ── Core Silver tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upload_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  filename     TEXT,
  storage_path TEXT,
  row_count    INT,
  error_count  INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','partial','failed')),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by  TEXT
);

CREATE TABLE IF NOT EXISTS online_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT,
  order_date      DATE,
  mmid            TEXT,
  mobile          TEXT,
  dynamic_cmg     TEXT,
  prod_num        TEXT,
  sales_qty       NUMERIC DEFAULT 0,
  sales_in_vat    NUMERIC DEFAULT 0,
  is_in_paid_report BOOLEAN,
  batch_id        UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_number, prod_num)
);

CREATE TABLE IF NOT EXISTS offline_sales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT,
  order_date   DATE,
  mmid         TEXT,
  mobile       TEXT,
  dynamic_cmg  TEXT,
  prod_num     TEXT,
  sales_qty    NUMERIC DEFAULT 0,
  sales_in_vat NUMERIC DEFAULT 0,
  batch_id     UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_number, prod_num)
);

CREATE TABLE IF NOT EXISTS leads (
  mmid           TEXT PRIMARY KEY,
  cust_name      TEXT,
  mobile         TEXT,
  lead_customers TEXT,
  batch_id       UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  prod_num          TEXT PRIMARY KEY,
  product_name_th   TEXT,
  product_name_en   TEXT,
  brands            TEXT,
  senior_buyer_name TEXT,
  buyer_name        TEXT,
  class_name        TEXT,
  subclass          TEXT,
  is_1px            BOOLEAN,
  url_makro_pro     TEXT,
  batch_id          UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telesales_calls (
  mmid                 TEXT PRIMARY KEY,
  mobile               TEXT,
  first_connected_date DATE,
  call_status          TEXT,
  reason_group         TEXT,
  reason_subgroup      TEXT,
  contact_note         TEXT,
  agent                TEXT,
  lead_customers       TEXT,
  batch_id             UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS targets (
  month          DATE NOT NULL,
  dynamic_cmg    TEXT NOT NULL,
  sales_target   NUMERIC,
  buying_target  NUMERIC,
  contact_target NUMERIC,
  batch_id       UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (month, dynamic_cmg)
);

CREATE TABLE IF NOT EXISTS costs (
  month                DATE PRIMARY KEY,
  cost_per_agent       NUMERIC,
  cost_per_supervisor  NUMERIC,
  batch_id             UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incentives (
  tier               NUMERIC PRIMARY KEY,
  incentive_per_head NUMERIC,
  batch_id           UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_online_sales_date    ON online_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_online_sales_mmid    ON online_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_offline_sales_date   ON offline_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_offline_sales_mmid   ON offline_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_telesales_date       ON telesales_calls(first_connected_date);
CREATE INDEX IF NOT EXISTS idx_telesales_agent      ON telesales_calls(agent);
CREATE INDEX IF NOT EXISTS idx_upload_batches_table ON upload_batches(table_name, uploaded_at DESC);

