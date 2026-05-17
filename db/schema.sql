-- ── Core Silver tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upload_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  filename     TEXT,
  storage_path TEXT,
  row_count    INT,
  error_count  INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','partial','failed')),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by  UUID
);

CREATE TABLE IF NOT EXISTS online_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT,
  order_date      DATE,
  mmid            TEXT,
  mobile          TEXT,
  dynamic_cmg     TEXT,
  prod_num        TEXT,
  sales_qty       NUMERIC DEFAULT 0,
  sales_in_vat    NUMERIC DEFAULT 0,
  is_in_paid_report BOOLEAN,
  batch_id        UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_number, prod_num)
);

CREATE TABLE IF NOT EXISTS offline_sales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT,
  order_date   DATE,
  mmid         TEXT,
  mobile       TEXT,
  dynamic_cmg  TEXT,
  prod_num     TEXT,
  sales_qty    NUMERIC DEFAULT 0,
  sales_in_vat NUMERIC DEFAULT 0,
  batch_id     UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_number, prod_num)
);

CREATE TABLE IF NOT EXISTS leads (
  mmid           TEXT PRIMARY KEY,
  cust_name      TEXT,
  mobile         TEXT,
  lead_customers TEXT,
  batch_id       UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  prod_num          TEXT PRIMARY KEY,
  product_name_th   TEXT,
  product_name_en   TEXT,
  brands            TEXT,
  senior_buyer_name TEXT,
  buyer_name        TEXT,
  class_name        TEXT,
  subclass          TEXT,
  is_1px            BOOLEAN,
  url_makro_pro     TEXT,
  batch_id          UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telesales_calls (
  mmid                 TEXT PRIMARY KEY,
  mobile               TEXT,
  first_connected_date DATE,
  call_status          TEXT,
  reason_group         TEXT,
  reason_subgroup      TEXT,
  contact_note         TEXT,
  agent                TEXT,
  lead_customers       TEXT,
  batch_id             UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS targets (
  month          DATE NOT NULL,
  dynamic_cmg    TEXT NOT NULL,
  sales_target   NUMERIC,
  buying_target  NUMERIC,
  contact_target NUMERIC,
  batch_id       UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (month, dynamic_cmg)
);

CREATE TABLE IF NOT EXISTS costs (
  month                DATE PRIMARY KEY,
  cost_per_agent       NUMERIC,
  cost_per_supervisor  NUMERIC,
  batch_id             UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incentives (
  tier               NUMERIC PRIMARY KEY,
  incentive_per_head NUMERIC,
  batch_id           UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_online_sales_date    ON online_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_online_sales_mmid    ON online_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_offline_sales_date   ON offline_sales(order_date);
CREATE INDEX IF NOT EXISTS idx_offline_sales_mmid   ON offline_sales(mmid);
CREATE INDEX IF NOT EXISTS idx_telesales_date       ON telesales_calls(first_connected_date);
CREATE INDEX IF NOT EXISTS idx_telesales_agent      ON telesales_calls(agent);
CREATE INDEX IF NOT EXISTS idx_upload_batches_table ON upload_batches(table_name, uploaded_at DESC);

-- ── PDPA: Data masking triggers ──────────────────────────────────
-- NOTE: CockroachDB Serverless does not support triggers.
-- Run these on a dedicated CockroachDB cluster, or rely on ETL-level
-- masking in src/lib/upload/etl.ts as the primary enforcement layer.

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

-- format_and_mask_mobile (pad to 10 digits, mask last 5 as 'xxxxx')
CREATE OR REPLACE FUNCTION format_and_mask_mobile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mobile IS NOT NULL THEN
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

-- format_and_mask_cust_name (mask name to "Namxxxx Surxxxx")
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
