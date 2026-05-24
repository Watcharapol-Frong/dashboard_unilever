-- ── Indexes for view JOIN performance ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_online_sales_prod_num  ON online_sales(prod_num);
CREATE INDEX IF NOT EXISTS idx_offline_sales_prod_num ON offline_sales(prod_num);

-- Composite index for mart build JOIN: telesales_calls ⟶ sales_hoc_all
-- ON s.mmid = tc.mmid AND s.order_date >= tc.first_connected_date
CREATE INDEX IF NOT EXISTS idx_online_sales_mmid_date  ON online_sales  (mmid, order_date);
CREATE INDEX IF NOT EXISTS idx_offline_sales_mmid_date ON offline_sales (mmid, order_date);

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

-- ── Gold View: mart_performance_weekly ──────────────────────────
-- Weekly breakdown of mart_performance
-- Each ISO week is owned by the month containing its Thursday (ISO 8601)
-- Weekly target = monthly_target / number of weeks owned by that month

CREATE OR REPLACE VIEW mart_performance_weekly AS
WITH week_map AS (
  SELECT DISTINCT
    week_label,
    dynamic_cmg,
    DATE_TRUNC('week', order_date)::DATE                          AS week_start,
    DATE_TRUNC('week', order_date)::DATE + 6                      AS week_end,
    DATE_TRUNC('month', DATE_TRUNC('week', order_date)::DATE + 3)::DATE AS owned_month
  FROM mart_telesales_orders
),
weeks_per_month AS (
  SELECT owned_month, dynamic_cmg, COUNT(DISTINCT week_label) AS week_count
  FROM week_map
  GROUP BY owned_month, dynamic_cmg
),
weekly_sales AS (
  SELECT
    week_label,
    dynamic_cmg,
    lead_customers,
    SUM(sales_in_vat)                                                                        AS hoc_sales,
    COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))        AS ordered,
    COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')                       AS new_customers,
    COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                          AS retention,
    COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders
  FROM mart_telesales_orders
  GROUP BY week_label, dynamic_cmg, lead_customers
)
SELECT
  ws.week_label,
  wm.week_start,
  wm.week_end,
  wm.owned_month                                  AS month,
  TO_CHAR(wm.owned_month, 'FMMonth')              AS month_label,
  ws.dynamic_cmg,
  ws.lead_customers,
  ws.hoc_sales                                    AS actual_sales,
  ws.ordered,
  ws.new_customers,
  ws.retention,
  ws.hoc_orders,
  ROUND(COALESCE(p.sales_target, 0) / NULLIF(wpm.week_count, 0), 2) AS weekly_target,
  CASE
    WHEN COALESCE(p.sales_target, 0) > 0 AND wpm.week_count > 0
    THEN ROUND(ws.hoc_sales / (p.sales_target / wpm.week_count), 4)
    ELSE 0
  END                                             AS achievement_ratio,
  p.total_incentive,
  p.total_agent_cost,
  p.total_expense,
  p.roi
FROM weekly_sales ws
JOIN week_map wm      ON wm.week_label = ws.week_label AND wm.dynamic_cmg = ws.dynamic_cmg
JOIN weeks_per_month wpm ON wpm.owned_month = wm.owned_month AND wpm.dynamic_cmg = ws.dynamic_cmg
LEFT JOIN mart_performance p
  ON p.month = wm.owned_month AND p.dynamic_cmg = ws.dynamic_cmg AND p.lead_customers = ws.lead_customers;
