import { query, queryOne, queryRowCount } from '@/lib/db'

const ON_CONFLICT_CLAUSE = `
  ON CONFLICT (mmid, order_number, prod_num) DO UPDATE SET
    days_to_order       = EXCLUDED.days_to_order,
    order_seq_in_window = EXCLUDED.order_seq_in_window,
    is_first_ever_order = EXCLUDED.is_first_ever_order,
    customer_type       = EXCLUDED.customer_type,
    month_label         = EXCLUDED.month_label,
    week_label          = EXCLUDED.week_label,
    refreshed_at        = EXCLUDED.refreshed_at`

const buildInsertSQL = (withMmidFilter: boolean, upsert = true) => `
  WITH base AS (
    SELECT
      tc.mmid, tc.first_connected_date, tc.agent, tc.call_status, tc.lead_customers,
      s.order_number, s.prod_num, s.order_date, s.channel, s.dynamic_cmg,
      s.sales_qty, s.sales_in_vat, s.product_name_th, s.product_name_en,
      s.brands, s.class_name, s.month,
      (s.order_date - tc.first_connected_date)::INT AS days_to_order
    FROM telesales_calls tc
    JOIN sales_hoc_all s
      ON  s.mmid       = tc.mmid
      AND s.order_date >= tc.first_connected_date
    WHERE tc.first_connected_date IS NOT NULL
    ${withMmidFilter ? 'AND tc.mmid = ANY($2)' : ''}
  ),
  first_orders AS (
    SELECT mmid, MIN(order_date) AS first_order_date FROM base GROUP BY mmid
  ),
  ranked AS (
    SELECT b.*, fo.first_order_date,
      ROW_NUMBER() OVER (PARTITION BY b.mmid ORDER BY b.order_date, b.order_number) AS order_seq_in_window
    FROM base b JOIN first_orders fo ON fo.mmid = b.mmid
  )
  INSERT INTO mart_telesales_orders (
    mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
    dynamic_cmg, first_connected_date, agent, call_status, lead_customers,
    days_to_order, order_seq_in_window, is_first_ever_order, customer_type,
    product_name_th, product_name_en, brands, class_name, is_hoc_unilever, month, month_label, week_label, refreshed_at
  )
  SELECT
    mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
    dynamic_cmg, first_connected_date, agent, call_status, lead_customers,
    days_to_order, order_seq_in_window,
    (order_date = first_order_date) AS is_first_ever_order,
    CASE
      WHEN days_to_order > $1 AND order_date = first_order_date THEN 'first_order_not_converted'
      WHEN days_to_order > $1                                   THEN 'retention_not_converted'
      WHEN order_date = first_order_date                        THEN 'new_customer'
      ELSE                                                           'retention'
    END AS customer_type,
    product_name_th, product_name_en, brands, class_name,
    TRUE AS is_hoc_unilever, month,
    TO_CHAR(month, 'FMMonth') AS month_label,
    'W' || LPAD(EXTRACT(WEEK FROM order_date)::TEXT, 2, '0')
      || '-' || TO_CHAR(DATE_TRUNC('week', order_date)::DATE, 'DD/Mon')
      || '-' || TO_CHAR(DATE_TRUNC('week', order_date)::DATE + 6, 'DD/Mon') AS week_label,
    NOW() AS refreshed_at
  FROM ranked
  ${upsert ? ON_CONFLICT_CLAUSE : ''}
`

export async function buildMartMain(attributionDays = 14): Promise<number> {
  await query(`DELETE FROM mart_telesales_orders WHERE true`)
  return queryRowCount(buildInsertSQL(false, false), [attributionDays])
}

export async function refreshMartForMmids(mmids: string[], attributionDays = 14): Promise<number> {
  if (mmids.length === 0) return 0
  await query(`DELETE FROM mart_telesales_orders WHERE mmid = ANY($1)`, [mmids])
  await query(buildInsertSQL(true), [attributionDays, mmids])
  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_telesales_orders WHERE mmid = ANY($1)`, [mmids])
  return Number(row?.cnt ?? 0)
}

export async function refreshMartChunk(
  offset: number,
  limit: number,
  attributionDays = 14,
  truncate = false,
  precomputedTotal?: number,
): Promise<{ processed: number; done: boolean; next_offset: number; total: number }> {
  if (truncate) await query(`TRUNCATE TABLE mart_telesales_orders`)

  const total = (precomputedTotal !== undefined && precomputedTotal > 0)
    ? precomputedTotal
    : await queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM telesales_calls WHERE first_connected_date IS NOT NULL`
      ).then(r => Number(r?.cnt ?? 0))

  const rows = await query<{ mmid: string }>(
    `SELECT mmid FROM telesales_calls WHERE first_connected_date IS NOT NULL ORDER BY mmid LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  const mmids = rows.map(r => r.mmid)

  if (mmids.length > 0) {
    await query(buildInsertSQL(true), [attributionDays, mmids])
  }

  const done = mmids.length < limit
  return { processed: mmids.length, done, next_offset: offset + mmids.length, total }
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

  // Build mart_performance_cmg — CMG-specific metrics only
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
      FROM mart_telesales_orders
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
  `)

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
  return Number(row?.cnt ?? 0)
}

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; performance: number }> {
  const mart_main   = await buildMartMain(attributionDays)
  const performance = await buildMartPerformance()
  return { mart_main, performance }
}
