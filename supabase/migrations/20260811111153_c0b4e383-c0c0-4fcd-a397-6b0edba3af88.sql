CREATE TABLE public.file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  audience public.post_audience NOT NULL DEFAULT 'everyone',
  title text NOT NULL,
  description text,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_uploads TO authenticated;
GRANT ALL ON public.file_uploads TO service_role;
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "files_select_visible" ON public.file_uploads FOR SELECT TO authenticated
USING (
  public.is_staff()
  OR uploaded_by = auth.uid()
  OR (
    public.can_see_audience(audience)
    AND (class_id IS NULL OR public.can_view_class(class_id))
    AND (student_id IS NULL OR public.can_view_student(student_id))
  )
);

CREATE POLICY "files_insert_own" ON public.file_uploads FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (class_id IS NULL OR public.can_view_class(class_id))
  AND (student_id IS NULL OR public.can_view_student(student_id))
);

CREATE POLICY "files_update_own_or_staff" ON public.file_uploads FOR UPDATE TO authenticated
USING (public.is_staff() OR uploaded_by = auth.uid())
WITH CHECK (public.is_staff() OR uploaded_by = auth.uid());

CREATE POLICY "files_delete_own_or_staff" ON public.file_uploads FOR DELETE TO authenticated
USING (public.is_staff() OR uploaded_by = auth.uid());

CREATE TRIGGER touch_file_uploads BEFORE UPDATE ON public.file_uploads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX file_uploads_class_idx ON public.file_uploads(class_id, created_at DESC);

CREATE POLICY "school_files_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'school-files' AND owner = auth.uid());

CREATE POLICY "school_files_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'school-files'
  AND (
    owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.file_uploads f WHERE f.storage_path = storage.objects.name)
  )
);

CREATE POLICY "school_files_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'school-files' AND (owner = auth.uid() OR public.is_staff()));