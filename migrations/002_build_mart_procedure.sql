-- Migration: stored procedure for building mart_table_main
-- Run once in DB client (CockroachDB SQL Shell / psql):
--   CREATE OR REPLACE PROCEDURE build_mart_main ... (paste full block below)
--
-- Usage: caller must TRUNCATE both tables first, then CALL build_mart_main(14);
-- (CockroachDB does not support TRUNCATE inside a procedure — handled by TypeScript/caller)

CREATE OR REPLACE PROCEDURE build_mart_main(attr_days INT DEFAULT 14)
LANGUAGE SQL
AS $$
  -- Phase 2: CTE once → staging (no unique constraint = pure Puts, no lock budget issue)
  -- Key optimization: LEFT JOIN IS NULL replaces NOT EXISTS (O(n log n) vs O(n²))
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
    first_order_date, month, attribution_days
  )
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
      AND s.order_date <= tc.first_connected_date + (attr_days || ' days')::interval
    JOIN products p
      ON  p.prod_num        = s.prod_num
      AND p.product_name_en IS NOT NULL
    ORDER BY s.mmid, s.order_number, s.prod_num, tc.first_connected_date DESC
  ),
  retention_ext AS (
    SELECT
      NULL::date    AS first_connected_date,
      NULL::text    AS agent,
      NULL::text    AS call_status,
      NULL::text    AS reason_group,
      NULL::text    AS reason_subgroup,
      NULL::text    AS contact_note,
      NULL::text    AS lead_customers,
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
    JOIN products p
      ON  p.prod_num        = s.prod_num
      AND p.product_name_en IS NOT NULL
    JOIN telesales_mmids tm ON tm.mmid = s.mmid
    LEFT JOIN attributed a
      ON  a.mmid         = s.mmid
      AND a.order_number = s.order_number
      AND a.prod_num     = s.prod_num
    WHERE a.mmid IS NULL
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
    attr_days
  FROM combined c
  LEFT JOIN first_attr_order    fa ON fa.mmid = c.mmid
  LEFT JOIN first_nonattr_order fn ON fn.mmid = c.mmid;

  -- Phase 3: staging → mart_table_main
  -- staging has no UNIQUE constraint so the INSERT above is pure Puts (no lock budget issue).
  -- The INSERT below into mart_table_main has ON CONFLICT DO NOTHING which uses CPuts.
  -- If this single statement exceeds the lock budget on very large datasets,
  -- run the fallback batch script below instead (see comment at end of file).
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
    first_order_date, month, attribution_days
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
    first_order_date, month, attribution_days
  FROM _mart_build_staging
  ON CONFLICT (mmid, order_number, prod_num) DO NOTHING;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FALLBACK: if Phase 3 above hits lock budget on large datasets, skip the
-- CALL and run these two steps manually in your DB client instead:
--
--   Step 1 — run Phase 1 + 2 via the procedure with phase3 removed, OR run
--             the INSERT INTO _mart_build_staging ... query directly.
--
--   Step 2 — batch copy with PL/pgSQL loop (CockroachDB supports DO blocks):
--
-- DO $$
-- DECLARE lo BIGINT; hi BIGINT; off BIGINT;
-- BEGIN
--   SELECT MIN(rownum), MAX(rownum) INTO lo, hi FROM _mart_build_staging;
--   off := lo;
--   WHILE off <= hi LOOP
--     INSERT INTO mart_table_main (
--       mmid, order_number, prod_num,
--       first_connected_date, agent, call_status,
--       reason_group, reason_subgroup, contact_note, lead_customers,
--       days_to_order, flag_attr,
--       order_date, channel, dynamic_cmg,
--       sales_qty, sales_in_vat,
--       product_name_th, product_name_en, brands,
--       senior_buyer_name, buyer_name, class_name, subclass,
--       flag_hoc_unilever, flag_first_order, flag_retention, customer_type,
--       first_order_date, month, attribution_days
--     )
--     SELECT
--       mmid, order_number, prod_num,
--       first_connected_date, agent, call_status,
--       reason_group, reason_subgroup, contact_note, lead_customers,
--       days_to_order, flag_attr,
--       order_date, channel, dynamic_cmg,
--       sales_qty, sales_in_vat,
--       product_name_th, product_name_en, brands,
--       senior_buyer_name, buyer_name, class_name, subclass,
--       flag_hoc_unilever, flag_first_order, flag_retention, customer_type,
--       first_order_date, month, attribution_days
--     FROM _mart_build_staging
--     WHERE rownum >= off AND rownum < off + 4000
--     ON CONFLICT (mmid, order_number, prod_num) DO NOTHING;
--     off := off + 4000;
--   END LOOP;
-- END $$;
-- ─────────────────────────────────────────────────────────────────────────────
