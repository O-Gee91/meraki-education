ALTER TABLE public.discussions ADD COLUMN available_from timestamptz, ADD COLUMN due_at timestamptz;
DROP POLICY "Members write posts" ON public.discussion_posts;
CREATE POLICY "Members write posts" ON public.discussion_posts
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND public.can_view_discussion_thread(discussion_id)
    AND (
      public.can_manage_discussion_thread(discussion_id)
      OR EXISTS (
        SELECT 1 FROM public.discussions d
        WHERE d.id = discussion_posts.discussion_id
          AND NOT d.closed
          AND (d.available_from IS NULL OR d.available_from <= now())
      )
    )
  );