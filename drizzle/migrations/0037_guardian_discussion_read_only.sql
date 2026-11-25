DROP POLICY IF EXISTS "Members write posts" ON public.discussion_posts;
CREATE POLICY "Members write posts" ON public.discussion_posts
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND deleted_at IS NULL
    AND deleted_by IS NULL
    AND public.can_view_discussion_thread(discussion_id)
    AND (
      public.can_manage_discussion_thread(discussion_id)
      OR EXISTS (
        SELECT 1
        FROM public.discussions d
        JOIN public.enrollments e ON e.class_id = d.class_id
        JOIN public.students s ON s.id = e.student_id
        WHERE d.id = discussion_posts.discussion_id
          AND s.user_id = auth.uid()
      )
    )
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

DROP POLICY IF EXISTS "Authors edit own posts" ON public.discussion_posts;
CREATE POLICY "Authors edit own posts" ON public.discussion_posts
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    AND deleted_at IS NULL
    AND (
      public.can_manage_discussion_thread(discussion_id)
      OR EXISTS (
        SELECT 1
        FROM public.discussions d
        JOIN public.enrollments e ON e.class_id = d.class_id
        JOIN public.students s ON s.id = e.student_id
        WHERE d.id = discussion_posts.discussion_id
          AND s.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND deleted_at IS NULL
    AND deleted_by IS NULL
    AND (
      public.can_manage_discussion_thread(discussion_id)
      OR EXISTS (
        SELECT 1
        FROM public.discussions d
        JOIN public.enrollments e ON e.class_id = d.class_id
        JOIN public.students s ON s.id = e.student_id
        WHERE d.id = discussion_posts.discussion_id
          AND s.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authors or staff delete posts" ON public.discussion_posts;
CREATE POLICY "Authors or staff delete posts" ON public.discussion_posts
  FOR DELETE TO authenticated USING (
    public.can_manage_discussion_thread(discussion_id)
    OR (
      author_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.discussions d
        JOIN public.enrollments e ON e.class_id = d.class_id
        JOIN public.students s ON s.id = e.student_id
        WHERE d.id = discussion_posts.discussion_id
          AND s.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.soft_delete_discussion_post(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE p public.discussion_posts;
BEGIN
  SELECT * INTO p FROM public.discussion_posts WHERE id = _post_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF NOT (
    public.can_manage_discussion_thread(p.discussion_id)
    OR (
      p.author_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.discussions d
        JOIN public.enrollments e ON e.class_id = d.class_id
        JOIN public.students s ON s.id = e.student_id
        WHERE d.id = p.discussion_id
          AND s.user_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p.deleted_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.discussion_posts SET deleted_at = now(), deleted_by = auth.uid(), body = '' WHERE id = _post_id;
  DELETE FROM public.discussion_post_scores WHERE post_id = _post_id;
END
$function$;