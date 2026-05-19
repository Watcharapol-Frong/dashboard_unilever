CREATE TABLE IF NOT EXISTS table_summaries (
  table_name   TEXT PRIMARY KEY,
  total_rows   BIGINT DEFAULT 0,
  total_sales  NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize with current data (Run this once)
INSERT INTO table_summaries (table_name, total_rows, total_sales)
SELECT 'online_sales', COUNT(*), COALESCE(SUM(sales_in_vat),0) FROM online_sales
ON CONFLICT (table_name) DO UPDATE SET 
  total_rows = EXCLUDED.total_rows, 
  total_sales = EXCLUDED.total_sales,
  last_updated = NOW();

INSERT INTO table_summaries (table_name, total_rows, total_sales)
SELECT 'offline_sales', COUNT(*), COALESCE(SUM(sales_in_vat),0) FROM offline_sales
ON CONFLICT (table_name) DO UPDATE SET 
  total_rows = EXCLUDED.total_rows, 
  total_sales = EXCLUDED.total_sales,
  last_updated = NOW();
