import { query, queryOne } from '@/lib/db'

export async function buildMartMain(attributionDays = 14): Promise<number> {
  await query(`TRUNCATE TABLE mart_telesales_orders`)

  await query(`
    WITH base AS (
      SELECT
        tc.mmid,
        tc.first_connected_date,
        tc.agent,
        tc.call_status,
        tc.lead_customers,
        s.order_number,
        s.prod_num,
        s.order_date,
        s.channel,
        s.dynamic_cmg,
        s.sales_qty,
        s.sales_in_vat,
        s.product_name_th,
        s.product_name_en,
        s.brands,
        s.class_name,
        s.month,
        (s.order_date - tc.first_connected_date)::INT AS days_to_order
      FROM telesales_calls tc
      JOIN sales_hoc_all s
        ON  s.mmid       = tc.mmid
        AND s.order_date >= tc.first_connected_date
      WHERE tc.first_connected_date IS NOT NULL
    ),
    first_orders AS (
      SELECT mmid, MIN(order_date) AS first_order_date
      FROM base
      GROUP BY mmid
    ),
    ranked AS (
      SELECT
        b.*,
        fo.first_order_date,
        ROW_NUMBER() OVER (
          PARTITION BY b.mmid
          ORDER BY b.order_date, b.order_number
        ) AS order_seq_in_window
      FROM base b
      JOIN first_orders fo ON fo.mmid = b.mmid
    )
    INSERT INTO mart_telesales_orders (
      mmid, order_number, order_date, channel, prod_num,
      sales_qty, sales_in_vat, dynamic_cmg,
      first_connected_date, agent, call_status, lead_customers,
      days_to_order, order_seq_in_window, is_first_ever_order, customer_type,
      product_name_th, product_name_en, brands, class_name, is_hoc_unilever,
      month, refreshed_at
    )
    SELECT
      mmid, order_number, order_date, channel, prod_num,
      sales_qty, sales_in_vat, dynamic_cmg,
      first_connected_date, agent, call_status, lead_customers,
      days_to_order,
      order_seq_in_window,
      (order_date = first_order_date)                                          AS is_first_ever_order,
      CASE
        WHEN days_to_order > $1 AND order_date = first_order_date THEN 'first_order_not_converted'
        WHEN days_to_order > $1                                   THEN 'retention_not_converted'
        WHEN order_date = first_order_date                        THEN 'new_customer'
        ELSE                                                           'retention'
      END                                                                      AS customer_type,
      product_name_th, product_name_en, brands, class_name,
      TRUE                                                                     AS is_hoc_unilever,
      month,
      NOW()                                                                    AS refreshed_at
    FROM ranked
    ON CONFLICT (mmid, order_number, prod_num) DO UPDATE SET
      days_to_order       = EXCLUDED.days_to_order,
      order_seq_in_window = EXCLUDED.order_seq_in_window,
      is_first_ever_order = EXCLUDED.is_first_ever_order,
      customer_type       = EXCLUDED.customer_type,
      refreshed_at        = EXCLUDED.refreshed_at
  `, [attributionDays])

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_telesales_orders`)
  return Number(row?.cnt ?? 0)
}

export async function buildMartCostIncentive(): Promise<number> {
  await query(`TRUNCATE TABLE mart_cost_incentive`)

  await query(`
    WITH all_sales_by_cmg AS (
      SELECT DATE_TRUNC('month', order_date)::date AS month, dynamic_cmg, SUM(sales_in_vat) AS actual_sales
      FROM (
        SELECT order_date, dynamic_cmg, sales_in_vat FROM online_sales  WHERE dynamic_cmg IS NOT NULL
        UNION ALL
        SELECT order_date, dynamic_cmg, sales_in_vat FROM offline_sales WHERE dynamic_cmg IS NOT NULL
      ) s
      GROUP BY 1, 2
    ),
    cmg_months AS (
      SELECT month, dynamic_cmg FROM all_sales_by_cmg
    ),
    tier_calls AS (
      SELECT
        DATE_TRUNC('month', first_connected_date)::date AS month,
        lead_customers,
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE call_status = 'รับสาย') AS reached
      FROM telesales_calls WHERE first_connected_date IS NOT NULL
      GROUP BY 1, 2
    ),
    base AS (
      SELECT
        cm.month,
        cm.dynamic_cmg,
        tc.lead_customers,
        tc.total_calls,
        tc.reached,
        asc2.actual_sales,
        COALESCE(tg.sales_target, 0)                                               AS sales_target,
        CASE WHEN COALESCE(tg.sales_target, 0) > 0
             THEN asc2.actual_sales / tg.sales_target ELSE 0 END                   AS achievement_ratio
      FROM cmg_months cm
      JOIN tier_calls tc ON tc.month = cm.month
      LEFT JOIN all_sales_by_cmg asc2 ON asc2.month = cm.month AND asc2.dynamic_cmg = cm.dynamic_cmg
      LEFT JOIN targets tg ON tg.month = cm.month AND tg.dynamic_cmg = cm.dynamic_cmg
    )
    INSERT INTO mart_cost_incentive (
      month, lead_customers, dynamic_cmg, total_calls, reached, ordered,
      new_customers, retention, hoc_orders, hoc_sales,
      actual_sales, sales_target, achievement_ratio,
      incentive_per_head, total_incentive, cost_per_agent
    )
    SELECT
      b.month,
      b.lead_customers,
      b.dynamic_cmg,
      b.total_calls,
      b.reached,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type IN ('new_customer','retention'))   AS ordered,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'new_customer')                  AS new_customers,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'retention')                     AS retention,
      COUNT(DISTINCT m.order_number) FILTER (WHERE m.customer_type IN ('new_customer','retention')) AS hoc_orders,
      COALESCE(SUM(m.sales_in_vat) FILTER (WHERE m.customer_type IN ('new_customer','retention')), 0) AS hoc_sales,
      b.actual_sales,
      b.sales_target,
      b.achievement_ratio,
      (SELECT incentive_per_head FROM incentives
       WHERE tier <= b.achievement_ratio ORDER BY tier DESC LIMIT 1)          AS incentive_per_head,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type IN ('new_customer','retention')) *
        COALESCE((SELECT incentive_per_head FROM incentives
                  WHERE tier <= b.achievement_ratio ORDER BY tier DESC LIMIT 1), 0) AS total_incentive,
      co.cost_per_agent
    FROM base b
    LEFT JOIN mart_telesales_orders m
      ON  m.month          = b.month
      AND m.dynamic_cmg    = b.dynamic_cmg
      AND m.lead_customers = b.lead_customers
    LEFT JOIN costs co ON co.month = b.month
    GROUP BY b.month, b.lead_customers, b.dynamic_cmg,
             b.total_calls, b.reached, b.actual_sales, b.sales_target, b.achievement_ratio, co.cost_per_agent
    ON CONFLICT (month, lead_customers, dynamic_cmg) DO UPDATE SET
      total_calls        = EXCLUDED.total_calls,
      reached            = EXCLUDED.reached,
      ordered            = EXCLUDED.ordered,
      new_customers      = EXCLUDED.new_customers,
      retention          = EXCLUDED.retention,
      hoc_orders         = EXCLUDED.hoc_orders,
      hoc_sales          = EXCLUDED.hoc_sales,
      actual_sales       = EXCLUDED.actual_sales,
      sales_target       = EXCLUDED.sales_target,
      achievement_ratio  = EXCLUDED.achievement_ratio,
      incentive_per_head = EXCLUDED.incentive_per_head,
      total_incentive    = EXCLUDED.total_incentive,
      cost_per_agent     = EXCLUDED.cost_per_agent,
      refreshed_at       = NOW()
  `)

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_cost_incentive`)
  return Number(row?.cnt ?? 0)
}

