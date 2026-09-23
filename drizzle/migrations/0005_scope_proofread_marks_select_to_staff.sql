DROP POLICY IF EXISTS "Signed-in users can view proofread marks" ON public.proofread_marks;

CREATE POLICY "Staff can view proofread marks"
  ON public.proofread_marks
  FOR SELECT
  TO authenticated
  USING (public.is_staff());