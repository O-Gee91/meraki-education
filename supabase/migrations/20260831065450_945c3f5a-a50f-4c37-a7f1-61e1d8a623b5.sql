DROP POLICY IF EXISTS "classes read" ON public.classes;
CREATE POLICY "classes read" ON public.classes
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.can_view_class(id));

DROP POLICY IF EXISTS "classes update staff" ON public.classes;
CREATE POLICY "classes update staff" ON public.classes
  FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.can_manage_class(id))
  WITH CHECK (teacher_id = auth.uid() OR public.can_manage_class(id));

DELETE FROM public.classes WHERE name IN ('Curl Test','Curl Test2','Diag Test Class');