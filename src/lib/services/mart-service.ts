import { query, queryOne } from '@/lib/db'

// CTE block shared across all monthly batches.
// The batch filter (WHERE month = $2) is appended per-call so that
// first_attr_order / first_nonattr_order always compute globally.
function martCTE(attributionDays: number) {
  return `
    WITH all_sales AS (
      SELECT mmid, order_number, order_date, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'online' AS channel
        FROM online_sales
      UNION ALL
      SELECT mmid, order_number, order_date, prod_num, sales_qty, sales_in_vat, dynamic_cmg, 'offline' AS channel
        FROM offline_sales
    ),
    telesales_mmids AS (
      SELECT DISTINCT mmid FROM telesales_calls
    ),
    attributed AS (
      SELECT DISTINCT ON (s.mmid, s.order_number, s.prod_num)
        tc.first_connected_date,
        tc.agent,
        tc.call_status,
        tc.reason_group,
        tc.reason_subgroup,
        tc.contact_note,
        tc.lead_customers,
        s.mmid,
        s.order_number,
        s.order_date,
        s.prod_num,
        s.sales_qty,
        s.sales_in_vat,
        s.dynamic_cmg,
        s.channel,
        (s.order_date - tc.first_connected_date)::integer AS days_to_order,
        TRUE AS flag_attr,
        p.product_name_th,
        p.product_name_en,
        p.brands,
        p.senior_buyer_name,
        p.buyer_name,
        p.class_name,
        p.subclass
      FROM telesales_calls tc
      JOIN all_sales s
        ON  s.mmid      = tc.mmid
        AND s.order_date >= tc.first_connected_date
        AND s.order_date <= tc.first_connected_date + (${attributionDays} || ' days')::interval
      JOIN products p
        ON  p.prod_num        = s.prod_num
        AND p.product_name_en IS NOT NULL
      ORDER BY s.mmid, s.order_number, s.prod_num, tc.first_connected_date DESC
    ),
    retention_ext AS (
      SELECT
        NULL::date  AS first_connected_date,
        NULL::text  AS agent,
        NULL::text  AS call_status,
        NULL::text  AS reason_group,
        NULL::text  AS reason_subgroup,
        NULL::text  AS contact_note,
        NULL::text  AS lead_customers,
        s.mmid,
        s.order_number,
        s.order_date,
        s.prod_num,
        s.sales_qty,
        s.sales_in_vat,
        s.dynamic_cmg,
        s.channel,
        NULL::integer AS days_to_order,
        FALSE         AS flag_attr,
        p.product_name_th,
        p.product_name_en,
        p.brands,
        p.senior_buyer_name,
        p.buyer_name,
        p.class_name,
        p.subclass
      FROM all_sales s
      JOIN products p ON p.prod_num = s.prod_num AND p.product_name_en IS NOT NULL
      JOIN telesales_mmids tm ON tm.mmid = s.mmid
      WHERE NOT EXISTS (
        SELECT 1 FROM attributed a
        WHERE a.mmid = s.mmid AND a.order_number = s.order_number AND a.prod_num = s.prod_num
      )
    ),
    combined AS (
      SELECT * FROM attributed
      UNION ALL
      SELECT * FROM retention_ext
    ),
    first_attr_order AS (
      SELECT mmid, MIN(order_date) AS first_attr_date FROM attributed GROUP BY mmid
    ),
    first_nonattr_order AS (
      SELECT mmid, MIN(order_date) AS first_nonattr_date FROM retention_ext GROUP BY mmid
    )
  `
}

