-- ============================================================
-- RPC functions for Leads KPI page
-- Bypasses PostgREST 1000-row cap by aggregating in DB
-- ============================================================

-- 1. Tier breakdown: total leads + called per category
CREATE OR REPLACE FUNCTION get_tier_breakdown()
RETURNS TABLE (
  category   text,
  total      bigint,
  called     bigint,
  not_called bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    l.lead_customers                         AS category,
    COUNT(*)                                 AS total,
    COUNT(t.mmid)                            AS called,
    COUNT(*) - COUNT(t.mmid)                 AS not_called
  FROM leads l
  LEFT JOIN telesales_calls t ON t.mmid = l.mmid
  GROUP BY l.lead_customers
  ORDER BY l.lead_customers;
$$;

-- 2. Call status counts
CREATE OR REPLACE FUNCTION get_call_status_counts()
RETURNS TABLE (
  call_status text,
  total       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    call_status,
    COUNT(*) AS total
  FROM telesales_calls
  GROUP BY call_status
  ORDER BY total DESC;
$$;
