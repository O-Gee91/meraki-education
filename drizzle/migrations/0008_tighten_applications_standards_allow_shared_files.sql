DROP POLICY IF EXISTS "applications submit public" ON public.applications;
CREATE POLICY "applications submit public" ON public.applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND length(btrim(student_name)) BETWEEN 2 AND 120
    AND length(btrim(guardian_name)) BETWEEN 2 AND 120
    AND length(guardian_email) <= 200
    AND grade_level BETWEEN 1 AND 12
    AND (phone IS NULL OR length(phone) <= 40)
    AND (notes IS NULL OR length(notes) <= 2000)
  );

DROP POLICY IF EXISTS "standards read" ON public.standards;
CREATE POLICY "standards read" ON public.standards
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- One uploaded file may be shared with several classes (one row per class).
ALTER TABLE public.file_uploads DROP CONSTRAINT IF EXISTS file_uploads_storage_path_key;
CREATE INDEX IF NOT EXISTS file_uploads_storage_path_idx ON public.file_uploads (storage_path);