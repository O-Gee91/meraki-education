CREATE TABLE public.discussion_post_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  discussion_id uuid,
  parent_id uuid,
  author_id uuid,
  action text NOT NULL,
  old_body text,
  new_body text,
  acted_by uuid,
  post_created_at timestamptz,
  acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discussion_post_audits_discussion_idx ON public.discussion_post_audits (discussion_id, acted_at DESC);
CREATE INDEX discussion_post_audits_author_idx ON public.discussion_post_audits (author_id, acted_at DESC);

GRANT SELECT ON public.discussion_post_audits TO authenticated;
GRANT ALL ON public.discussion_post_audits TO service_role;
ALTER TABLE public.discussion_post_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read discussion audits" ON public.discussion_post_audits
FOR SELECT TO authenticated
USING (public.is_admin() OR (discussion_id IS NOT NULL AND public.can_manage_discussion_thread(discussion_id)));

CREATE OR REPLACE FUNCTION public.audit_discussion_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, new_body, acted_by, post_created_at)
    VALUES (NEW.id, NEW.discussion_id, NEW.parent_id, NEW.author_id, 'created', NEW.body, auth.uid(), NEW.created_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, old_body, new_body, acted_by, post_created_at)
      VALUES (NEW.id, NEW.discussion_id, NEW.parent_id, NEW.author_id, 'edited', OLD.body, NEW.body, auth.uid(), OLD.created_at);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, old_body, acted_by, post_created_at)
    VALUES (OLD.id, OLD.discussion_id, OLD.parent_id, OLD.author_id, 'deleted', OLD.body, auth.uid(), OLD.created_at);
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER discussion_posts_audit
AFTER INSERT OR UPDATE OR DELETE ON public.discussion_posts
FOR EACH ROW EXECUTE FUNCTION public.audit_discussion_post();

-- Backfill existing posts so current content is preserved
INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, new_body, post_created_at, acted_at)
SELECT id, discussion_id, parent_id, author_id, 'created', body, created_at, created_at FROM public.discussion_posts;