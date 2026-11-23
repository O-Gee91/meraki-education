ALTER TABLE public.discussion_posts ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;

DROP POLICY IF EXISTS "Authors edit own posts" ON public.discussion_posts;
CREATE POLICY "Authors edit own posts" ON public.discussion_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (author_id = auth.uid() AND deleted_at IS NULL AND deleted_by IS NULL);

CREATE OR REPLACE FUNCTION public.audit_discussion_post()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, new_body, acted_by, post_created_at)
    VALUES (NEW.id, NEW.discussion_id, NEW.parent_id, NEW.author_id, 'created', NEW.body, auth.uid(), NEW.created_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, old_body, acted_by, post_created_at)
      VALUES (OLD.id, OLD.discussion_id, OLD.parent_id, OLD.author_id, 'deleted', OLD.body, auth.uid(), OLD.created_at);
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
      INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, old_body, new_body, acted_by, post_created_at)
      VALUES (NEW.id, NEW.discussion_id, NEW.parent_id, NEW.author_id, 'edited', OLD.body, NEW.body, auth.uid(), OLD.created_at);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.discussion_post_audits (post_id, discussion_id, parent_id, author_id, action, old_body, acted_by, post_created_at)
    VALUES (OLD.id, OLD.discussion_id, OLD.parent_id, OLD.author_id, 'deleted', OLD.body, auth.uid(), OLD.created_at);
    RETURN OLD;
  END IF;
END $function$;

-- Soft delete: keeps the row so replies keep their place; the text is cleared
-- for everyone and the original lives only in the staff/admin audit log.
CREATE OR REPLACE FUNCTION public.soft_delete_discussion_post(_post_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.discussion_posts;
BEGIN
  SELECT * INTO p FROM public.discussion_posts WHERE id = _post_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF NOT (p.author_id = auth.uid() OR public.can_manage_discussion_thread(p.discussion_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p.deleted_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.discussion_posts SET deleted_at = now(), deleted_by = auth.uid(), body = '' WHERE id = _post_id;
  DELETE FROM public.discussion_post_scores WHERE post_id = _post_id;
END $function$;
REVOKE ALL ON FUNCTION public.soft_delete_discussion_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_discussion_post(uuid) TO authenticated;