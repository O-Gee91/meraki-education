CREATE OR REPLACE FUNCTION public.teaches_grade(_grade integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.teacher_id = auth.uid()
      AND c.grade_level IS NOT DISTINCT FROM _grade
  );
$$;

REVOKE EXECUTE ON FUNCTION public.teaches_grade(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_grade(integer) TO authenticated, service_role;

CREATE TABLE public.shared_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('assignment','assessment')),
  grade_level integer CHECK (grade_level BETWEEN 1 AND 12),
  subject text,
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shared_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_resources TO authenticated;
GRANT ALL ON public.shared_resources TO service_role;

ALTER TABLE public.shared_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view resources for grades they teach"
ON public.shared_resources FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_role(auth.uid(), 'teacher')
    AND (grade_level IS NULL OR public.teaches_grade(grade_level))
  )
);

CREATE POLICY "Staff can share resources"
ON public.shared_resources FOR INSERT TO authenticated
WITH CHECK (public.is_staff() AND shared_by = auth.uid());

CREATE POLICY "Owners can update their shared resources"
ON public.shared_resources FOR UPDATE TO authenticated
USING (shared_by = auth.uid() OR public.is_admin())
WITH CHECK (shared_by = auth.uid() OR public.is_admin());

CREATE POLICY "Owners and admins can remove shared resources"
ON public.shared_resources FOR DELETE TO authenticated
USING (shared_by = auth.uid() OR public.is_admin());

CREATE INDEX shared_resources_grade_kind_idx ON public.shared_resources (grade_level, kind, created_at DESC);

CREATE TRIGGER touch_shared_resources
BEFORE UPDATE ON public.shared_resources
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();