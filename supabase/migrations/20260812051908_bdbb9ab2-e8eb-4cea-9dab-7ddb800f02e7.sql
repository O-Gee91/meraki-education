DROP POLICY IF EXISTS "comments read" ON public.post_comments;
CREATE POLICY "comments read" ON public.post_comments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.id = post_comments.post_id
    AND (
      (p.class_id IS NOT NULL AND public.can_view_class(p.class_id))
      OR (p.group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = p.group_id AND (g.visibility = 'school' OR public.is_staff())
      ))
    )
));

DROP POLICY IF EXISTS "school_files_select" ON storage.objects;
CREATE POLICY "school_files_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'school-files'
  AND EXISTS (
    SELECT 1 FROM public.file_uploads f
    WHERE f.storage_path = storage.objects.name
      AND (
        public.is_staff()
        OR f.uploaded_by = auth.uid()
        OR (
          public.can_see_audience(f.audience)
          AND (f.class_id IS NULL OR public.can_view_class(f.class_id))
          AND (f.student_id IS NULL OR public.can_view_student(f.student_id))
        )
      )
  )
);