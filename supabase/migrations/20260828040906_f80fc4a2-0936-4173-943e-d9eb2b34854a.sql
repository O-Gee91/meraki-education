CREATE TABLE public.discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  title text NOT NULL,
  prompt text NOT NULL,
  due_date date,
  required_replies integer NOT NULL DEFAULT 0,
  graded boolean NOT NULL DEFAULT false,
  points_possible numeric NOT NULL DEFAULT 0,
  closed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussions TO authenticated;
GRANT ALL ON public.discussions TO service_role;
ALTER TABLE public.discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View discussions in visible classes" ON public.discussions
  FOR SELECT TO authenticated USING (public.can_view_class(class_id));
CREATE POLICY "Staff create discussions" ON public.discussions
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_class(class_id));
CREATE POLICY "Staff update discussions" ON public.discussions
  FOR UPDATE TO authenticated USING (public.can_manage_class(class_id)) WITH CHECK (public.can_manage_class(class_id));
CREATE POLICY "Staff delete discussions" ON public.discussions
  FOR DELETE TO authenticated USING (public.can_manage_class(class_id));

CREATE TRIGGER touch_discussions BEFORE UPDATE ON public.discussions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.discussions(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.discussion_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_posts TO authenticated;
GRANT ALL ON public.discussion_posts TO service_role;
ALTER TABLE public.discussion_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View posts in visible discussions" ON public.discussion_posts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.discussions d WHERE d.id = discussion_id AND public.can_view_class(d.class_id))
  );
CREATE POLICY "Members write posts" ON public.discussion_posts
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_id
        AND public.can_view_class(d.class_id)
        AND (NOT d.closed OR public.can_manage_class(d.class_id))
    )
  );
CREATE POLICY "Authors edit own posts" ON public.discussion_posts
  FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors or staff delete posts" ON public.discussion_posts
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.discussions d WHERE d.id = discussion_id AND public.can_manage_class(d.class_id))
  );

CREATE TRIGGER touch_discussion_posts BEFORE UPDATE ON public.discussion_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX discussions_class_idx ON public.discussions(class_id);
CREATE INDEX discussion_posts_discussion_idx ON public.discussion_posts(discussion_id);