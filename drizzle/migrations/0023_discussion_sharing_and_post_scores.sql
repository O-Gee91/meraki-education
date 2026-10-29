ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS share_group uuid,
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.discussions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE INDEX IF NOT EXISTS discussions_thread_idx ON public.discussions(thread_id);
CREATE INDEX IF NOT EXISTS discussions_share_group_idx ON public.discussions(share_group);

-- Can the caller see the thread whose posts live on _discussion_id (own class, or a linked class sharing the thread)?
CREATE OR REPLACE FUNCTION public.can_view_discussion_thread(_discussion_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.discussions d
    WHERE (d.id = _discussion_id OR d.thread_id = _discussion_id)
      AND public.can_view_class(d.class_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_discussion_thread(_discussion_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.discussions d
    WHERE (d.id = _discussion_id OR d.thread_id = _discussion_id)
      AND public.can_manage_class(d.class_id)
  )
$$;

DROP POLICY IF EXISTS "View posts in visible discussions" ON public.discussion_posts;
CREATE POLICY "View posts in visible discussions" ON public.discussion_posts
  FOR SELECT TO authenticated USING (public.can_view_discussion_thread(discussion_id));

DROP POLICY IF EXISTS "Members write posts" ON public.discussion_posts;
CREATE POLICY "Members write posts" ON public.discussion_posts
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND public.can_view_discussion_thread(discussion_id)
    AND (
      public.can_manage_discussion_thread(discussion_id)
      OR EXISTS (SELECT 1 FROM public.discussions d WHERE d.id = discussion_id AND NOT d.closed)
    )
  );

DROP POLICY IF EXISTS "Authors or staff delete posts" ON public.discussion_posts;
CREATE POLICY "Authors or staff delete posts" ON public.discussion_posts
  FOR DELETE TO authenticated USING (
    author_id = auth.uid() OR public.can_manage_discussion_thread(discussion_id)
  );

CREATE TABLE public.discussion_post_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.discussion_posts(id) ON DELETE CASCADE,
  discussion_id uuid NOT NULL REFERENCES public.discussions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  points numeric NOT NULL,
  max_points numeric NOT NULL DEFAULT 0,
  graded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_post_scores TO authenticated;
GRANT ALL ON public.discussion_post_scores TO service_role;
ALTER TABLE public.discussion_post_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors and staff read post scores" ON public.discussion_post_scores
  FOR SELECT TO authenticated USING (
    author_id = auth.uid()
    OR public.can_manage_discussion_thread(discussion_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = author_id AND s.guardian_user_id = auth.uid())
  );
CREATE POLICY "Staff insert post scores" ON public.discussion_post_scores
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_discussion_thread(discussion_id));
CREATE POLICY "Staff update post scores" ON public.discussion_post_scores
  FOR UPDATE TO authenticated USING (public.can_manage_discussion_thread(discussion_id))
  WITH CHECK (public.can_manage_discussion_thread(discussion_id));
CREATE POLICY "Staff delete post scores" ON public.discussion_post_scores
  FOR DELETE TO authenticated USING (public.can_manage_discussion_thread(discussion_id));

CREATE TRIGGER touch_discussion_post_scores BEFORE UPDATE ON public.discussion_post_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX discussion_post_scores_discussion_idx ON public.discussion_post_scores(discussion_id);