-- ============================================================
-- Fix online_sales + offline_sales:
--   order_number alone is NOT unique — one order has many products (line items)
--   Change PK to auto id, add UNIQUE (order_number, prod_num) composite key
-- ============================================================

-- ── 1. online_sales ──────────────────────────────────────────
-- Drop old single-column PK
ALTER TABLE online_sales DROP CONSTRAINT online_sales_pkey;

-- Add surrogate PK
ALTER TABLE online_sales ADD COLUMN id uuid DEFAULT gen_random_uuid();
ALTER TABLE online_sales ADD PRIMARY KEY (id);

-- Composite unique constraint for upsert conflict target
ALTER TABLE online_sales
  ADD CONSTRAINT online_sales_order_prod_key UNIQUE (order_number, prod_num);

-- ── 2. offline_sales ─────────────────────────────────────────
ALTER TABLE offline_sales DROP CONSTRAINT offline_sales_pkey;

ALTER TABLE offline_sales ADD COLUMN id uuid DEFAULT gen_random_uuid();
ALTER TABLE offline_sales ADD PRIMARY KEY (id);

ALTER TABLE offline_sales
  ADD CONSTRAINT offline_sales_order_prod_key UNIQUE (order_number, prod_num);
