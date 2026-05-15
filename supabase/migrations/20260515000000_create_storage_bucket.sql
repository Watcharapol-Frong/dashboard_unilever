-- ============================================================
-- Storage: Create csv-uploads bucket
-- ============================================================

-- Create the csv-uploads bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'csv-uploads',
  'csv-uploads',
  false,  -- private bucket
  52428800,  -- 50 MB
  ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;