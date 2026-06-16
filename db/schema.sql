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
  uploaded_by  TEXT,
  file_hash    TEXT                                     -- SHA-256 of raw CSV (dedup guard)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ub_file_hash
  ON upload_batches (file_hash)
  WHERE file_hash IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS agent_headcount (
  month            DATE PRIMARY KEY,
  supervisor_count INT NOT NULL DEFAULT 0,
  agent_count      INT NOT NULL DEFAULT 0,
  batch_id         UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_summaries (
  table_name   TEXT PRIMARY KEY,
  total_rows   BIGINT DEFAULT 0,
  total_sales  NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_online_sales_date       ON online_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_online_sales_mmid       ON online_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_online_sales_mmid_date  ON online_sales(mmid, order_date);
CREATE INDEX IF NOT EXISTS idx_online_sales_prod_num   ON online_sales(prod_num);
CREATE INDEX IF NOT EXISTS idx_offline_sales_date      ON offline_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_offline_sales_mmid      ON offline_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_offline_sales_mmid_date ON offline_sales(mmid, order_date);
CREATE INDEX IF NOT EXISTS idx_offline_sales_prod_num  ON offline_sales(prod_num);
CREATE INDEX IF NOT EXISTS idx_telesales_date          ON telesales_calls(first_connected_date);
CREATE INDEX IF NOT EXISTS idx_telesales_agent         ON telesales_calls(agent);
CREATE INDEX IF NOT EXISTS idx_upload_batches_table    ON upload_batches(table_name, uploaded_at DESC);

-- ── Mart tables (created/rebuilt by refreshAllMarts() in src/lib/mart.ts) ───
-- These are DROP+CREATE on every build. Listed here as schema reference only.

CREATE TABLE IF NOT EXISTS mmid_cmg_map (
  mmid                 TEXT NOT NULL PRIMARY KEY,
  primary_cmg          TEXT,
  first_connected_date DATE
);

CREATE TABLE IF NOT EXISTS sales_hoc_orders (
  mmid                 TEXT        NOT NULL,
  order_number         TEXT        NOT NULL,
  order_date           DATE        NOT NULL,
  channel              TEXT,
  prod_num             TEXT        NOT NULL,
  sales_qty            NUMERIC,
  sales_in_vat         NUMERIC,
  dynamic_cmg          TEXT,
  primary_cmg          TEXT,
  first_connected_date DATE,
  agent                TEXT,
  call_status          TEXT,
  lead_customers       TEXT,
  days_to_order        INTEGER,
  customer_type        TEXT,
  product_name_th      TEXT,
  product_name_en      TEXT,
  brands               TEXT,
  class_name           TEXT,
  subclass             TEXT,
  month                DATE,
  month_label          TEXT,
  week_label           TEXT,
  refreshed_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (mmid, order_number, prod_num)
);

CREATE TABLE IF NOT EXISTS mart_performance_cmg (
  month             DATE    NOT NULL,
  dynamic_cmg       TEXT    NOT NULL,
  total_calls       INTEGER,
  reached           INTEGER,
  ordered           INTEGER,
  new_customers     INTEGER,
  retention         INTEGER,
  hoc_orders        INTEGER,
  hoc_sales         NUMERIC,
  sales_target      NUMERIC,
  achievement_ratio NUMERIC,
  refreshed_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (month, dynamic_cmg)
);

CREATE TABLE IF NOT EXISTS mart_performance_month (
  month              DATE NOT NULL PRIMARY KEY,
  total_calls        INTEGER,
  reached            INTEGER,
  incentive_per_head NUMERIC,
  total_incentive    NUMERIC,
  total_agent_cost   NUMERIC,
  total_expense      NUMERIC,
  roi                NUMERIC,
  attribution_days   INTEGER,
  refreshed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mart_builds (
  id               BIGSERIAL   PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  attribution_days INTEGER,
  duration_ms      INTEGER,
  status           TEXT        NOT NULL DEFAULT 'running',
  row_counts       JSONB,
  error_message    TEXT
);

