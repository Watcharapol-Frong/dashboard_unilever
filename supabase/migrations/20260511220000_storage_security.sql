-- ============================================================
-- Storage Security: csv-uploads bucket
-- ============================================================
-- Bucket: csv-uploads (private, already created)
-- Access model:
--   admin  → INSERT, SELECT, DELETE
--   viewer → no access
--   anon   → no access
--
-- Note: API routes use service_role key (bypasses RLS) ✓
--       These policies protect direct client-side access
-- ============================================================

-- ── 1. Bucket constraints ─────────────────────────────────────
UPDATE storage.buckets
SET
  file_size_limit    = 52428800,              -- 50 MB per file
  allowed_mime_types = ARRAY[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream'               -- some OS sends CSV as this
  ]
WHERE id = 'csv-uploads';

-- ── 2. RLS Policies on storage.objects ───────────────────────

-- UPLOAD (INSERT): admin only
CREATE POLICY "csv_uploads_insert_admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'csv-uploads'
  AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) = 'admin'
);

-- READ (SELECT): admin only
CREATE POLICY "csv_uploads_select_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'csv-uploads'
  AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) = 'admin'
);

-- DELETE: admin only
CREATE POLICY "csv_uploads_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'csv-uploads'
  AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) = 'admin'
);

-- UPDATE (overwrite): admin only
CREATE POLICY "csv_uploads_update_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'csv-uploads'
  AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) = 'admin'
);

-- ── 3. Block anonymous access explicitly ─────────────────────
-- (RLS + no anon policy already blocks, this is belt-and-suspenders)
CREATE POLICY "csv_uploads_deny_anon"
ON storage.objects FOR SELECT
TO anon
USING (false);
