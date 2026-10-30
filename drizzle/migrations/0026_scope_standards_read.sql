DROP POLICY IF EXISTS "standards read" ON public.standards;
CREATE POLICY "standards read" ON public.standards FOR SELECT TO authenticated
USING (public.is_staff() OR public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'parent'));