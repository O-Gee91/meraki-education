GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_resources TO authenticated;
GRANT ALL ON public.shared_resources TO service_role;

DROP POLICY IF EXISTS "Staff can view resources for grades they teach" ON public.shared_resources;
CREATE POLICY "Staff can view resources for grades they teach"
ON public.shared_resources FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR shared_by = auth.uid()
  OR (
    public.has_role(auth.uid(), 'teacher')
    AND grade_level IS NOT NULL
    AND public.teaches_grade(grade_level)
  )
);