CREATE OR REPLACE FUNCTION public.handoff_discussion_thread_host()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_host uuid;
BEGIN
  SELECT id INTO new_host FROM public.discussions
   WHERE thread_id = OLD.id ORDER BY created_at, id LIMIT 1;
  IF new_host IS NOT NULL THEN
    UPDATE public.discussions SET thread_id = NULL WHERE id = new_host;
    UPDATE public.discussions SET thread_id = new_host WHERE thread_id = OLD.id;
    UPDATE public.discussion_posts SET discussion_id = new_host WHERE discussion_id = OLD.id;
    UPDATE public.discussion_post_scores SET discussion_id = new_host WHERE discussion_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS discussions_handoff_thread_host ON public.discussions;
CREATE TRIGGER discussions_handoff_thread_host
  BEFORE DELETE ON public.discussions
  FOR EACH ROW EXECUTE FUNCTION public.handoff_discussion_thread_host();