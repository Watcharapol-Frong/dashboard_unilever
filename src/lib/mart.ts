import { query, queryOne, queryRowCount } from '@/lib/db'
import { reachedCond } from '@/lib/metrics'

// Ensures all schema extensions exist — called at build time and on server startup.
// Safe to call multiple times (all DDL is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
export async function ensureSchemaExtensions(): Promise<void> {
  await Promise.all([
    query(`
      CREATE TABLE IF NOT EXISTS mmid_cmg_map (
        mmid                  TEXT NOT NULL PRIMARY KEY,
        primary_cmg           TEXT,
        first_connected_date  DATE
      )
    `),
    query(`
      CREATE TABLE IF NOT EXISTS mart_builds (
        id               BIGSERIAL    PRIMARY KEY,
        started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        finished_at      TIMESTAMPTZ,
        attribution_days INTEGER,
        duration_ms      INTEGER,
        status           TEXT         NOT NULL DEFAULT 'running',
        row_counts       JSONB,
        error_message    TEXT
      )
    `),
    query(`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS file_hash TEXT`).catch(() => {}),
    query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ub_file_hash
        ON upload_batches (file_hash)
        WHERE file_hash IS NOT NULL
    `).catch(() => {}),
  ])
}

export async function buildMartMain(attributionDays = 14): Promise<number> {
  // ── 1. mmid_cmg_map — tiny lookup: mmid → primary_cmg + first_connected_date ──
  await query(`DROP TABLE IF EXISTS mmid_cmg_map`)
  await query(`
    CREATE TABLE mmid_cmg_map (
      mmid                  TEXT NOT NULL PRIMARY KEY,
      primary_cmg           TEXT,
      first_connected_date  DATE
    )
  `)
  await query(`
    WITH all_sales AS (
      SELECT mmid, dynamic_cmg FROM online_sales  WHERE mmid IS NOT NULL
      UNION ALL
      SELECT mmid, dynamic_cmg FROM offline_sales WHERE mmid IS NOT NULL
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
    INSERT INTO mmid_cmg_map (mmid, primary_cmg, first_connected_date)
    SELECT tc.mmid, cp.primary_cmg, tc.first_connected_date
    FROM telesales_calls tc
    LEFT JOIN cmg_priority cp ON cp.mmid = tc.mmid
    WHERE tc.first_connected_date IS NOT NULL
  `)

  // ── 2. sales_hoc_orders — HOC-attributed orders built directly from source tables ──
  // Replaces the old two-step approach (mart_telesales_orders → filter HOC → apply window).
  // is_hoc_unilever ≡ product exists in products table with a product_name_en.
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
    WITH all_sales AS (
      SELECT order_number, prod_num, order_date, 'online'  AS channel, mmid, dynamic_cmg, sales_qty, sales_in_vat
      FROM online_sales  WHERE mmid IS NOT NULL
      UNION ALL
      SELECT order_number, prod_num, order_date, 'offline' AS channel, mmid, dynamic_cmg, sales_qty, sales_in_vat
      FROM offline_sales WHERE mmid IS NOT NULL
    ),
    attributed AS (
      SELECT
        tc.mmid, s.order_number, s.order_date, s.channel, s.prod_num,
        s.sales_qty, s.sales_in_vat, s.dynamic_cmg,
        mc.primary_cmg,
        tc.first_connected_date, tc.agent, tc.call_status, tc.lead_customers,
        (s.order_date - tc.first_connected_date)::INT AS days_to_order,
        p.product_name_th, p.product_name_en, p.brands, p.class_name, p.subclass,
        DATE_TRUNC('month', s.order_date)::date AS month,
        TO_CHAR(DATE_TRUNC('month', s.order_date)::date, 'FMMonth') AS month_label,
        'W' || LPAD(EXTRACT(WEEK FROM s.order_date)::TEXT, 2, '0')
          || '-' || TO_CHAR(DATE_TRUNC('week', s.order_date)::DATE, 'DD/Mon')
          || '-' || TO_CHAR(DATE_TRUNC('week', s.order_date)::DATE + 6, 'DD/Mon') AS week_label
      FROM telesales_calls tc
      JOIN all_sales       s  ON  s.mmid = tc.mmid
                               AND s.order_date >= tc.first_connected_date
      JOIN products        p  ON  p.prod_num = s.prod_num
                               AND p.product_name_en IS NOT NULL
      JOIN mmid_cmg_map   mc  ON mc.mmid = tc.mmid
      WHERE tc.first_connected_date IS NOT NULL
    ),
    first_orders AS (
      SELECT mmid, MIN(order_date) AS first_order_date FROM attributed GROUP BY mmid
    )
    INSERT INTO sales_hoc_orders (
      mmid, order_number, order_date, channel, prod_num, sales_qty, sales_in_vat,
      dynamic_cmg, primary_cmg, first_connected_date, agent, call_status, lead_customers,
      days_to_order, customer_type,
      product_name_th, product_name_en, brands, class_name, subclass,
      month, month_label, week_label, refreshed_at
    )
    SELECT
      a.mmid, a.order_number, a.order_date, a.channel, a.prod_num,
      a.sales_qty, a.sales_in_vat, a.dynamic_cmg, a.primary_cmg,
      a.first_connected_date, a.agent, a.call_status, a.lead_customers,
      a.days_to_order,
      CASE
        WHEN a.days_to_order > $1 AND a.order_date = fo.first_order_date THEN 'first_order_not_converted'
        WHEN a.days_to_order > $1                                         THEN 'retention_not_converted'
        WHEN a.order_date    = fo.first_order_date                        THEN 'new_customer'
        ELSE                                                                    'retention'
      END,
      a.product_name_th, a.product_name_en, a.brands, a.class_name, a.subclass,
      a.month, a.month_label, a.week_label, NOW()
    FROM attributed a
    JOIN first_orders fo ON fo.mmid = a.mmid
  `, [attributionDays])

  // Indexes — parallel, post-populate
  await Promise.all([
    query(`CREATE INDEX IF NOT EXISTS idx_sho_month_dcmg ON sales_hoc_orders (month, dynamic_cmg)`),
    query(`CREATE INDEX IF NOT EXISTS idx_sho_month_pcmg ON sales_hoc_orders (month, primary_cmg)`),
    query(`CREATE INDEX IF NOT EXISTS idx_sho_mmid       ON sales_hoc_orders (mmid)`),
    query(`CREATE INDEX IF NOT EXISTS idx_sho_ctype      ON sales_hoc_orders (customer_type)`),
    query(`CREATE INDEX IF NOT EXISTS idx_sho_agent      ON sales_hoc_orders (agent)`),
    query(`CREATE INDEX IF NOT EXISTS idx_sho_date       ON sales_hoc_orders (order_date)`),
    query(`CREATE INDEX IF NOT EXISTS idx_mcm_pcmg       ON mmid_cmg_map (primary_cmg)`),
  ])

  return rowCount
}

export async function buildMartPerformance(attributionDays = 14): Promise<number> {
  await query(`DROP TABLE IF EXISTS mart_performance`)
  await query(`DROP TABLE IF EXISTS mart_performance_cmg`)
  await query(`DROP TABLE IF EXISTS mart_performance_month`)

  // Trimmed schema: removed not_conv_new / not_conv_retention (never queried by any route)
  await query(`
    CREATE TABLE mart_performance_cmg (
      month              DATE    NOT NULL,
      dynamic_cmg        TEXT    NOT NULL,
      total_calls        INTEGER,
      reached            INTEGER,
      ordered            INTEGER,
      new_customers      INTEGER,
      retention          INTEGER,
      hoc_orders         INTEGER,
      hoc_sales          NUMERIC,
      sales_target       NUMERIC,
      achievement_ratio  NUMERIC,
      refreshed_at       TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (month, dynamic_cmg)
    )
  `)

  // Trimmed schema: removed individual cost/headcount breakdowns (total_expense already encodes them)
  await query(`
    CREATE TABLE mart_performance_month (
      month               DATE    NOT NULL,
      total_calls         INTEGER,
      reached             INTEGER,
      incentive_per_head  NUMERIC,
      total_incentive     NUMERIC,
      total_agent_cost    NUMERIC,
      total_expense       NUMERIC,
      roi                 NUMERIC,
      attribution_days    INTEGER,
      refreshed_at        TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (month)
    )
  `)

  // Build mart_performance_cmg
  // customer_counts use primary_cmg so each mmid counts in exactly one CMG row.
  // sales_amounts  use dynamic_cmg (the order's actual segment tag).
  await query(`
    WITH customer_metrics AS (
      SELECT
        month, primary_cmg AS dynamic_cmg,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))  AS ordered,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')                AS new_customers,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                   AS retention
      FROM sales_hoc_orders
      WHERE primary_cmg IS NOT NULL
      GROUP BY month, primary_cmg
    ),
    sales_metrics AS (
      SELECT
        month, dynamic_cmg,
        COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
        COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')), 0) AS hoc_sales
      FROM sales_hoc_orders
      GROUP BY month, dynamic_cmg
    ),
    telesales_metrics AS (
      SELECT
        COALESCE(cm.month, sm.month)             AS month,
        COALESCE(cm.dynamic_cmg, sm.dynamic_cmg) AS dynamic_cmg,
        COALESCE(cm.ordered, 0)       AS ordered,
        COALESCE(cm.new_customers, 0) AS new_customers,
        COALESCE(cm.retention, 0)     AS retention,
        COALESCE(sm.hoc_orders, 0)    AS hoc_orders,
        COALESCE(sm.hoc_sales, 0)     AS hoc_sales
      FROM customer_metrics cm
      FULL OUTER JOIN sales_metrics sm
        ON sm.month = cm.month AND sm.dynamic_cmg = cm.dynamic_cmg
    ),
    calls_cmg AS (
      SELECT
        DATE_TRUNC('month', tc.first_connected_date)::date AS month,
        mc.primary_cmg AS dynamic_cmg,
        COUNT(DISTINCT tc.mmid) AS total_calls,
        COUNT(DISTINCT tc.mmid) FILTER (WHERE ${reachedCond('tc')}) AS reached
      FROM telesales_calls tc
      JOIN mmid_cmg_map mc ON mc.mmid = tc.mmid
      WHERE tc.first_connected_date IS NOT NULL AND mc.primary_cmg IS NOT NULL
      GROUP BY 1, 2
    )
    INSERT INTO mart_performance_cmg (
      month, dynamic_cmg, total_calls, reached, ordered, new_customers, retention,
      hoc_orders, hoc_sales, sales_target, achievement_ratio
    )
    SELECT
      tm.month, tm.dynamic_cmg,
      COALESCE(cc.total_calls, 0), COALESCE(cc.reached, 0),
      tm.ordered, tm.new_customers, tm.retention,
      tm.hoc_orders, tm.hoc_sales,
      COALESCE(tg.sales_target, 0),
      CASE WHEN COALESCE(tg.sales_target, 0) > 0
           THEN tm.hoc_sales / tg.sales_target ELSE 0 END
    FROM telesales_metrics tm
    LEFT JOIN calls_cmg cc ON cc.month = tm.month AND cc.dynamic_cmg = tm.dynamic_cmg
    LEFT JOIN targets   tg ON tg.month = tm.month AND tg.dynamic_cmg = tm.dynamic_cmg
  `)

  // Build mart_performance_month
  // Before May 2026: all CMGs count toward incentive (DISTRIBUTOR included).
  // From May 2026:   DISTRIBUTOR excluded; FOOD RETAILER + HORECA + END USER count.
  await query(`
    WITH tier_calls AS (
      SELECT
        DATE_TRUNC('month', first_connected_date)::date AS month,
        COUNT(DISTINCT mmid) AS total_calls,
        COUNT(DISTINCT mmid) FILTER (WHERE ${reachedCond('tc2')}) AS reached
      FROM telesales_calls tc2
      WHERE tc2.first_connected_date IS NOT NULL
      GROUP BY 1
    ),
    month_sales AS (
      SELECT month,
        SUM(hoc_sales) FILTER (
          WHERE month < '2026-05-01'
             OR dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER')
        ) AS incentive_hoc_sales,
        SUM(hoc_sales) AS total_hoc_sales
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
        AND (ms.month < '2026-05-01' OR tg.dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER'))
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
          ms.incentive_hoc_sales / NULLIF(
            COALESCE(ah.agent_count, 0)        * COALESCE(mi.incentive_per_head, 0)
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
      total_agent_cost, total_expense, roi, attribution_days
    )
    SELECT
      tc.month,
      tc.total_calls,
      tc.reached,
      COALESCE(mi.incentive_per_head, 0),
      COALESCE(ah.agent_count, 0) * COALESCE(mi.incentive_per_head, 0)            AS total_incentive,
      COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)  * COALESCE(co.cost_per_agent, 0)           AS total_agent_cost,
      COALESCE(ah.agent_count, 0)        * COALESCE(mi.incentive_per_head, 0)
        + COALESCE(ah.supervisor_count, 0) * COALESCE(co.cost_per_supervisor, 0)
        + COALESCE(ah.agent_count, 0)      * COALESCE(co.cost_per_agent, 0)       AS total_expense,
      mr.roi,
      ${attributionDays}
    FROM tier_calls tc
    LEFT JOIN month_incentive mi ON mi.month = tc.month
    LEFT JOIN costs           co ON co.month = tc.month
    LEFT JOIN agent_headcount ah ON ah.month = tc.month
    LEFT JOIN month_roi       mr ON mr.month = tc.month
  `)

  await Promise.all([
    query(`CREATE INDEX IF NOT EXISTS idx_mpc_month   ON mart_performance_cmg (month)`),
    query(`CREATE INDEX IF NOT EXISTS idx_mpc_dcmg    ON mart_performance_cmg (dynamic_cmg)`),
    query(`CREATE INDEX IF NOT EXISTS idx_mpm_month   ON mart_performance_month (month)`),
  ])

  const row = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM mart_performance_cmg`).catch(() => null)
  return Number(row?.cnt ?? 0)
}

export async function refreshAllMarts(attributionDays = 14): Promise<{ mart_main: number; performance: number }> {
  await ensureSchemaExtensions()

  const startedAt = Date.now()
  const buildRecord = await queryOne<{ id: string }>(
    `INSERT INTO mart_builds (started_at, attribution_days, status) VALUES (NOW(), $1, 'running') RETURNING id`,
    [attributionDays]
  ).catch(() => null)
  const buildId = buildRecord?.id ?? null

  try {
    const mart_main   = await buildMartMain(attributionDays)
    const performance = await buildMartPerformance(attributionDays)
    const duration    = Date.now() - startedAt

    if (buildId) {
      await query(
        `UPDATE mart_builds
         SET finished_at = NOW(), status = 'success', duration_ms = $1, row_counts = $2
         WHERE id = $3`,
        [duration, JSON.stringify({ sales_hoc_orders: mart_main, mart_performance_cmg: performance }), buildId]
      ).catch(() => {})
    }

    return { mart_main, performance }
  } catch (err) {
    if (buildId) {
      await query(
        `UPDATE mart_builds
         SET finished_at = NOW(), status = 'failed', duration_ms = $1, error_message = $2
         WHERE id = $3`,
        [Date.now() - startedAt, (err as Error).message, buildId]
      ).catch(() => {})
    }
    throw err
  }
}
