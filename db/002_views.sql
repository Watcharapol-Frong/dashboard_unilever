-- ── Indexes for view JOIN performance ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_online_sales_prod_num  ON online_sales(prod_num);
CREATE INDEX IF NOT EXISTS idx_offline_sales_prod_num ON offline_sales(prod_num);

-- ── Gold View: sales_hoc_all ─────────────────────────────────────
-- INNER JOIN products ensures only HOC Unilever products are included
-- (product_name_en IS NOT NULL = HOC Unilever)
-- Excludes non-Unilever / unmapped SKUs entirely

CREATE OR REPLACE VIEW sales_hoc_all AS
  SELECT
    o.order_number,
    o.prod_num,
    o.order_date,
    'online'                                    AS channel,
    o.mmid,
    o.dynamic_cmg,
    o.sales_qty,
    o.sales_in_vat,
    DATE_TRUNC('month', o.order_date)::date     AS month,
    'W' || LPAD(EXTRACT(WEEK FROM o.order_date)::TEXT, 2, '0')
      || ' ' || TO_CHAR(DATE_TRUNC('week', o.order_date)::date, 'FMDDMon')
      || '-' || TO_CHAR((DATE_TRUNC('week', o.order_date) + INTERVAL '6 days')::date, 'FMDDMon')
                                                AS week,
    p.brands,
    p.product_name_th,
    p.product_name_en,
    p.senior_buyer_name,
    p.buyer_name,
    p.class_name,
    p.subclass
  FROM online_sales o
  INNER JOIN products p ON p.prod_num = o.prod_num AND p.product_name_en IS NOT NULL

  UNION ALL

  SELECT
    o.order_number,
    o.prod_num,
    o.order_date,
    'offline'                                   AS channel,
    o.mmid,
    o.dynamic_cmg,
    o.sales_qty,
    o.sales_in_vat,
    DATE_TRUNC('month', o.order_date)::date     AS month,
    'W' || LPAD(EXTRACT(WEEK FROM o.order_date)::TEXT, 2, '0')
      || ' ' || TO_CHAR(DATE_TRUNC('week', o.order_date)::date, 'FMDDMon')
      || '-' || TO_CHAR((DATE_TRUNC('week', o.order_date) + INTERVAL '6 days')::date, 'FMDDMon')
                                                AS week,
    p.brands,
    p.product_name_th,
    p.product_name_en,
    p.senior_buyer_name,
    p.buyer_name,
    p.class_name,
    p.subclass
  FROM offline_sales o
  INNER JOIN products p ON p.prod_num = o.prod_num AND p.product_name_en IS NOT NULL;
