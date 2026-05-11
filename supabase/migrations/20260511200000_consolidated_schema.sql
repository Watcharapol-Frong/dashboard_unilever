-- ============================================================
-- Consolidated Schema (squash of all prior migrations)
-- Applied to remote DB — this file is the single source of truth
-- ============================================================


-- ============================================================
-- SECTION 1: Core Silver Tables
-- ============================================================

-- upload_batches (referenced by all tables)
CREATE TABLE upload_batches (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text        NOT NULL,
  filename     text,
  storage_path text,
  row_count    integer     DEFAULT 0,
  error_count  integer     DEFAULT 0,
  status       text        DEFAULT 'success' CHECK (status IN ('success','partial','failed')),
  uploaded_by  uuid        REFERENCES auth.users(id),
  uploaded_at  timestamptz DEFAULT now()
);

-- leads
CREATE TABLE leads (
  mmid           text        PRIMARY KEY,
  cust_name      text,
  mobile         text,
  lead_customers text,
  batch_id       uuid        REFERENCES upload_batches(id),
  updated_at     timestamptz DEFAULT now()
);

-- products
CREATE TABLE products (
  prod_num          text PRIMARY KEY,
  product_name_th   text,
  product_name_en   text,
  brands            text,
  senior_buyer_name text,
  buyer_name        text,
  class_name        text,
  subclass          text,
  is_1px            boolean,
  url_makro_pro     text,
  batch_id          uuid        REFERENCES upload_batches(id),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_products_brands ON products (brands);

-- telesales_calls
CREATE TABLE telesales_calls (
  mmid                 text PRIMARY KEY,
  mobile               text,
  first_connected_date date,
  call_status          text,
  reason_group         text,
  reason_subgroup      text,
  contact_note         text,
  agent                text,
  lead_customers       text,       -- renamed from source_tab
  batch_id             uuid        REFERENCES upload_batches(id),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_telesales_agent  ON telesales_calls (agent);
CREATE INDEX idx_telesales_status ON telesales_calls (call_status);

-- targets
CREATE TABLE targets (
  month          date          NOT NULL,
  dynamic_cmg    text          NOT NULL,
  sales_target   numeric(14,2),
  buying_target  numeric(14,2),
  contact_target numeric(14,2),
  batch_id       uuid          REFERENCES upload_batches(id),
  updated_at     timestamptz   DEFAULT now(),
  PRIMARY KEY (month, dynamic_cmg)
);

CREATE INDEX idx_targets_month ON targets (month);

-- costs
CREATE TABLE costs (
  month               date PRIMARY KEY,
  cost_per_agent      numeric(12,2),
  cost_per_supervisor numeric(12,2),
  batch_id            uuid        REFERENCES upload_batches(id),
  updated_at          timestamptz DEFAULT now()
);

-- incentives
CREATE TABLE incentives (
  tier               numeric(5,2) PRIMARY KEY,
  incentive_per_head numeric(12,2) NOT NULL,
  batch_id           uuid          REFERENCES upload_batches(id),
  updated_at         timestamptz   DEFAULT now()
);


-- ============================================================
-- SECTION 2: Auth Schema
-- ============================================================

-- user_profiles
CREATE TABLE user_profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  full_name  text,
  role       text        NOT NULL CHECK (role IN ('admin', 'viewer')),
  company    text,
  invited_by uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  last_seen  timestamptz
);

CREATE INDEX idx_user_profiles_role    ON user_profiles (role);
CREATE INDEX idx_user_profiles_company ON user_profiles (company);

-- invite_codes
CREATE TABLE invite_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        UNIQUE NOT NULL,
  role       text        NOT NULL CHECK (role IN ('admin', 'viewer')),
  company    text,
  note       text,
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  max_uses   integer     DEFAULT 1,
  use_count  integer     DEFAULT 0,
  is_active  boolean     DEFAULT true
);

CREATE INDEX idx_invite_codes_code    ON invite_codes (code);
CREATE INDEX idx_invite_codes_created ON invite_codes (created_by);

-- audit_logs
CREATE TABLE audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_user   ON audit_logs (user_id);
CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_time   ON audit_logs (created_at DESC);

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_user_company()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company FROM user_profiles WHERE user_id = auth.uid()
$$;


-- ============================================================
-- SECTION 3: Sales Silver Tables (online_sales + offline_sales)
-- ============================================================

-- online_sales
CREATE TABLE online_sales (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text          NOT NULL,
  order_date        date          NOT NULL,
  mmid              text,
  mobile            text,
  dynamic_cmg       text,
  prod_num          text,
  sales_qty         numeric(10,2) NOT NULL DEFAULT 0,
  sales_in_vat      numeric(14,2) NOT NULL DEFAULT 0,
  channel           text          NOT NULL DEFAULT 'Online'
                      CHECK (channel IN ('Online', 'Offline')),
  is_in_paid_report boolean,
  batch_id          uuid          REFERENCES upload_batches(id),
  updated_at        timestamptz   DEFAULT now(),
  CONSTRAINT online_sales_order_prod_key UNIQUE (order_number, prod_num)
);

CREATE INDEX idx_online_sales_date ON online_sales (order_date);
CREATE INDEX idx_online_sales_mmid ON online_sales (mmid);
CREATE INDEX idx_online_sales_prod ON online_sales (prod_num);
CREATE INDEX idx_online_sales_cmg  ON online_sales (dynamic_cmg);

