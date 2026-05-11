-- ============================================================
-- RPC functions for Sales / Telesales / Products KPI pages
-- Bypasses PostgREST 1000-row cap by aggregating in DB
-- ============================================================

-- 1. Sales totals for a date range (both channels)
CREATE OR REPLACE FUNCTION get_sales_totals(p_from date, p_to date)
RETURNS TABLE (
  channel     text,
  total_sales numeric,
  order_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    'Online'::text                       AS channel,
    COALESCE(SUM(sales_in_vat), 0)       AS total_sales,
    COUNT(DISTINCT order_number)         AS order_count
  FROM online_sales
  WHERE order_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT
    'Offline'::text                      AS channel,
    COALESCE(SUM(sales_in_vat), 0)       AS total_sales,
    COUNT(DISTINCT order_number)         AS order_count
  FROM offline_sales
  WHERE order_date BETWEEN p_from AND p_to;
$$;

-- 2. Sales by date (daily breakdown for charts)
CREATE OR REPLACE FUNCTION get_sales_by_date(p_from date, p_to date)
RETURNS TABLE (
  order_date  date,
  channel     text,
  total_sales numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT order_date, 'Online'::text, COALESCE(SUM(sales_in_vat), 0)
  FROM online_sales
  WHERE order_date BETWEEN p_from AND p_to
  GROUP BY order_date
  UNION ALL
  SELECT order_date, 'Offline'::text, COALESCE(SUM(sales_in_vat), 0)
  FROM offline_sales
  WHERE order_date BETWEEN p_from AND p_to
  GROUP BY order_date
  ORDER BY order_date;
$$;

-- 3. Sales target: sum all dynamic_cmg targets for months in range
CREATE OR REPLACE FUNCTION get_sales_target(p_from date, p_to date)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(sales_target), 0)
  FROM targets
  WHERE month BETWEEN date_trunc('month', p_from)::date
                  AND date_trunc('month', p_to)::date;
$$;

-- 4. Telesales call status counts for a date range
CREATE OR REPLACE FUNCTION get_call_status_counts_range(p_from date, p_to date)
RETURNS TABLE (
  call_status text,
  total       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    call_status,
    COUNT(*) AS total
  FROM telesales_calls
  WHERE first_connected_date BETWEEN p_from AND p_to
  GROUP BY call_status
  ORDER BY total DESC;
$$;

-- 5. Telesales daily trend
CREATE OR REPLACE FUNCTION get_telesales_by_date(p_from date, p_to date)
RETURNS TABLE (
  call_date   date,
  total_calls bigint,
  reached     bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    first_connected_date                                          AS call_date,
    COUNT(*)                                                      AS total_calls,
    COUNT(*) FILTER (WHERE call_status = 'รับสาย')               AS reached
  FROM telesales_calls
  WHERE first_connected_date BETWEEN p_from AND p_to
  GROUP BY first_connected_date
  ORDER BY first_connected_date;
$$;

-- 6. Agent performance summary
CREATE OR REPLACE FUNCTION get_agent_performance(p_from date, p_to date)
RETURNS TABLE (
  agent       text,
  total_calls bigint,
  reached     bigint,
  not_reached bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    agent,
    COUNT(*)                                              AS total_calls,
    COUNT(*) FILTER (WHERE call_status = 'รับสาย')       AS reached,
    COUNT(*) FILTER (WHERE call_status != 'รับสาย')      AS not_reached
  FROM telesales_calls
  WHERE first_connected_date BETWEEN p_from AND p_to
  GROUP BY agent
  ORDER BY total_calls DESC;
$$;

-- 7. Top products by revenue for a date range
CREATE OR REPLACE FUNCTION get_top_products(p_from date, p_to date, p_limit int DEFAULT 50)
RETURNS TABLE (
  prod_num        text,
  brands          text,
  product_name_th text,
  product_name_en text,
  is_uni_hoc_pd   boolean,
  total_qty       numeric,
  total_sales     numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.prod_num,
    p.brands,
    p.product_name_th,
    p.product_name_en,
    (p.product_name_en IS NOT NULL)        AS is_uni_hoc_pd,
    SUM(s.sales_qty)                       AS total_qty,
    SUM(s.sales_in_vat)                    AS total_sales
  FROM (
    SELECT prod_num, sales_qty, sales_in_vat, order_date FROM online_sales
    UNION ALL
    SELECT prod_num, sales_qty, sales_in_vat, order_date FROM offline_sales
  ) s
  LEFT JOIN products p ON p.prod_num = s.prod_num
  WHERE s.order_date BETWEEN p_from AND p_to
  GROUP BY s.prod_num, p.brands, p.product_name_th, p.product_name_en
  ORDER BY total_sales DESC
  LIMIT p_limit;
$$;

-- 8. Count unique mmids with first order in the period (new customers)
CREATE OR REPLACE FUNCTION get_new_mmid_count(p_from date, p_to date)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH all_orders AS (
    SELECT mmid, order_date FROM online_sales WHERE mmid IS NOT NULL
    UNION ALL
    SELECT mmid, order_date FROM offline_sales WHERE mmid IS NOT NULL
  ),
  first_orders AS (
    SELECT mmid, MIN(order_date) AS first_date FROM all_orders GROUP BY mmid
  )
  SELECT COUNT(*)
  FROM first_orders
  WHERE first_date BETWEEN p_from AND p_to;
$$;
