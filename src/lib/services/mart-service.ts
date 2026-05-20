import { query, queryOne } from '@/lib/db'

export async function buildMartTelesalesOrders(): Promise<number> {
  await query(`TRUNCATE TABLE mart_telesales_orders`)

  await query(`
    WITH all_sales AS (
      SELECT order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'online' AS channel
        FROM online_sales
      UNION ALL
      SELECT order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'offline' AS channel
        FROM offline_sales
    ),
    first_purchases AS (
      SELECT mmid, MIN(order_date) AS first_order_date FROM all_sales GROUP BY mmid
    ),
    attributed AS (
      SELECT
        t.mmid, s.order_number, s.order_date, s.channel, s.prod_num,
        s.sales_qty, s.sales_in_vat, s.dynamic_cmg,
        t.first_connected_date, t.agent, t.call_status, t.lead_customers,
        (s.order_date - t.first_connected_date)::integer AS days_to_order,
        ROW_NUMBER() OVER (PARTITION BY t.mmid ORDER BY s.order_date, s.order_number)::integer AS order_seq_in_window,
        (s.order_date = fp.first_order_date) AS is_first_ever_order
      FROM telesales_calls t
      JOIN all_sales s
        ON  s.mmid = t.mmid
        AND s.order_date >= t.first_connected_date
        AND s.order_date <= t.first_connected_date + INTERVAL '14 days'
      LEFT JOIN first_purchases fp ON fp.mmid = t.mmid
    )
    INSERT INTO mart_telesales_orders (
      mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat, dynamic_cmg,
      first_connected_date, agent, call_status, lead_customers, days_to_order,
      order_seq_in_window, is_first_ever_order, customer_type,
      product_name_th, product_name_en, brands, class_name, is_hoc_unilever, month
    )
    SELECT
      a.mmid, a.order_number, a.order_date, a.channel, a.prod_num,
      a.sales_qty, a.sales_in_vat, a.dynamic_cmg,
      a.first_connected_date, a.agent, a.call_status, a.lead_customers,
      a.days_to_order, a.order_seq_in_window, a.is_first_ever_order,
      CASE WHEN a.is_first_ever_order THEN 'new_customer' ELSE 'retention' END,
      p.product_name_th, p.product_name_en, p.brands, p.class_name,
      (p.product_name_en IS NOT NULL),
      DATE_TRUNC('month', a.order_date)::date
    FROM attributed a
    LEFT JOIN products p ON p.prod_num = a.prod_num
    WHERE p.product_name_en IS NOT NULL
    ON CONFLICT (mmid, order_number, prod_num) DO UPDATE SET
      sales_qty            = EXCLUDED.sales_qty,
      sales_in_vat         = EXCLUDED.sales_in_vat,
      is_hoc_unilever      = EXCLUDED.is_hoc_unilever,
      customer_type        = EXCLUDED.customer_type,
      refreshed_at         = NOW()
  `)

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_telesales_orders`)
  return Number(row?.cnt ?? 0)
}

export async function buildMartCostIncentive(): Promise<number> {
  await query(`TRUNCATE TABLE mart_cost_incentive`)

  await query(`
    WITH all_sales_by_cmg AS (
      -- ยอดขายรวมทุก product ต่อ (month, dynamic_cmg) จาก online + offline
      SELECT DATE_TRUNC('month', order_date)::date AS month, dynamic_cmg, SUM(sales_in_vat) AS actual_sales
      FROM (
        SELECT order_date, dynamic_cmg, sales_in_vat FROM online_sales  WHERE dynamic_cmg IS NOT NULL
        UNION ALL
        SELECT order_date, dynamic_cmg, sales_in_vat FROM offline_sales WHERE dynamic_cmg IS NOT NULL
      ) s
      GROUP BY 1, 2
    ),
    cmg_months AS (
      -- distinct (month, dynamic_cmg) ที่มียอดขายจริง
      SELECT month, dynamic_cmg FROM all_sales_by_cmg
    ),
    tier_calls AS (
      -- จำนวน call ต่อ (month, lead_customers)
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
      -- lookup incentive_per_head: tier <= achievement_ratio → เอา tier สูงสุดที่ไม่เกิน ratio
      (SELECT incentive_per_head FROM incentives
       WHERE tier <= b.achievement_ratio ORDER BY tier DESC LIMIT 1)          AS incentive_per_head,
      COUNT(DISTINCT m.mmid) *
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

export async function refreshAllMarts(): Promise<{ telesales_orders: number; cost_incentive: number }> {
  const telesales_orders = await buildMartTelesalesOrders()
  const cost_incentive   = await buildMartCostIncentive()
  return { telesales_orders, cost_incentive }
}