-- offline_sales
CREATE TABLE offline_sales (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text          NOT NULL,
  order_date   date          NOT NULL,
  mmid         text,
  mobile       text,
  dynamic_cmg  text,
  prod_num     text,
  sales_qty    numeric(10,2) NOT NULL DEFAULT 0,
  sales_in_vat numeric(14,2) NOT NULL DEFAULT 0,
  channel      text          NOT NULL DEFAULT 'Offline'
                 CHECK (channel IN ('Online', 'Offline')),
  batch_id     uuid          REFERENCES upload_batches(id),
  updated_at   timestamptz   DEFAULT now(),
  CONSTRAINT offline_sales_order_prod_key UNIQUE (order_number, prod_num)
);

CREATE INDEX idx_offline_sales_date ON offline_sales (order_date);
CREATE INDEX idx_offline_sales_mmid ON offline_sales (mmid);
CREATE INDEX idx_offline_sales_prod ON offline_sales (prod_num);
CREATE INDEX idx_offline_sales_cmg  ON offline_sales (dynamic_cmg);


-- ============================================================
-- SECTION 4: order_sales VIEW (Gold Layer)
-- UNION ALL online_sales + offline_sales
-- LEFT JOIN products → all product columns
-- is_uni_hoc_pd = product_name_en IS NOT NULL
-- ============================================================
CREATE OR REPLACE VIEW order_sales AS
  SELECT
    s.id, s.order_number, s.order_date, s.mmid, s.mobile, s.dynamic_cmg,
    s.prod_num, s.sales_qty, s.sales_in_vat, s.channel, s.is_in_paid_report,
    s.batch_id, s.updated_at,
    p.product_name_th, p.product_name_en, p.brands,
    p.senior_buyer_name, p.buyer_name, p.class_name,
    p.subclass, p.is_1px, p.url_makro_pro,
    (p.product_name_en IS NOT NULL) AS is_uni_hoc_pd
  FROM online_sales s
  LEFT JOIN products p ON p.prod_num = s.prod_num
UNION ALL
  SELECT
    s.id, s.order_number, s.order_date, s.mmid, s.mobile, s.dynamic_cmg,
    s.prod_num, s.sales_qty, s.sales_in_vat, s.channel,
    NULL::boolean AS is_in_paid_report,
    s.batch_id, s.updated_at,
    p.product_name_th, p.product_name_en, p.brands,
    p.senior_buyer_name, p.buyer_name, p.class_name,
    p.subclass, p.is_1px, p.url_makro_pro,
    (p.product_name_en IS NOT NULL) AS is_uni_hoc_pd
  FROM offline_sales s
  LEFT JOIN products p ON p.prod_num = s.prod_num;


-- ============================================================
-- SECTION 5: Triggers — LPAD mmid (14 digits) + mobile (10 digits)
-- ============================================================

-- pad_mmid_to_14
CREATE OR REPLACE FUNCTION pad_mmid_to_14()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mmid IS NOT NULL THEN
    NEW.mmid := LPAD(NEW.mmid, 14, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pad_mmid_online_sales
  BEFORE INSERT OR UPDATE OF mmid ON online_sales
  FOR EACH ROW EXECUTE FUNCTION pad_mmid_to_14();

CREATE TRIGGER trg_pad_mmid_offline_sales
  BEFORE INSERT OR UPDATE OF mmid ON offline_sales
  FOR EACH ROW EXECUTE FUNCTION pad_mmid_to_14();

CREATE TRIGGER trg_pad_mmid_leads
  BEFORE INSERT OR UPDATE OF mmid ON leads
  FOR EACH ROW EXECUTE FUNCTION pad_mmid_to_14();

CREATE TRIGGER trg_pad_mmid_telesales_calls
  BEFORE INSERT OR UPDATE OF mmid ON telesales_calls
  FOR EACH ROW EXECUTE FUNCTION pad_mmid_to_14();

-- format_and_mask_mobile
CREATE OR REPLACE FUNCTION format_and_mask_mobile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mobile IS NOT NULL THEN
    -- Pad to 10 digits and mask the last 5 digits with 'x'
    NEW.mobile := SUBSTRING(LPAD(NEW.mobile, 10, '0'), 1, 5) || 'xxxxx';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mask_mobile_online_sales
  BEFORE INSERT OR UPDATE OF mobile ON online_sales
  FOR EACH ROW EXECUTE FUNCTION format_and_mask_mobile();

CREATE TRIGGER trg_mask_mobile_offline_sales
  BEFORE INSERT OR UPDATE OF mobile ON offline_sales
  FOR EACH ROW EXECUTE FUNCTION format_and_mask_mobile();

CREATE TRIGGER trg_mask_mobile_leads
  BEFORE INSERT OR UPDATE OF mobile ON leads
  FOR EACH ROW EXECUTE FUNCTION format_and_mask_mobile();

CREATE TRIGGER trg_mask_mobile_telesales_calls
  BEFORE INSERT OR UPDATE OF mobile ON telesales_calls
  FOR EACH ROW EXECUTE FUNCTION format_and_mask_mobile();

-- format_and_mask_cust_name
CREATE OR REPLACE FUNCTION format_and_mask_cust_name()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parts text[];
BEGIN
  IF NEW.cust_name IS NOT NULL THEN
    parts := string_to_array(trim(NEW.cust_name), ' ');
    IF array_length(parts, 1) = 1 THEN
      NEW.cust_name := substring(parts[1], 1, 3) || 'xxxx';
    ELSIF array_length(parts, 1) >= 2 THEN
      NEW.cust_name := substring(parts[1], 1, 3) || 'xxxx ' || substring(parts[2], 1, 3) || 'xxxx';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mask_cust_name_leads
  BEFORE INSERT OR UPDATE OF cust_name ON leads
  FOR EACH ROW EXECUTE FUNCTION format_and_mask_cust_name();
