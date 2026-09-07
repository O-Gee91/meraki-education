DROP POLICY "posts insert" ON public.posts;
CREATE POLICY "posts insert" ON public.posts
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (class_id IS NOT NULL AND public.can_view_class(class_id))
    OR (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = posts.group_id
        AND (
          public.is_staff()
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = g.id AND gm.user_id = auth.uid()
          )
        )
    ))
  )
);