import { query, queryOne } from '@/lib/db'

export async function buildMartMain(attributionDays = 14): Promise<number> {
  await query(`TRUNCATE TABLE mart_table_main`)

  await query(`
    WITH all_sales AS (
      SELECT order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'online' AS channel
        FROM online_sales
      UNION ALL
      SELECT order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'offline' AS channel
        FROM offline_sales
    ),
    hoc_sales AS (
      -- HOC Unilever products only (products table join)
      SELECT s.*, p.product_name_th, p.product_name_en, p.brands, p.class_name
        FROM all_sales s
        INNER JOIN products p ON p.prod_num = s.prod_num
        WHERE p.product_name_en IS NOT NULL
    ),
    first_purchases AS (
      -- First order date per customer (within HOC Unilever scope)
      SELECT mmid, MIN(order_date) AS first_order_date
        FROM hoc_sales
        GROUP BY mmid
    ),
    best_call AS (
      -- For each (mmid, order_number, prod_num), pick the earliest telesales call
      -- that falls within the attribution window before the purchase
      SELECT DISTINCT ON (s.mmid, s.order_number, s.prod_num)
        s.mmid, s.order_number, s.prod_num,
        t.first_connected_date,
        t.agent,
        t.call_status,
        t.lead_customers,
        (s.order_date - t.first_connected_date)::integer AS days_to_order
      FROM hoc_sales s
      JOIN telesales_calls t
        ON  t.mmid = s.mmid
        AND s.order_date >= t.first_connected_date
        AND s.order_date <= t.first_connected_date + (${attributionDays} || ' days')::interval
      ORDER BY s.mmid, s.order_number, s.prod_num, t.first_connected_date ASC
    )
    INSERT INTO mart_table_main (
      mmid, order_number, prod_num,
      order_date, channel, dynamic_cmg,
      sales_qty, sales_in_vat,
      product_name_th, product_name_en, brands, class_name,
      flag_hoc_unilever, flag_attr, flag_first_order, flag_rotation,
      first_connected_date, agent, call_status, lead_customers, days_to_order,
      customer_type, month, attribution_days
    )
    SELECT
      s.mmid, s.order_number, s.prod_num,
      s.order_date, s.channel, s.dynamic_cmg,
      s.sales_qty, s.sales_in_vat,
      s.product_name_th, s.product_name_en, s.brands, s.class_name,
      TRUE                                                                AS flag_hoc_unilever,
      (bc.mmid IS NOT NULL)                                               AS flag_attr,
      (s.order_date = fp.first_order_date)                                AS flag_first_order,
      (s.order_date IS DISTINCT FROM fp.first_order_date)                 AS flag_rotation,
      bc.first_connected_date,
      bc.agent,
      bc.call_status,
      bc.lead_customers,
      bc.days_to_order,
      CASE WHEN s.order_date = fp.first_order_date THEN 'new_customer' ELSE 'retention' END,
      DATE_TRUNC('month', s.order_date)::date,
      ${attributionDays}
    FROM hoc_sales s
    LEFT JOIN best_call bc
      ON  bc.mmid         = s.mmid
      AND bc.order_number = s.order_number
      AND bc.prod_num     = s.prod_num
    LEFT JOIN first_purchases fp ON fp.mmid = s.mmid
    ON CONFLICT (mmid, order_number, prod_num) DO UPDATE SET
      flag_attr            = EXCLUDED.flag_attr,
      flag_first_order     = EXCLUDED.flag_first_order,
      flag_rotation        = EXCLUDED.flag_rotation,
      first_connected_date = EXCLUDED.first_connected_date,
      agent                = EXCLUDED.agent,
      call_status          = EXCLUDED.call_status,
      lead_customers       = EXCLUDED.lead_customers,
      days_to_order        = EXCLUDED.days_to_order,
      customer_type        = EXCLUDED.customer_type,
      attribution_days     = EXCLUDED.attribution_days,
      refreshed_at         = NOW()
  `)

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_table_main`)
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
      COUNT(DISTINCT m.mmid)                                                  AS ordered,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'new_customer') AS new_customers,
      COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'retention')    AS retention,
      COUNT(DISTINCT m.order_number)                                          AS hoc_orders,
      COALESCE(SUM(m.sales_in_vat), 0)                                        AS hoc_sales,
      b.actual_sales,
      b.sales_target,
      b.achievement_ratio,
      (SELECT incentive_per_head FROM incentives
       WHERE tier <= b.achievement_ratio ORDER BY tier DESC LIMIT 1)          AS incentive_per_head,
      COUNT(DISTINCT m.mmid) *
        COALESCE((SELECT incentive_per_head FROM incentives
                  WHERE tier <= b.achievement_ratio ORDER BY tier DESC LIMIT 1), 0) AS total_incentive,
      co.cost_per_agent
    FROM base b
    LEFT JOIN mart_table_main m
      ON  m.month          = b.month
      AND m.dynamic_cmg    = b.dynamic_cmg
      AND m.lead_customers = b.lead_customers
      AND m.flag_attr      = TRUE
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

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; cost_incentive: number }> {
  const mart_main      = await buildMartMain(attributionDays)
  const cost_incentive = await buildMartCostIncentive()
  return { mart_main, cost_incentive }
}
