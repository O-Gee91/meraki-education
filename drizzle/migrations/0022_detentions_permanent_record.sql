DROP POLICY IF EXISTS "Staff manage detentions" ON public.detentions;
CREATE POLICY "Staff view detentions" ON public.detentions FOR SELECT TO authenticated USING (public.can_manage_student(student_id));
CREATE POLICY "Staff add detentions" ON public.detentions FOR INSERT TO authenticated WITH CHECK (public.can_manage_student(student_id));
CREATE POLICY "Staff update detentions" ON public.detentions FOR UPDATE TO authenticated USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));
REVOKE DELETE ON public.detentions FROM authenticated, anon;