export async function refreshMartForMmids(mmids: string[], attributionDays = 14): Promise<number> {
  if (mmids.length === 0) return 0

  await query(`DELETE FROM mart_telesales_orders WHERE mmid = ANY($1)`, [mmids])

  await query(`
    WITH base AS (
      SELECT
        tc.mmid,
        tc.first_connected_date,
        tc.agent,
        tc.call_status,
        tc.lead_customers,
        s.order_number,
        s.prod_num,
        s.order_date,
        s.channel,
        s.dynamic_cmg,
        s.sales_qty,
        s.sales_in_vat,
        s.product_name_th,
        s.product_name_en,
        s.brands,
        s.class_name,
        s.month,
        (s.order_date - tc.first_connected_date)::INT AS days_to_order
      FROM telesales_calls tc
      JOIN sales_hoc_all s
        ON  s.mmid       = tc.mmid
        AND s.order_date >= tc.first_connected_date
      WHERE tc.first_connected_date IS NOT NULL
        AND tc.mmid = ANY($2)
    ),
    first_orders AS (
      SELECT mmid, MIN(order_date) AS first_order_date
      FROM base
      GROUP BY mmid
    ),
    ranked AS (
      SELECT
        b.*,
        fo.first_order_date,
        ROW_NUMBER() OVER (
          PARTITION BY b.mmid
          ORDER BY b.order_date, b.order_number
        ) AS order_seq_in_window
      FROM base b
      JOIN first_orders fo ON fo.mmid = b.mmid
    )
    INSERT INTO mart_telesales_orders (
      mmid, order_number, order_date, channel, prod_num,
      sales_qty, sales_in_vat, dynamic_cmg,
      first_connected_date, agent, call_status, lead_customers,
      days_to_order, order_seq_in_window, is_first_ever_order, customer_type,
      product_name_th, product_name_en, brands, class_name, is_hoc_unilever,
      month, refreshed_at
    )
    SELECT
      mmid, order_number, order_date, channel, prod_num,
      sales_qty, sales_in_vat, dynamic_cmg,
      first_connected_date, agent, call_status, lead_customers,
      days_to_order,
      order_seq_in_window,
      (order_date = first_order_date)                                          AS is_first_ever_order,
      CASE
        WHEN days_to_order > $1 AND order_date = first_order_date THEN 'first_order_not_converted'
        WHEN days_to_order > $1                                   THEN 'retention_not_converted'
        WHEN order_date = first_order_date                        THEN 'new_customer'
        ELSE                                                           'retention'
      END                                                                      AS customer_type,
      product_name_th, product_name_en, brands, class_name,
      TRUE                                                                     AS is_hoc_unilever,
      month,
      NOW()                                                                    AS refreshed_at
    FROM ranked
    ON CONFLICT (mmid, order_number, prod_num) DO UPDATE SET
      days_to_order       = EXCLUDED.days_to_order,
      order_seq_in_window = EXCLUDED.order_seq_in_window,
      is_first_ever_order = EXCLUDED.is_first_ever_order,
      customer_type       = EXCLUDED.customer_type,
      refreshed_at        = EXCLUDED.refreshed_at
  `, [attributionDays, mmids])

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_telesales_orders WHERE mmid = ANY($1)`, [mmids])
  return Number(row?.cnt ?? 0)
}

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; cost_incentive: number }> {
  const mart_main      = await buildMartMain(attributionDays)
  const cost_incentive = await buildMartCostIncentive()
  return { mart_main, cost_incentive }
}
