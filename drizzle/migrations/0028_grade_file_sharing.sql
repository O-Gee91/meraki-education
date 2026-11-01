CREATE OR REPLACE FUNCTION public.grade_file_targets(_grade integer)
RETURNS TABLE(id uuid, name text, grade_level integer, teacher_id uuid, teacher_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.grade_level, c.teacher_id, c.teacher_name
  FROM public.classes c
  WHERE c.grade_level = _grade
    AND public.is_staff()
    AND (public.is_admin() OR public.teaches_grade(_grade))
  ORDER BY c.name;
$$;
REVOKE ALL ON FUNCTION public.grade_file_targets(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_file_targets(integer) TO authenticated;

DROP POLICY IF EXISTS "files_insert_own" ON public.file_uploads;
CREATE POLICY "files_insert_own" ON public.file_uploads FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    class_id IS NULL
    OR public.can_view_class(class_id)
    OR (public.is_staff() AND student_id IS NULL AND EXISTS (
      SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.grade_level IS NOT NULL AND public.teaches_grade(c.grade_level)
    ))
  )
  AND (student_id IS NULL OR public.can_view_student(student_id))
);