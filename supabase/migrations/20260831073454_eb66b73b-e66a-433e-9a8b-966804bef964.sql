CREATE OR REPLACE FUNCTION public.teaches_student_grade(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'teacher')
     AND EXISTS (
       SELECT 1 FROM public.students s
       WHERE s.id = _student_id
         AND s.grade_level IS NOT NULL
         AND public.teaches_grade(s.grade_level)
     );
$$;

REVOKE ALL ON FUNCTION public.teaches_student_grade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student_grade(uuid) TO authenticated, service_role;

-- Behavior notes: shared across the grade team
CREATE POLICY "Grade teachers view behavior notes"
ON public.behavior_notes FOR SELECT TO authenticated
USING (public.teaches_student_grade(student_id));

CREATE POLICY "Grade teachers log behavior notes"
ON public.behavior_notes FOR INSERT TO authenticated
WITH CHECK (public.teaches_student_grade(student_id));

CREATE POLICY "Grade teachers edit their own behavior notes"
ON public.behavior_notes FOR UPDATE TO authenticated
USING (recorded_by = auth.uid() AND public.teaches_student_grade(student_id))
WITH CHECK (recorded_by = auth.uid() AND public.teaches_student_grade(student_id));

CREATE POLICY "Grade teachers remove their own behavior notes"
ON public.behavior_notes FOR DELETE TO authenticated
USING (recorded_by = auth.uid() AND public.teaches_student_grade(student_id));

-- Detentions produced by the strike system are visible to the grade team
CREATE POLICY "Grade teachers view detentions"
ON public.detentions FOR SELECT TO authenticated
USING (public.teaches_student_grade(student_id));

CREATE POLICY "Grade teachers update detentions"
ON public.detentions FOR UPDATE TO authenticated
USING (public.teaches_student_grade(student_id))
WITH CHECK (public.teaches_student_grade(student_id));

-- Names for those shared rows
CREATE POLICY "Grade teachers view students in their grades"
ON public.students FOR SELECT TO authenticated
USING (public.teaches_student_grade(id));