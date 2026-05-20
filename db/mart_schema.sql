-- ── Gold Layer Mart Tables ───────────────────────────────────────
-- Run once to create; rebuilt via POST /api/system/refresh-mart

CREATE TABLE IF NOT EXISTS mart_telesales_orders (
  mmid                 TEXT NOT NULL,
  order_number         TEXT NOT NULL,
  order_date           DATE NOT NULL,
  channel              TEXT NOT NULL,
  prod_num             TEXT NOT NULL,
  sales_qty            NUMERIC,
  sales_in_vat         NUMERIC,
  dynamic_cmg          TEXT,
  first_connected_date DATE NOT NULL,
  agent                TEXT,
  call_status          TEXT,
  lead_customers       TEXT,
  days_to_order        INTEGER,
  order_seq_in_window  INTEGER,
  is_first_ever_order  BOOLEAN,
  customer_type        TEXT,
  product_name_th      TEXT,
  product_name_en      TEXT,
  brands               TEXT,
  class_name           TEXT,
  is_hoc_unilever      BOOLEAN,
  month                DATE,
  refreshed_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (mmid, order_number, prod_num)
);

CREATE INDEX IF NOT EXISTS idx_mto_month      ON mart_telesales_orders (month);
CREATE INDEX IF NOT EXISTS idx_mto_agent      ON mart_telesales_orders (agent);
CREATE INDEX IF NOT EXISTS idx_mto_hoc        ON mart_telesales_orders (is_hoc_unilever);
CREATE INDEX IF NOT EXISTS idx_mto_ctype      ON mart_telesales_orders (customer_type);

CREATE TABLE IF NOT EXISTS mart_cost_incentive (
  month              DATE NOT NULL,
  lead_customers     TEXT NOT NULL,
  dynamic_cmg        TEXT NOT NULL,
  total_calls        INTEGER,
  reached            INTEGER,
  ordered            INTEGER,
  new_customers      INTEGER,
  retention          INTEGER,
  hoc_orders         INTEGER,
  hoc_sales          NUMERIC,
  total_sales        NUMERIC,
  incentive_per_head NUMERIC,
  total_incentive    NUMERIC,
  cost_per_agent     NUMERIC,
  refreshed_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (month, lead_customers, dynamic_cmg)
);
