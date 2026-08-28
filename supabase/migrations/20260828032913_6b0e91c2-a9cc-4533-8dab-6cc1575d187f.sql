-- 1) Revoke anon/public EXECUTE on SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.can_manage_class(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_student(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teaches_class(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_teacher_on_verified_school_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_class(uuid) TO authenticated;

-- 2) Scope calendar_events SELECT policy to authenticated only
DROP POLICY IF EXISTS "Signed-in users can view calendar events" ON public.calendar_events;
CREATE POLICY "Signed-in users can view calendar events"
ON public.calendar_events FOR SELECT TO authenticated
USING (public.can_see_audiences(audiences));
REVOKE SELECT ON public.calendar_events FROM anon;

-- 3) Narrow teacher fallback for unenrolled students to the teacher's own grade levels
CREATE OR REPLACE FUNCTION public.can_manage_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin()
     OR EXISTS (
       SELECT 1 FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       WHERE e.student_id = _student_id AND c.teacher_id = auth.uid()
     )
     OR (
       public.has_role(auth.uid(), 'teacher')
       AND NOT EXISTS (SELECT 1 FROM public.enrollments e2 WHERE e2.student_id = _student_id)
       AND EXISTS (
         SELECT 1 FROM public.students s
         WHERE s.id = _student_id AND public.teaches_grade(s.grade_level)
       )
     );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_student(uuid) TO authenticated;