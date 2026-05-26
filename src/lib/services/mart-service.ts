import { query, queryOne, queryRowCount } from '@/lib/db'

export async function buildMartMain(attributionDays = 14): Promise<number> {
  // ── 1. Rebuild mart_telesales_orders (ALL orders for called mmids, any product) ──

  await query(`DROP TABLE IF EXISTS mart_telesales_orders`)

  await query(`
    CREATE TABLE mart_telesales_orders (
      mmid                  TEXT        NOT NULL,
      order_number          TEXT        NOT NULL,
      order_date            DATE        NOT NULL,
      channel               TEXT,
      prod_num              TEXT        NOT NULL,
      sales_qty             NUMERIC,
      sales_in_vat          NUMERIC,
      dynamic_cmg           TEXT,
      primary_cmg           TEXT,
      first_connected_date  DATE,
      agent                 TEXT,
      call_status           TEXT,
      lead_customers        TEXT,
      days_to_order         INTEGER,
      product_name_th       TEXT,
      product_name_en       TEXT,
      brands                TEXT,
      class_name            TEXT,
      subclass              TEXT,
      is_hoc_unilever       BOOLEAN     NOT NULL DEFAULT FALSE,
      month                 DATE,
      month_label           TEXT,
      week_label            TEXT,
      refreshed_at          TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (mmid, order_number, prod_num)
    )
  `)

  await query(`
    WITH all_sales AS (
      SELECT order_number, prod_num, order_date, 'online' AS channel, mmid, dynamic_cmg, sales_qty, sales_in_vat
      FROM online_sales WHERE mmid IS NOT NULL
      UNION ALL
      SELECT order_number, prod_num, order_date, 'offline' AS channel, mmid, dynamic_cmg, sales_qty, sales_in_vat
      FROM offline_sales WHERE mmid IS NOT NULL
    ),
    cmg_priority AS (
      SELECT mmid,
        CASE
          WHEN BOOL_OR(dynamic_cmg = 'FOOD RETAILER') THEN 'FOOD RETAILER'
          WHEN BOOL_OR(dynamic_cmg = 'HORECA')        THEN 'HORECA'
          WHEN BOOL_OR(dynamic_cmg = 'END USER')      THEN 'END USER'
          ELSE MAX(dynamic_cmg)
        END AS primary_cmg
      FROM all_sales GROUP BY mmid
    )
    INSERT INTO mart_telesales_orders (
      mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
      dynamic_cmg, primary_cmg, first_connected_date, agent, call_status, lead_customers,
      days_to_order, product_name_th, product_name_en, brands, class_name, subclass,
      is_hoc_unilever, month, month_label, week_label, refreshed_at
    )
    SELECT
      tc.mmid, s.order_number, s.order_date, s.channel, s.prod_num,
      s.sales_qty, s.sales_in_vat,
      s.dynamic_cmg, COALESCE(cp.primary_cmg, s.dynamic_cmg),
      tc.first_connected_date, tc.agent, tc.call_status, tc.lead_customers,
      (s.order_date - tc.first_connected_date)::INT,
      p.product_name_th, p.product_name_en, p.brands, p.class_name, p.subclass,
      (p.product_name_en IS NOT NULL),
      DATE_TRUNC('month', s.order_date)::date,
      TO_CHAR(DATE_TRUNC('month', s.order_date)::date, 'FMMonth'),
      'W' || LPAD(EXTRACT(WEEK FROM s.order_date)::TEXT, 2, '0')
        || '-' || TO_CHAR(DATE_TRUNC('week', s.order_date)::DATE, 'DD/Mon')
        || '-' || TO_CHAR(DATE_TRUNC('week', s.order_date)::DATE + 6, 'DD/Mon'),
      NOW()
    FROM telesales_calls tc
    JOIN all_sales s ON s.mmid = tc.mmid AND s.order_date >= tc.first_connected_date
    LEFT JOIN products p ON p.prod_num = s.prod_num
    LEFT JOIN cmg_priority cp ON cp.mmid = tc.mmid
    WHERE tc.first_connected_date IS NOT NULL
  `)

  // ── 2. Rebuild sales_hoc_orders (HOC-only attributed orders, full attribution logic) ──

  await query(`DROP TABLE IF EXISTS sales_hoc_orders`)

  await query(`
    CREATE TABLE sales_hoc_orders (
      mmid                  TEXT        NOT NULL,
      order_number          TEXT        NOT NULL,
      order_date            DATE        NOT NULL,
      channel               TEXT,
      prod_num              TEXT        NOT NULL,
      sales_qty             NUMERIC,
      sales_in_vat          NUMERIC,
      dynamic_cmg           TEXT,
      primary_cmg           TEXT,
      first_connected_date  DATE,
      agent                 TEXT,
      call_status           TEXT,
      lead_customers        TEXT,
      days_to_order         INTEGER,
      order_seq_in_window   INTEGER,
      is_first_ever_order   BOOLEAN,
      customer_type         TEXT,
      product_name_th       TEXT,
      product_name_en       TEXT,
      brands                TEXT,
      class_name            TEXT,
      subclass              TEXT,
      month                 DATE,
      month_label           TEXT,
      week_label            TEXT,
      refreshed_at          TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (mmid, order_number, prod_num)
    )
  `)

  const rowCount = await queryRowCount(`
    WITH hoc_base AS (
      SELECT * FROM mart_telesales_orders WHERE is_hoc_unilever = TRUE
    ),
    first_orders AS (
      SELECT mmid, MIN(order_date) AS first_order_date FROM hoc_base GROUP BY mmid
    ),
    ranked AS (
      SELECT b.*, fo.first_order_date,
        ROW_NUMBER() OVER (PARTITION BY b.mmid ORDER BY b.order_date, b.order_number) AS order_seq_in_window
      FROM hoc_base b JOIN first_orders fo ON fo.mmid = b.mmid
    )
    INSERT INTO sales_hoc_orders (
      mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
      dynamic_cmg, primary_cmg, first_connected_date, agent, call_status, lead_customers,
      days_to_order, order_seq_in_window, is_first_ever_order, customer_type,
      product_name_th, product_name_en, brands, class_name, subclass,
      month, month_label, week_label, refreshed_at
    )
    SELECT
      mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
      dynamic_cmg, primary_cmg, first_connected_date, agent, call_status, lead_customers,
      days_to_order, order_seq_in_window,
      (order_date = first_order_date) AS is_first_ever_order,
      CASE
        WHEN days_to_order > $1 AND order_date = first_order_date THEN 'first_order_not_converted'
        WHEN days_to_order > $1                                   THEN 'retention_not_converted'
        WHEN order_date = first_order_date                        THEN 'new_customer'
        ELSE                                                           'retention'
      END AS customer_type,
      product_name_th, product_name_en, brands, class_name, subclass,
      month, month_label, week_label, NOW()
    FROM ranked
  `, [attributionDays])

  return rowCount
}

