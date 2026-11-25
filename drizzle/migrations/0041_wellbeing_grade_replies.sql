CREATE OR REPLACE FUNCTION public.can_reach_student_wellbeing(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_student(_student_id)
    OR (public.has_role(auth.uid(), 'teacher') AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.classes c ON c.grade_level = s.grade_level
      WHERE s.id = _student_id
        AND (c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = auth.uid()))
    ));
$$;
REVOKE EXECUTE ON FUNCTION public.can_reach_student_wellbeing(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_reach_student_wellbeing(uuid) TO authenticated;

DROP POLICY IF EXISTS "checkin staff notes read" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes read" ON public.checkin_staff_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_reach_student_wellbeing(c.student_id)));

DROP POLICY IF EXISTS "checkin staff notes insert" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes insert" ON public.checkin_staff_notes FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_reach_student_wellbeing(c.student_id)));

DROP POLICY IF EXISTS "checkin staff notes update" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes update" ON public.checkin_staff_notes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND (public.can_manage_student(c.student_id) OR (created_by = auth.uid() AND public.can_reach_student_wellbeing(c.student_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND (public.can_manage_student(c.student_id) OR (created_by = auth.uid() AND public.can_reach_student_wellbeing(c.student_id)))));