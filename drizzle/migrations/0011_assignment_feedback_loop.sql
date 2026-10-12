-- Assignment & Feedback Loop: draft/published assignments, draft vs posted grades, audit trail.

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_status_check;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_status_check CHECK (status IN ('draft', 'published'));

DROP POLICY IF EXISTS "assignments read" ON public.assignments;
CREATE POLICY "assignments read" ON public.assignments
  FOR SELECT USING (
    public.can_view_class(class_id)
    AND (status = 'published' OR public.can_manage_class(class_id))
  );

ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS posted_by uuid;

DROP POLICY IF EXISTS "grades read" ON public.grades;
CREATE POLICY "grades read" ON public.grades
  FOR SELECT USING (
    public.can_view_student(student_id)
    AND (NOT is_draft OR public.can_manage_student(student_id))
  );

CREATE TABLE IF NOT EXISTS public.grade_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  assignment_title text,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  changed_by uuid,
  old_score numeric,
  new_score numeric,
  old_feedback text,
  new_feedback text,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.grade_changes TO authenticated;
GRANT ALL ON public.grade_changes TO service_role;

ALTER TABLE public.grade_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grade_changes read" ON public.grade_changes
  FOR SELECT USING (public.can_view_student(student_id));
CREATE POLICY "grade_changes insert staff" ON public.grade_changes
  FOR INSERT WITH CHECK (public.can_manage_student(student_id));

CREATE INDEX IF NOT EXISTS grade_changes_student_idx
  ON public.grade_changes (student_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS grade_changes_assignment_idx
  ON public.grade_changes (assignment_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_grade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     OR OLD.points_earned IS DISTINCT FROM NEW.points_earned
     OR OLD.comment IS DISTINCT FROM NEW.comment
     OR OLD.is_draft IS DISTINCT FROM NEW.is_draft THEN
    INSERT INTO public.grade_changes (
      assignment_id, assignment_title, student_id, changed_by,
      old_score, new_score, old_feedback, new_feedback
    )
    SELECT
      NEW.assignment_id,
      a.title,
      NEW.student_id,
      auth.uid(),
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.points_earned END,
      NEW.points_earned,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.comment END,
      NEW.comment
    FROM public.assignments a
    WHERE a.id = NEW.assignment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_log_change ON public.grades;
CREATE TRIGGER grades_log_change
  AFTER INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.log_grade_change();