export async function buildMartPerformance(): Promise<number> {
  // Drop old single table if it exists (migration cleanup)
  await query(`DROP TABLE IF EXISTS mart_performance`)
  await query(`DROP TABLE IF EXISTS mart_performance_cmg`)
  await query(`DROP TABLE IF EXISTS mart_performance_month`)

  await query(`
    CREATE TABLE mart_performance_cmg (
      month              DATE NOT NULL,
      dynamic_cmg        TEXT NOT NULL,
      ordered            INTEGER,
      new_customers      INTEGER,
      retention          INTEGER,
      not_conv_new       INTEGER,
      not_conv_retention INTEGER,
      hoc_orders         INTEGER,
      hoc_sales          NUMERIC,
      sales_target       NUMERIC,
      achievement_ratio  NUMERIC,
      refreshed_at       TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (month, dynamic_cmg)
    )
  `)

  await query(`
    CREATE TABLE mart_performance_month (
      month               DATE NOT NULL,
      total_calls         INTEGER,
      reached             INTEGER,
      incentive_per_head  NUMERIC,
      total_incentive     NUMERIC,
      cost_per_agent      NUMERIC,
      cost_per_supervisor NUMERIC,
      supervisor_count    INTEGER,
      agent_count         INTEGER,
      total_agent_cost    NUMERIC,
      total_expense       NUMERIC,
      roi                 NUMERIC,
      refreshed_at        TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (month)
    )
  `)

  // Build mart_performance_cmg — CMG-specific metrics only (from sales_hoc_orders)
  await query(`
    WITH telesales_metrics AS (
      SELECT
        month, dynamic_cmg,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))         AS ordered,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')                       AS new_customers,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                          AS retention,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'first_order_not_converted')          AS not_conv_new,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention_not_converted')            AS not_conv_retention,
        COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
        COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')), 0) AS hoc_sales
      FROM sales_hoc_orders
      GROUP BY month, dynamic_cmg
    )
    INSERT INTO mart_performance_cmg (
      month, dynamic_cmg, ordered, new_customers, retention,
      not_conv_new, not_conv_retention, hoc_orders, hoc_sales,
      sales_target, achievement_ratio
    )
    SELECT
      tm.month, tm.dynamic_cmg,
      tm.ordered, tm.new_customers, tm.retention,
      tm.not_conv_new, tm.not_conv_retention,
      tm.hoc_orders, tm.hoc_sales,
      COALESCE(tg.sales_target, 0) AS sales_target,
      CASE WHEN COALESCE(tg.sales_target, 0) > 0
           THEN tm.hoc_sales / tg.sales_target ELSE 0 END AS achievement_ratio
    FROM telesales_metrics tm
    LEFT JOIN targets tg ON tg.month = tm.month AND tg.dynamic_cmg = tm.dynamic_cmg
  `).catch(() => [] as any[])

  // Build mart_performance_month — month-level metrics (calls, costs, ROI)
  await query(`
    WITH tier_calls AS (
      SELECT
        DATE_TRUNC('month', first_connected_date)::date AS month,
        COUNT(DISTINCT mmid) AS total_calls,
        COUNT(DISTINCT mmid) FILTER (
          WHERE call_status NOT LIKE 'ไม่รับสาย%'
            AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
        ) AS reached
      FROM telesales_calls
      WHERE first_connected_date IS NOT NULL
      GROUP BY 1
    ),
    month_sales AS (
      -- incentive คิดจาก FOOD RETAILER + HORECA เท่านั้น ไม่รวม DISTRIBUTOR / END USER
      SELECT month,
        SUM(hoc_sales) FILTER (WHERE dynamic_cmg IN ('FOOD RETAILER', 'HORECA')) AS incentive_hoc_sales,
        SUM(hoc_sales)                                                            AS total_hoc_sales
      FROM mart_performance_cmg
      GROUP BY month
    ),
    month_achievement AS (
      SELECT
        ms.month,
        CASE WHEN COALESCE(SUM(tg.sales_target), 0) > 0
             THEN ms.incentive_hoc_sales / SUM(tg.sales_target)
             ELSE 0 END AS achievement_ratio
      FROM month_sales ms
      LEFT JOIN targets tg ON tg.month = ms.month
        AND tg.dynamic_cmg IN ('FOOD RETAILER', 'HORECA')
      GROUP BY ms.month, ms.incentive_hoc_sales
    ),
    month_incentive AS (
      SELECT ma.month,
        COALESCE(inc.incentive_per_head, 0) AS incentive_per_head
      FROM month_achievement ma
      LEFT JOIN LATERAL (
        SELECT incentive_per_head FROM incentives
        WHERE tier <= ma.achievement_ratio
        ORDER BY tier DESC LIMIT 1
      ) inc ON true
    ),
    month_roi AS (
      SELECT
        ms.month,
        ROUND(
          ms.total_hoc_sales / NULLIF(
            COALESCE(ah.agent_count, 0)      * COALESCE(mi.incentive_per_head, 0)
            + COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
            + COALESCE(ah.agent_count, 0)      * COALESCE(co.cost_per_agent, 0)
          , 0), 2
        ) AS roi
      FROM month_sales ms
      LEFT JOIN month_incentive mi ON mi.month = ms.month
      LEFT JOIN costs           co ON co.month = ms.month
      LEFT JOIN agent_headcount ah ON ah.month = ms.month
    )
    INSERT INTO mart_performance_month (
      month, total_calls, reached,
      incentive_per_head, total_incentive,
      cost_per_agent, cost_per_supervisor,
      supervisor_count, agent_count,
      total_agent_cost, total_expense, roi
    )
    SELECT
      tc.month,
      tc.total_calls,
      tc.reached,
      COALESCE(mi.incentive_per_head, 0),
      COALESCE(ah.agent_count, 0) * COALESCE(mi.incentive_per_head, 0)          AS total_incentive,
      co.cost_per_agent,
      co.cost_per_supervisor,
      ah.supervisor_count,
      ah.agent_count,
      COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)   * COALESCE(co.cost_per_agent, 0)        AS total_agent_cost,
      COALESCE(ah.agent_count, 0)      * COALESCE(mi.incentive_per_head, 0)
        + COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)      * COALESCE(co.cost_per_agent, 0)     AS total_expense,
      mr.roi
    FROM tier_calls tc
    LEFT JOIN month_incentive mi ON mi.month = tc.month
    LEFT JOIN costs           co ON co.month = tc.month
    LEFT JOIN agent_headcount ah ON ah.month = tc.month
    LEFT JOIN month_roi       mr ON mr.month = tc.month
  `)

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_performance_cmg`)
    .catch(() => null)
  return Number(row?.cnt ?? 0)
}

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; performance: number }> {
  const mart_main   = await buildMartMain(attributionDays)
  const performance = await buildMartPerformance()
  return { mart_main, performance }
}
