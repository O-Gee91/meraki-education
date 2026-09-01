DROP POLICY IF EXISTS "Staff can view resources for grades they teach" ON public.shared_resources;

CREATE POLICY "Staff can view resources for grades they teach"
ON public.shared_resources
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR shared_by = auth.uid()
  OR (grade_level IS NOT NULL AND public.teaches_grade(grade_level))
);