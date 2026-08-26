
-- helper: does the current user teach this class
CREATE OR REPLACE FUNCTION public.teaches_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = _class_id AND c.teacher_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_manage_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.teaches_class(_class_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
     OR EXISTS (
       SELECT 1 FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       WHERE e.student_id = _student_id AND c.teacher_id = auth.uid()
     )
     OR (
       public.has_role(auth.uid(), 'teacher')
       AND NOT EXISTS (SELECT 1 FROM public.enrollments e2 WHERE e2.student_id = _student_id)
     );
$$;

REVOKE EXECUTE ON FUNCTION public.teaches_class(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_class(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_student(uuid) FROM anon;

-- narrow the core visibility helpers
CREATE OR REPLACE FUNCTION public.can_view_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_class(_class_id) OR EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
    WHERE e.class_id = _class_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_student(_student_id) OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
  );
$$;

-- classes
DROP POLICY IF EXISTS "classes update staff" ON public.classes;
CREATE POLICY "classes update staff" ON public.classes FOR UPDATE TO authenticated
  USING (public.can_manage_class(id)) WITH CHECK (public.can_manage_class(id));

-- students
DROP POLICY IF EXISTS "students read" ON public.students;
CREATE POLICY "students read" ON public.students FOR SELECT TO authenticated
  USING (public.can_view_student(id));
DROP POLICY IF EXISTS "students update staff" ON public.students;
CREATE POLICY "students update staff" ON public.students FOR UPDATE TO authenticated
  USING (public.can_manage_student(id)) WITH CHECK (public.can_manage_student(id));

-- enrollments
DROP POLICY IF EXISTS "enrollments read" ON public.enrollments;
CREATE POLICY "enrollments read" ON public.enrollments FOR SELECT TO authenticated
  USING (public.can_manage_class(class_id) OR public.can_view_student(student_id));
DROP POLICY IF EXISTS "enrollments write staff" ON public.enrollments;
CREATE POLICY "enrollments write staff" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id) AND public.can_manage_student(student_id));
DROP POLICY IF EXISTS "enrollments delete staff" ON public.enrollments;
CREATE POLICY "enrollments delete staff" ON public.enrollments FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id));

-- assignments
DROP POLICY IF EXISTS "assignments insert staff" ON public.assignments;
CREATE POLICY "assignments insert staff" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "assignments update staff" ON public.assignments;
CREATE POLICY "assignments update staff" ON public.assignments FOR UPDATE TO authenticated
  USING (public.can_manage_class(class_id)) WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "assignments delete staff" ON public.assignments;
CREATE POLICY "assignments delete staff" ON public.assignments FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id));

-- polls
DROP POLICY IF EXISTS "polls insert staff" ON public.polls;
CREATE POLICY "polls insert staff" ON public.polls FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "polls update staff" ON public.polls;
CREATE POLICY "polls update staff" ON public.polls FOR UPDATE TO authenticated
  USING (public.can_manage_class(class_id)) WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "polls delete staff" ON public.polls;
CREATE POLICY "polls delete staff" ON public.polls FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id));

-- seats
DROP POLICY IF EXISTS "seats insert staff" ON public.seats;
CREATE POLICY "seats insert staff" ON public.seats FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "seats update staff" ON public.seats;
CREATE POLICY "seats update staff" ON public.seats FOR UPDATE TO authenticated
  USING (public.can_manage_class(class_id)) WITH CHECK (public.can_manage_class(class_id));
DROP POLICY IF EXISTS "seats delete staff" ON public.seats;
CREATE POLICY "seats delete staff" ON public.seats FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id));

-- attendance
DROP POLICY IF EXISTS "attendance insert staff" ON public.attendance;
CREATE POLICY "attendance insert staff" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id) AND public.can_manage_student(student_id));
DROP POLICY IF EXISTS "attendance update staff" ON public.attendance;
CREATE POLICY "attendance update staff" ON public.attendance FOR UPDATE TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "attendance delete staff" ON public.attendance;
CREATE POLICY "attendance delete staff" ON public.attendance FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));

