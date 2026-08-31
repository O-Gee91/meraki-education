DROP POLICY IF EXISTS "enrollments write staff" ON public.enrollments;
CREATE POLICY "enrollments write staff"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_class(class_id));