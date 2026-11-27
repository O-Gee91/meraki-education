-- Grade and attendance writes must manage the class and the student.
-- Admins already satisfy can_manage_class. Historical reads stay on
-- can_view_student (and the draft rule on grades read). This does not
-- loosen any policy and does not change who can read student_number,
-- guardian email, or wellbeing notes.

DROP POLICY IF EXISTS "grades insert staff" ON public.grades;
CREATE POLICY "grades insert staff" ON public.grades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_student(student_id)
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.can_manage_class(a.class_id)
    )
  );

DROP POLICY IF EXISTS "grades update staff" ON public.grades;
CREATE POLICY "grades update staff" ON public.grades
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_student(student_id)
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.can_manage_class(a.class_id)
    )
  )
  WITH CHECK (
    public.can_manage_student(student_id)
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.can_manage_class(a.class_id)
    )
  );

DROP POLICY IF EXISTS "grades delete staff" ON public.grades;
CREATE POLICY "grades delete staff" ON public.grades
  FOR DELETE TO authenticated
  USING (
    public.can_manage_student(student_id)
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.can_manage_class(a.class_id)
    )
  );

DROP POLICY IF EXISTS "attendance update staff" ON public.attendance;
CREATE POLICY "attendance update staff" ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.can_manage_class(class_id) AND public.can_manage_student(student_id))
  WITH CHECK (public.can_manage_class(class_id) AND public.can_manage_student(student_id));

DROP POLICY IF EXISTS "attendance delete staff" ON public.attendance;
CREATE POLICY "attendance delete staff" ON public.attendance
  FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id) AND public.can_manage_student(student_id));
