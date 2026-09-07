CREATE TABLE public.rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  grade_level integer,
  subject text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_points numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubrics TO authenticated;
GRANT ALL ON public.rubrics TO service_role;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and families can view rubrics in scope"
ON public.rubrics FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR created_by = auth.uid()
  OR (class_id IS NOT NULL AND public.can_view_class(class_id))
  OR (grade_level IS NOT NULL AND public.teaches_grade(grade_level))
);

CREATE POLICY "Managers can create rubrics"
ON public.rubrics FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.is_staff()
  AND (class_id IS NULL OR public.can_manage_class(class_id))
);

CREATE POLICY "Managers can update rubrics"
ON public.rubrics FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR created_by = auth.uid()
  OR (class_id IS NOT NULL AND public.can_manage_class(class_id))
)
WITH CHECK (
  public.is_admin()
  OR created_by = auth.uid()
  OR (class_id IS NOT NULL AND public.can_manage_class(class_id))
);

CREATE POLICY "Managers can delete rubrics"
ON public.rubrics FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR created_by = auth.uid()
  OR (class_id IS NOT NULL AND public.can_manage_class(class_id))
);

CREATE TRIGGER touch_rubrics BEFORE UPDATE ON public.rubrics
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.assignments
  ADD COLUMN rubric_id uuid REFERENCES public.rubrics(id) ON DELETE SET NULL;

CREATE TABLE public.rubric_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  rubric_id uuid REFERENCES public.rubrics(id) ON DELETE SET NULL,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  points_earned numeric,
  comment text,
  graded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_scores TO authenticated;
GRANT ALL ON public.rubric_scores TO service_role;
ALTER TABLE public.rubric_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and families can view rubric scores"
ON public.rubric_scores FOR SELECT TO authenticated
USING (public.can_view_student(student_id));

CREATE POLICY "Managers can create rubric scores"
ON public.rubric_scores FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_student(student_id)
  AND EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id AND public.can_manage_class(a.class_id)
  )
);

CREATE POLICY "Managers can update rubric scores"
ON public.rubric_scores FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id AND public.can_manage_class(a.class_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id AND public.can_manage_class(a.class_id)
  )
);

CREATE POLICY "Managers can delete rubric scores"
ON public.rubric_scores FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id AND public.can_manage_class(a.class_id)
  )
);

CREATE TRIGGER touch_rubric_scores BEFORE UPDATE ON public.rubric_scores
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();