export async function buildMartMain(attributionDays = 14): Promise<number> {
  // Phase 1: Clear both tables
  await query(`TRUNCATE TABLE mart_table_main`)
  await query(`TRUNCATE TABLE _mart_build_staging`)

  // Phase 2: Compute CTE ONCE and write to staging (no unique constraint → pure Puts, no lock budget issue)
  await query(`
    ${martCTE(attributionDays)}
    INSERT INTO _mart_build_staging (
      mmid, order_number, prod_num,
      first_connected_date, agent, call_status,
      reason_group, reason_subgroup, contact_note, lead_customers,
      days_to_order, flag_attr,
      order_date, channel, dynamic_cmg,
      sales_qty, sales_in_vat,
      product_name_th, product_name_en, brands,
      senior_buyer_name, buyer_name, class_name, subclass,
      flag_hoc_unilever, flag_first_order, flag_retention, customer_type,
      first_order_date,
      month, attribution_days
    )
    SELECT
      c.mmid, c.order_number, c.prod_num,
      c.first_connected_date, c.agent, c.call_status,
      c.reason_group, c.reason_subgroup, c.contact_note, c.lead_customers,
      c.days_to_order, c.flag_attr,
      c.order_date, c.channel, c.dynamic_cmg,
      c.sales_qty, c.sales_in_vat,
      c.product_name_th, c.product_name_en, c.brands,
      c.senior_buyer_name, c.buyer_name, c.class_name, c.subclass,
      TRUE,
      (c.flag_attr = TRUE AND c.order_date = fa.first_attr_date),
      (fa.first_attr_date IS NOT NULL
        AND NOT (c.flag_attr = TRUE AND c.order_date = fa.first_attr_date)),
      CASE
        WHEN c.flag_attr = TRUE AND c.order_date = fa.first_attr_date
          THEN 'new_customer'
        WHEN fa.first_attr_date IS NOT NULL
          AND NOT (c.flag_attr = TRUE AND c.order_date = fa.first_attr_date)
          THEN 'retention'
        WHEN fa.first_attr_date IS NULL AND c.order_date = fn.first_nonattr_date
          THEN 'first_order_not_con'
        WHEN fa.first_attr_date IS NULL AND c.order_date > fn.first_nonattr_date
          THEN 'reten_not_con'
        ELSE NULL
      END,
      fa.first_attr_date,
      DATE_TRUNC('month', c.order_date)::date,
      ${attributionDays}
    FROM combined c
    LEFT JOIN first_attr_order    fa ON fa.mmid = c.mmid
    LEFT JOIN first_nonattr_order fn ON fn.mmid = c.mmid
  `)

  // Phase 3: Batch-copy staging → mart in fixed-size chunks via rownum.
  // Fixed chunk (not month) = safe regardless of attribution window size.
  // Use actual MIN/MAX rownum — TRUNCATE does not reset BIGSERIAL sequences.
  const CHUNK = 4_000
  const rangeRow = await queryOne<{ lo: string; hi: string }>(`
    SELECT MIN(rownum) AS lo, MAX(rownum) AS hi FROM _mart_build_staging
  `)
  const loRn = Number(rangeRow?.lo ?? 0)
  const hiRn = Number(rangeRow?.hi ?? -1)

  for (let offset = loRn; offset <= hiRn; offset += CHUNK) {
    await query(`
      INSERT INTO mart_table_main (
        mmid, order_number, prod_num,
        first_connected_date, agent, call_status,
        reason_group, reason_subgroup, contact_note, lead_customers,
        days_to_order, flag_attr,
        order_date, channel, dynamic_cmg,
        sales_qty, sales_in_vat,
        product_name_th, product_name_en, brands,
        senior_buyer_name, buyer_name, class_name, subclass,
        flag_hoc_unilever, flag_first_order, flag_retention, customer_type,
        first_order_date,
        month, attribution_days
      )
      SELECT
        mmid, order_number, prod_num,
        first_connected_date, agent, call_status,
        reason_group, reason_subgroup, contact_note, lead_customers,
        days_to_order, flag_attr,
        order_date, channel, dynamic_cmg,
        sales_qty, sales_in_vat,
        product_name_th, product_name_en, brands,
        senior_buyer_name, buyer_name, class_name, subclass,
        flag_hoc_unilever, flag_first_order, flag_retention, customer_type,
        first_order_date,
        month, attribution_days
      FROM _mart_build_staging
      WHERE rownum >= $1 AND rownum < $2
      ON CONFLICT (mmid, order_number, prod_num) DO NOTHING
    `, [offset, offset + CHUNK])
  }

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
