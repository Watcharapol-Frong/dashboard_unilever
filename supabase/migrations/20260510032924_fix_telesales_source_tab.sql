-- Rename source_tab → lead_customers in telesales_calls
-- Aligns with leads.lead_customers for consistent joining
ALTER TABLE telesales_calls
  RENAME COLUMN source_tab TO lead_customers;
