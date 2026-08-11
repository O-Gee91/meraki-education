CREATE TYPE public.post_audience AS ENUM ('everyone', 'students', 'parents', 'teachers');

ALTER TABLE public.announcements
  ADD COLUMN audience public.post_audience NOT NULL DEFAULT 'everyone';

ALTER TABLE public.calendar_events
  ADD COLUMN audience public.post_audience NOT NULL DEFAULT 'everyone';

CREATE OR REPLACE FUNCTION public.can_see_audience(_audience public.post_audience)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _audience = 'everyone'
     OR public.is_staff()
     OR (_audience = 'students' AND public.has_role(auth.uid(), 'student'))
     OR (_audience = 'parents' AND public.has_role(auth.uid(), 'parent'))
     OR (_audience = 'teachers' AND public.has_role(auth.uid(), 'teacher'));
$$;

REVOKE EXECUTE ON FUNCTION public.can_see_audience(public.post_audience) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_audience(public.post_audience) TO authenticated;

DROP POLICY IF EXISTS "announcements read" ON public.announcements;
CREATE POLICY "announcements read" ON public.announcements
  FOR SELECT TO authenticated
  USING (public.can_see_audience(audience));

DROP POLICY IF EXISTS "Signed-in users can view calendar events" ON public.calendar_events;
CREATE POLICY "Signed-in users can view calendar events" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (public.can_see_audience(audience));