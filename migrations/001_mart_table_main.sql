-- Migration: replace mart_telesales_orders with mart_table_main
-- Run this once before the next Build in Data Hub

DROP TABLE IF EXISTS mart_telesales_orders;
DROP TABLE IF EXISTS mart_table_main;

CREATE TABLE IF NOT EXISTS mart_table_main (
  id                   BIGSERIAL PRIMARY KEY,
  -- identifiers
  mmid                 TEXT NOT NULL,
  order_number         TEXT NOT NULL,
  prod_num             TEXT NOT NULL,

  -- call context (NULL for non-attributed rows)
  first_connected_date DATE,
  agent                TEXT,
  call_status          TEXT,
  reason_group         TEXT,
  reason_subgroup      TEXT,
  contact_note         TEXT,
  lead_customers       TEXT,

  -- attribution: days from call to order (NULL for non-attributed)
  days_to_order        INTEGER,
  flag_attr            BOOLEAN NOT NULL DEFAULT FALSE,

  -- sale dimensions
  order_date           DATE NOT NULL,
  channel              TEXT,
  dynamic_cmg          TEXT,

  -- sale metrics
  sales_qty            NUMERIC,
  sales_in_vat         NUMERIC,

  -- product info (Homecare Unilever)
  product_name_th      TEXT,
  product_name_en      TEXT,
  brands               TEXT,
  senior_buyer_name    TEXT,
  buyer_name           TEXT,
  class_name           TEXT,
  subclass             TEXT,
  flag_hoc_unilever    BOOLEAN NOT NULL DEFAULT TRUE,

  -- customer type flags
  flag_first_order     BOOLEAN NOT NULL DEFAULT FALSE,
  flag_retention       BOOLEAN NOT NULL DEFAULT FALSE,
  customer_type        TEXT,
  first_order_date     DATE,

  -- meta
  month                DATE,
  attribution_days     INTEGER,
  refreshed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mmid, order_number, prod_num)
);

CREATE INDEX IF NOT EXISTS idx_mart_main_month             ON mart_table_main (month);
CREATE INDEX IF NOT EXISTS idx_mart_main_mmid              ON mart_table_main (mmid);
CREATE INDEX IF NOT EXISTS idx_mart_main_first_connected   ON mart_table_main (first_connected_date);
CREATE INDEX IF NOT EXISTS idx_mart_main_dynamic_cmg       ON mart_table_main (dynamic_cmg);
CREATE INDEX IF NOT EXISTS idx_mart_main_flag_attr         ON mart_table_main (flag_attr);
CREATE INDEX IF NOT EXISTS idx_mart_main_flag_first_order  ON mart_table_main (flag_first_order);

-- Staging table: same shape as mart_table_main but NO unique constraint and NO indexes.
-- Used during build to compute CTE once and batch-copy to mart (avoids lock budget overflow).
DROP TABLE IF EXISTS _mart_build_staging;
CREATE TABLE IF NOT EXISTS _mart_build_staging (
  mmid                 TEXT,
  order_number         TEXT,
  prod_num             TEXT,
  first_connected_date DATE,
  agent                TEXT,
  call_status          TEXT,
  reason_group         TEXT,
  reason_subgroup      TEXT,
  contact_note         TEXT,
  lead_customers       TEXT,
  days_to_order        INTEGER,
  flag_attr            BOOLEAN,
  order_date           DATE,
  channel              TEXT,
  dynamic_cmg          TEXT,
  sales_qty            NUMERIC,
  sales_in_vat         NUMERIC,
  product_name_th      TEXT,
  product_name_en      TEXT,
  brands               TEXT,
  senior_buyer_name    TEXT,
  buyer_name           TEXT,
  class_name           TEXT,
  subclass             TEXT,
  flag_hoc_unilever    BOOLEAN,
  flag_first_order     BOOLEAN,
  flag_retention       BOOLEAN,
  customer_type        TEXT,
  first_order_date     DATE,
  month                DATE,
  attribution_days     INTEGER
);
