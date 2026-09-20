DROP POLICY IF EXISTS "checkins read" ON public.checkins;
CREATE POLICY "checkins read" ON public.checkins
FOR SELECT TO authenticated
USING (
  public.can_view_student(student_id)
  OR (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = student_id
        AND public.teaches_grade(s.grade_level)
    )
  )
);

DROP POLICY IF EXISTS "checkin staff notes read" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes read" ON public.checkin_staff_notes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.can_manage_student(c.student_id)
        OR s.user_id = auth.uid()
        OR (
          public.has_role(auth.uid(), 'teacher')
          AND public.teaches_grade(s.grade_level)
        )
      )
  )
);

DROP POLICY IF EXISTS "checkin staff notes insert" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes insert" ON public.checkin_staff_notes
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'teacher')
          AND public.teaches_grade(s.grade_level)
        )
      )
  )
);

DROP POLICY IF EXISTS "checkin staff notes update" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes update" ON public.checkin_staff_notes
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'teacher')
          AND public.teaches_grade(s.grade_level)
        )
      )
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'teacher')
          AND public.teaches_grade(s.grade_level)
        )
      )
  )
);

DROP POLICY IF EXISTS "checkin staff notes delete" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes delete" ON public.checkin_staff_notes
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'teacher')
          AND public.teaches_grade(s.grade_level)
        )
      )
  )
);

CREATE POLICY "Students view wellbeing responders"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checkin_staff_notes n
    JOIN public.checkins c ON c.id = n.checkin_id
    JOIN public.students s ON s.id = c.student_id
    WHERE n.created_by = profiles.id
      AND s.user_id = auth.uid()
  )
);