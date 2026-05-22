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

-- ── Gold View: telesales_attribution_map ────────────────────────
-- LEFT JOIN telesales_calls → sales_hoc_all
-- Only post-call orders (order_date >= first_connected_date)
-- NULL rows = called but never ordered
-- days_to_order: only fact pre-computed; flag_attr / customer_type computed at query time

CREATE OR REPLACE VIEW telesales_attribution_map AS
  SELECT
    tc.mmid,
    tc.agent,
    tc.first_connected_date,
    tc.call_status,
    tc.reason_group,
    tc.lead_customers,
    s.order_number,
    s.prod_num,
    s.order_date,
    s.channel,
    s.dynamic_cmg,
    s.sales_qty,
    s.sales_in_vat,
    s.month,
    s.week,
    s.brands,
    s.product_name_th,
    s.product_name_en,
    s.senior_buyer_name,
    s.buyer_name,
    s.class_name,
    s.subclass,
    (s.order_date - tc.first_connected_date)::INT AS days_to_order
  FROM telesales_calls tc
  LEFT JOIN sales_hoc_all s
    ON  s.mmid       = tc.mmid
    AND s.order_date >= tc.first_connected_date;
