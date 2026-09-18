CREATE TABLE public.grade_reset_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  previous_points NUMERIC,
  previous_comment TEXT,
  reason TEXT NOT NULL DEFAULT 'reopened',
  reopened_until TIMESTAMPTZ,
  reset_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX grade_reset_log_assignment_idx ON public.grade_reset_log (assignment_id, student_id);

GRANT SELECT ON public.grade_reset_log TO authenticated;
GRANT ALL ON public.grade_reset_log TO service_role;

ALTER TABLE public.grade_reset_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reset history for their classes"
ON public.grade_reset_log
FOR SELECT
TO authenticated
USING (public.is_staff() AND (class_id IS NULL OR public.can_view_class(class_id)));