-- grades
DROP POLICY IF EXISTS "grades insert staff" ON public.grades;
CREATE POLICY "grades insert staff" ON public.grades FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "grades update staff" ON public.grades;
CREATE POLICY "grades update staff" ON public.grades FOR UPDATE TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "grades delete staff" ON public.grades;
CREATE POLICY "grades delete staff" ON public.grades FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));

-- behavior notes
DROP POLICY IF EXISTS "behavior insert staff" ON public.behavior_notes;
CREATE POLICY "behavior insert staff" ON public.behavior_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "behavior update staff" ON public.behavior_notes;
CREATE POLICY "behavior update staff" ON public.behavior_notes FOR UPDATE TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "behavior delete staff" ON public.behavior_notes;
CREATE POLICY "behavior delete staff" ON public.behavior_notes FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));

-- checkins
DROP POLICY IF EXISTS "checkins update staff" ON public.checkins;
CREATE POLICY "checkins update staff" ON public.checkins FOR UPDATE TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "checkins delete staff" ON public.checkins;
CREATE POLICY "checkins delete staff" ON public.checkins FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));

-- report cards
DROP POLICY IF EXISTS "report cards read" ON public.report_cards;
CREATE POLICY "report cards read" ON public.report_cards FOR SELECT TO authenticated
  USING (public.can_manage_student(student_id) OR (published AND public.can_view_student(student_id)));
DROP POLICY IF EXISTS "report cards insert staff" ON public.report_cards;
CREATE POLICY "report cards insert staff" ON public.report_cards FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id) AND public.can_manage_student(student_id));
DROP POLICY IF EXISTS "report cards update staff" ON public.report_cards;
CREATE POLICY "report cards update staff" ON public.report_cards FOR UPDATE TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "report cards delete staff" ON public.report_cards;
CREATE POLICY "report cards delete staff" ON public.report_cards FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));

-- detentions
DROP POLICY IF EXISTS "Staff manage detentions" ON public.detentions;
CREATE POLICY "Staff manage detentions" ON public.detentions FOR ALL TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));

-- assignment submissions
DROP POLICY IF EXISTS "assignment_submissions_select" ON public.assignment_submissions;
CREATE POLICY "assignment_submissions_select" ON public.assignment_submissions FOR SELECT TO authenticated
  USING (public.can_view_student(student_id));
DROP POLICY IF EXISTS "assignment_submissions_delete" ON public.assignment_submissions;
CREATE POLICY "assignment_submissions_delete" ON public.assignment_submissions FOR DELETE TO authenticated
  USING (public.can_manage_student(student_id));
DROP POLICY IF EXISTS "assignment_submissions_insert" ON public.assignment_submissions;
CREATE POLICY "assignment_submissions_insert" ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_student(student_id)
    OR (
      EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        JOIN public.enrollments e ON e.class_id = a.class_id AND e.student_id = assignment_submissions.student_id
        WHERE a.id = assignment_id AND a.submission_mode = 'online'
      )
    )
  );
DROP POLICY IF EXISTS "assignment_submissions_update" ON public.assignment_submissions;
CREATE POLICY "assignment_submissions_update" ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (
    public.can_manage_student(student_id)
    OR (status = 'submitted' AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()))
  )
  WITH CHECK (
    public.can_manage_student(student_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );

-- assessments (submissions/answers scoped to manageable students)
DROP POLICY IF EXISTS "Staff manage submissions" ON public.assessment_submissions;
CREATE POLICY "Staff manage submissions" ON public.assessment_submissions FOR ALL TO authenticated
  USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));

DROP POLICY IF EXISTS "Staff manage answers" ON public.assessment_answers;
CREATE POLICY "Staff manage answers" ON public.assessment_answers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id = assessment_answers.submission_id AND public.can_manage_student(s.student_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id = assessment_answers.submission_id AND public.can_manage_student(s.student_id)
  ));
