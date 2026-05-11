-- ============================================================
-- Split order_sales → online_sales + offline_sales (Silver)
-- order_sales becomes a unified VIEW (Gold)
-- ============================================================

-- Drop old merged table (empty at this point)
DROP TABLE IF EXISTS order_sales CASCADE;

-- ── 1. online_sales ──────────────────────────────────────────
CREATE TABLE online_sales (
  order_number      text          PRIMARY KEY,
  order_date        date          NOT NULL,
  mmid              text,
  mobile            text,
  dynamic_cmg       text,
  prod_num          text,
  sales_qty         numeric(10,2) NOT NULL DEFAULT 0,
  sales_in_vat      numeric(14,4) NOT NULL DEFAULT 0,
  is_in_paid_report boolean,
  batch_id          uuid          REFERENCES upload_batches(id),
  updated_at        timestamptz   DEFAULT now()
);

CREATE INDEX idx_online_sales_date ON online_sales (order_date);
CREATE INDEX idx_online_sales_mmid ON online_sales (mmid);
CREATE INDEX idx_online_sales_prod ON online_sales (prod_num);
CREATE INDEX idx_online_sales_cmg  ON online_sales (dynamic_cmg);

-- ── 2. offline_sales ─────────────────────────────────────────
CREATE TABLE offline_sales (
  order_number      text          PRIMARY KEY,
  order_date        date          NOT NULL,
  mmid              text,
  mobile            text,
  dynamic_cmg       text,
  prod_num          text,
  sales_qty         numeric(10,2) NOT NULL DEFAULT 0,
  sales_in_vat      numeric(14,4) NOT NULL DEFAULT 0,
  batch_id          uuid          REFERENCES upload_batches(id),
  updated_at        timestamptz   DEFAULT now()
);

CREATE INDEX idx_offline_sales_date ON offline_sales (order_date);
CREATE INDEX idx_offline_sales_mmid ON offline_sales (mmid);
CREATE INDEX idx_offline_sales_prod ON offline_sales (prod_num);
CREATE INDEX idx_offline_sales_cmg  ON offline_sales (dynamic_cmg);

-- ── 3. order_sales VIEW (Gold) ───────────────────────────────
-- Unified view for dashboard queries — channel is derived from source table
CREATE OR REPLACE VIEW order_sales AS
  SELECT
    order_number, order_date, mmid, mobile, dynamic_cmg, prod_num,
    sales_qty, sales_in_vat,
    'Online'::text  AS channel,
    is_in_paid_report,
    batch_id, updated_at
  FROM online_sales
  UNION ALL
  SELECT
    order_number, order_date, mmid, mobile, dynamic_cmg, prod_num,
    sales_qty, sales_in_vat,
    'Offline'::text  AS channel,
    NULL::boolean    AS is_in_paid_report,
    batch_id, updated_at
  FROM offline_sales;
