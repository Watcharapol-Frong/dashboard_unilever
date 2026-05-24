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
  await query(`DROP TABLE IF EXISTS mart_performance`)
  await query(`
    CREATE TABLE mart_performance (
      month              DATE NOT NULL,
      dynamic_cmg        TEXT NOT NULL,
      total_calls        INTEGER,
      reached            INTEGER,
      ordered            INTEGER,
      new_customers      INTEGER,
      retention          INTEGER,
      not_conv_new       INTEGER,
      not_conv_retention INTEGER,
      hoc_orders         INTEGER,
      hoc_sales          NUMERIC,
      sales_target       NUMERIC,
      achievement_ratio  NUMERIC,
      incentive_per_head NUMERIC,
      total_incentive    NUMERIC,
      cost_per_agent     NUMERIC,
      cost_per_supervisor NUMERIC,
      supervisor_count   INTEGER,
      agent_count        INTEGER,
      total_agent_cost   NUMERIC,
      total_expense      NUMERIC,
      roi                NUMERIC,
      refreshed_at       TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (month, dynamic_cmg)
    )
  `)
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
    telesales_metrics AS (
      SELECT
        month, dynamic_cmg,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))                  AS ordered,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')                                AS new_customers,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                                   AS retention,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'first_order_not_converted')                   AS not_conv_new,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention_not_converted')                     AS not_conv_retention,
        COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention'))         AS hoc_orders,
        COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')), 0)      AS hoc_sales
      FROM mart_telesales_orders
      GROUP BY month, dynamic_cmg
    ),
    month_achievement AS (
      SELECT
        tm.month,
        CASE WHEN COALESCE(SUM(tg.sales_target), 0) > 0
             THEN SUM(tm.hoc_sales) / SUM(tg.sales_target)
             ELSE 0 END AS achievement_ratio
      FROM telesales_metrics tm
      LEFT JOIN targets tg ON tg.month = tm.month AND tg.dynamic_cmg = tm.dynamic_cmg
      GROUP BY tm.month
    ),
    month_incentive AS (
      SELECT ma.month,
        ma.achievement_ratio AS month_achievement_ratio,
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
        tm.month,
        ROUND(
          SUM(tm.hoc_sales) / NULLIF(
            COALESCE(ah.agent_count, 0) * COALESCE(mi.incentive_per_head, 0)
            + COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
            + COALESCE(ah.agent_count, 0)      * COALESCE(co.cost_per_agent, 0)
          , 0), 2
        ) AS roi
      FROM telesales_metrics tm
      LEFT JOIN month_incentive  mi ON mi.month = tm.month
      LEFT JOIN costs            co ON co.month = tm.month
      LEFT JOIN agent_headcount  ah ON ah.month = tm.month
      GROUP BY tm.month, mi.incentive_per_head, ah.agent_count, ah.supervisor_count,
               co.cost_per_supervisor, co.cost_per_agent
    ),
    base AS (
      SELECT
        tm.month, tm.dynamic_cmg,
        COALESCE(tc.total_calls, 0) AS total_calls,
        COALESCE(tc.reached,     0) AS reached,
        tm.ordered, tm.new_customers, tm.retention,
        tm.not_conv_new, tm.not_conv_retention,
        tm.hoc_orders, tm.hoc_sales,
        COALESCE(tg.sales_target, 0) AS sales_target,
        CASE WHEN COALESCE(tg.sales_target, 0) > 0
             THEN tm.hoc_sales / tg.sales_target ELSE 0 END AS achievement_ratio,
        mi.incentive_per_head,
        mi.month_achievement_ratio,
        mr.roi AS month_roi
      FROM telesales_metrics tm
      LEFT JOIN tier_calls tc      ON tc.month = tm.month
      LEFT JOIN targets tg         ON tg.month = tm.month AND tg.dynamic_cmg = tm.dynamic_cmg
      LEFT JOIN month_incentive mi ON mi.month = tm.month
      LEFT JOIN month_roi       mr ON mr.month = tm.month
    )
    INSERT INTO mart_performance (
      month, dynamic_cmg, total_calls, reached, ordered,
      new_customers, retention, not_conv_new, not_conv_retention, hoc_orders, hoc_sales,
      sales_target, achievement_ratio,
      incentive_per_head, total_incentive,
      cost_per_agent, cost_per_supervisor, supervisor_count, agent_count,
      total_agent_cost, total_expense, roi
    )
    SELECT
      b.month, b.dynamic_cmg,
      b.total_calls, b.reached,
      b.ordered, b.new_customers, b.retention,
      b.not_conv_new, b.not_conv_retention,
      b.hoc_orders, b.hoc_sales,
      b.sales_target, b.achievement_ratio,
      b.incentive_per_head,
      COALESCE(ah.agent_count, 0) * b.incentive_per_head                                        AS total_incentive,
      co.cost_per_agent,
      co.cost_per_supervisor,
      ah.supervisor_count,
      ah.agent_count,
      COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)   * COALESCE(co.cost_per_agent, 0)                        AS total_agent_cost,
      COALESCE(ah.agent_count, 0) * b.incentive_per_head
        + COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)      * COALESCE(co.cost_per_agent, 0)                     AS total_expense,
      b.month_roi                                                                                 AS roi
    FROM base b
    LEFT JOIN costs co           ON co.month = b.month
    LEFT JOIN agent_headcount ah ON ah.month = b.month
    ON CONFLICT (month, dynamic_cmg) DO UPDATE SET
      total_calls         = EXCLUDED.total_calls,
      reached             = EXCLUDED.reached,
      ordered             = EXCLUDED.ordered,
      new_customers       = EXCLUDED.new_customers,
      retention           = EXCLUDED.retention,
      not_conv_new        = EXCLUDED.not_conv_new,
      not_conv_retention  = EXCLUDED.not_conv_retention,
      hoc_orders          = EXCLUDED.hoc_orders,
      hoc_sales           = EXCLUDED.hoc_sales,
      sales_target        = EXCLUDED.sales_target,
      achievement_ratio   = EXCLUDED.achievement_ratio,
      incentive_per_head  = EXCLUDED.incentive_per_head,
      total_incentive     = EXCLUDED.total_incentive,
      cost_per_agent      = EXCLUDED.cost_per_agent,
      cost_per_supervisor = EXCLUDED.cost_per_supervisor,
      supervisor_count    = EXCLUDED.supervisor_count,
      agent_count         = EXCLUDED.agent_count,
      total_agent_cost    = EXCLUDED.total_agent_cost,
      total_expense       = EXCLUDED.total_expense,
      roi                 = EXCLUDED.roi,
      refreshed_at        = NOW()
  `)
  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_performance`)
  return Number(row?.cnt ?? 0)
}

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; performance: number }> {
  const mart_main   = await buildMartMain(attributionDays)
  const performance = await buildMartPerformance()
  return { mart_main, performance }
}
