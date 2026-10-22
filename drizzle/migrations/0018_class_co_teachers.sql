CREATE TABLE public.class_co_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_level text NOT NULL DEFAULT 'teaching' CHECK (permission_level IN ('full','teaching','grading','view_only')),
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id)
);
CREATE INDEX class_co_teachers_teacher_idx ON public.class_co_teachers(teacher_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_co_teachers TO authenticated;
GRANT ALL ON public.class_co_teachers TO service_role;
ALTER TABLE public.class_co_teachers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.co_teacher_level(_class_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT permission_level FROM public.class_co_teachers
  WHERE class_id = _class_id AND teacher_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.co_teacher_level(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.owns_class_or_admin(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.teaches_class(_class_id);
$$;
GRANT EXECUTE ON FUNCTION public.owns_class_or_admin(uuid) TO authenticated;

CREATE POLICY "co-teachers read" ON public.class_co_teachers FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.can_view_class(class_id));
CREATE POLICY "owner adds co-teachers" ON public.class_co_teachers FOR INSERT TO authenticated
  WITH CHECK (public.owns_class_or_admin(class_id) AND teacher_id <> auth.uid());
CREATE POLICY "owner updates co-teachers" ON public.class_co_teachers FOR UPDATE TO authenticated
  USING (public.owns_class_or_admin(class_id)) WITH CHECK (public.owns_class_or_admin(class_id));
CREATE POLICY "owner removes co-teachers" ON public.class_co_teachers FOR DELETE TO authenticated
  USING (public.owns_class_or_admin(class_id) OR teacher_id = auth.uid());

-- Editing co-teachers (all but view-only) can manage class work; view-only can read.
CREATE OR REPLACE FUNCTION public.can_manage_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.teaches_class(_class_id)
    OR coalesce(public.co_teacher_level(_class_id) IN ('full','teaching','grading'), false);
$$;

CREATE OR REPLACE FUNCTION public.can_view_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_class(_class_id)
    OR public.co_teacher_level(_class_id) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
      WHERE e.class_id = _class_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
     OR EXISTS (
       SELECT 1 FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       WHERE e.student_id = _student_id AND c.teacher_id = auth.uid()
     )
     OR EXISTS (
       SELECT 1 FROM public.enrollments e
       JOIN public.class_co_teachers ct ON ct.class_id = e.class_id
       WHERE e.student_id = _student_id AND ct.teacher_id = auth.uid()
         AND ct.permission_level IN ('full','teaching','grading')
     )
     OR (
       public.has_role(auth.uid(), 'teacher')
       AND NOT EXISTS (SELECT 1 FROM public.enrollments e2 WHERE e2.student_id = _student_id)
       AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND public.teaches_grade(s.grade_level))
     );
$$;

CREATE OR REPLACE FUNCTION public.can_view_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_student(_student_id)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.class_co_teachers ct ON ct.class_id = e.class_id
      WHERE e.student_id = _student_id AND ct.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = _student_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
    );
$$;

-- Class settings stay with the primary teacher, admins and full-access co-teachers.
DROP POLICY IF EXISTS "classes update staff" ON public.classes;
CREATE POLICY "classes update staff" ON public.classes FOR UPDATE TO authenticated
  USING (public.owns_class_or_admin(id) OR public.co_teacher_level(id) = 'full')
  WITH CHECK (public.owns_class_or_admin(id) OR public.co_teacher_level(id) = 'full');