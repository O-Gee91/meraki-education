DROP POLICY IF EXISTS "group members join" ON public.group_members;
CREATE POLICY "group members join" ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  is_staff()
  OR (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.visibility = 'school')
  )
);