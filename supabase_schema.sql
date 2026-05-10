-- ============================================================
-- Makro x Unilever x Telesales Dashboard — Supabase Schema
-- Run this in Supabase SQL Editor (supabase.com → Your Project → SQL Editor)
-- ============================================================

-- 1. User Roles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin','viewer_telesales')),
  company text,
  created_at timestamptz DEFAULT now()
);

-- 2. Upload Batches (audit log)
CREATE TABLE IF NOT EXISTS upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  filename text,
  row_count integer,
  error_count integer DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now(),
  status text DEFAULT 'success'
);

-- 3. Sales Online (Makro Online channel)
CREATE TABLE IF NOT EXISTS sales_online (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_date date NOT NULL,
  customer_id text NOT NULL,
  customer_name text,
  product_sku text NOT NULL,
  product_brand text,
  product_category text,
  qty integer NOT NULL DEFAULT 0,
  sales_amount numeric(14,2) NOT NULL DEFAULT 0,
  mobile text,
  channel text DEFAULT 'online',
  upload_batch uuid REFERENCES upload_batches ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_online_oid ON sales_online (order_id);
CREATE INDEX IF NOT EXISTS idx_so_online_date  ON sales_online (order_date);
CREATE INDEX IF NOT EXISTS idx_so_online_cust  ON sales_online (customer_id);
CREATE INDEX IF NOT EXISTS idx_so_online_brand ON sales_online (product_brand);
CREATE INDEX IF NOT EXISTS idx_so_online_sku   ON sales_online (product_sku);

-- 4. Sales Offline (Makro Offline channel)
CREATE TABLE IF NOT EXISTS sales_offline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_date date NOT NULL,
  customer_id text NOT NULL,
  customer_name text,
  product_sku text NOT NULL,
  product_brand text,
  product_category text,
  qty integer NOT NULL DEFAULT 0,
  sales_amount numeric(14,2) NOT NULL DEFAULT 0,
  store_id text,
  channel text DEFAULT 'offline',
  upload_batch uuid REFERENCES upload_batches ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_offline_oid ON sales_offline (order_id);
CREATE INDEX IF NOT EXISTS idx_so_offline_date  ON sales_offline (order_date);
CREATE INDEX IF NOT EXISTS idx_so_offline_cust  ON sales_offline (customer_id);
CREATE INDEX IF NOT EXISTS idx_so_offline_brand ON sales_offline (product_brand);

-- 5. Telesales Calls
CREATE TABLE IF NOT EXISTS telesales_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  call_date date NOT NULL,
  call_status text NOT NULL,
  agent_name text NOT NULL,
  agent_company text,
  call_duration_sec integer,
  remark text,
  upload_batch uuid REFERENCES upload_batches ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tc_date    ON telesales_calls (call_date);
CREATE INDEX IF NOT EXISTS idx_tc_cust    ON telesales_calls (customer_id);
CREATE INDEX IF NOT EXISTS idx_tc_agent   ON telesales_calls (agent_name);
CREATE INDEX IF NOT EXISTS idx_tc_company ON telesales_calls (agent_company);
CREATE INDEX IF NOT EXISTS idx_tc_status  ON telesales_calls (call_status);

-- 6. Lead List
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  customer_name text,
  mobile text,
  address text,
  segment text,
  assigned_company text,
  assigned_date date,
  status text DEFAULT 'pending',
  upload_batch uuid REFERENCES upload_batches ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_cust    ON leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads (assigned_company);

-- 7. Product List
CREATE TABLE IF NOT EXISTS product_list (
  product_sku text PRIMARY KEY,
  product_name text NOT NULL,
  product_brand text,
  product_category text,
  unit_price numeric(10,2),
  is_unilever boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- 8. Incentives
CREATE TABLE IF NOT EXISTS incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  product_sku text,
  product_brand text,
  incentive_type text,
  incentive_value numeric(10,2),
  description text,
  upload_batch uuid REFERENCES upload_batches ON DELETE SET NULL
);

-- 9. Targets
CREATE TABLE IF NOT EXISTS targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sales_target_thb numeric(14,2) DEFAULT 0,
  new_customer_target integer DEFAULT 0,
  call_target integer DEFAULT 0,
  channel text DEFAULT 'all',
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 10. PostgreSQL function: count new customers in period
CREATE OR REPLACE FUNCTION count_new_customers(p_from date, p_to date, p_channel text DEFAULT 'all')
RETURNS integer
LANGUAGE sql STABLE AS $$
  WITH all_orders AS (
    SELECT customer_id, order_date FROM sales_online
    WHERE (p_channel = 'all' OR p_channel = 'online')
    UNION ALL
    SELECT customer_id, order_date FROM sales_offline
    WHERE (p_channel = 'all' OR p_channel = 'offline')
  )
  SELECT COUNT(DISTINCT customer_id)::integer
  FROM all_orders s
  WHERE s.order_date BETWEEN p_from AND p_to
    AND NOT EXISTS (
      SELECT 1 FROM all_orders s2
      WHERE s2.customer_id = s.customer_id
        AND s2.order_date < p_from
    );
$$;

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_offline ENABLE ROW LEVEL SECURITY;
ALTER TABLE telesales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid();
$$;

-- Helper function: get current user company
CREATE OR REPLACE FUNCTION get_user_company()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company FROM user_roles WHERE user_id = auth.uid();
$$;

-- user_roles: users can read their own role
CREATE POLICY "users_read_own_role" ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- upload_batches: all authenticated users can read; admin can insert
CREATE POLICY "auth_read_batches" ON upload_batches FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_batches" ON upload_batches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- sales_online: all authenticated users can read
CREATE POLICY "auth_read_sales_online" ON sales_online FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_sales_online" ON sales_online FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_sales_online" ON sales_online FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- sales_offline: all authenticated users can read
CREATE POLICY "auth_read_sales_offline" ON sales_offline FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_sales_offline" ON sales_offline FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_sales_offline" ON sales_offline FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- telesales_calls: admin sees all, viewer_telesales sees only own company
CREATE POLICY "telesales_read" ON telesales_calls FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR (get_user_role() = 'viewer_telesales' AND agent_company = get_user_company())
  );
CREATE POLICY "telesales_insert" ON telesales_calls FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- leads: admin sees all, viewer_telesales sees only assigned leads
CREATE POLICY "leads_read" ON leads FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR (get_user_role() = 'viewer_telesales' AND assigned_company = get_user_company())
  );
CREATE POLICY "leads_insert" ON leads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leads_update" ON leads FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- product_list: all authenticated users can read; admin can write
CREATE POLICY "auth_read_products" ON product_list FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_upsert_products" ON product_list FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_products" ON product_list FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- incentives: all authenticated users can read
CREATE POLICY "auth_read_incentives" ON incentives FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_incentives" ON incentives FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- targets: all authenticated users can read; admin can write
CREATE POLICY "auth_read_targets" ON targets FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_write_targets" ON targets FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- IMPORTANT: First admin user setup
-- After deploying and receiving your first magic link,
-- run this to make yourself admin (replace with your user UUID from auth.users):
-- INSERT INTO user_roles (user_id, role) VALUES ('YOUR-USER-UUID-HERE', 'admin');
-- ============================================================
