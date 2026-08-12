ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS submission_mode text NOT NULL DEFAULT 'collected';

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_submission_mode_chk
  CHECK (submission_mode IN ('online','collected'));

CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  body text,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','collected','returned')),
  teacher_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_submissions_select" ON public.assignment_submissions
FOR SELECT TO authenticated
USING (public.is_staff() OR public.can_view_student(student_id));

CREATE POLICY "assignment_submissions_insert" ON public.assignment_submissions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff()
  OR (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.enrollments e ON e.class_id = a.class_id AND e.student_id = assignment_submissions.student_id
      WHERE a.id = assignment_id AND a.submission_mode = 'online'
    )
  )
);

CREATE POLICY "assignment_submissions_update" ON public.assignment_submissions
FOR UPDATE TO authenticated
USING (
  public.is_staff()
  OR (
    status = 'submitted'
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_staff()
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
);

CREATE POLICY "assignment_submissions_delete" ON public.assignment_submissions
FOR DELETE TO authenticated
USING (public.is_staff());

CREATE TRIGGER touch_assignment_submissions BEFORE UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX assignment_submissions_assignment_idx ON public.assignment_submissions(assignment_id);
CREATE INDEX assignment_submissions_student_idx ON public.assignment_submissions(student_id);