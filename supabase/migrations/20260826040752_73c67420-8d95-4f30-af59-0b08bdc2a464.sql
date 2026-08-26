ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS audiences post_audience[] NOT NULL DEFAULT ARRAY['everyone']::post_audience[],
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'teal';

UPDATE public.calendar_events SET audiences = ARRAY[audience]::post_audience[];

CREATE OR REPLACE FUNCTION public.can_see_audiences(_audiences post_audience[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _audiences IS NULL
     OR array_length(_audiences, 1) IS NULL
     OR EXISTS (
       SELECT 1 FROM unnest(_audiences) a WHERE public.can_see_audience(a)
     );
$$;

REVOKE ALL ON FUNCTION public.can_see_audiences(post_audience[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_audiences(post_audience[]) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Signed-in users can view calendar events" ON public.calendar_events;
CREATE POLICY "Signed-in users can view calendar events"
ON public.calendar_events FOR SELECT
USING (public.can_see_audiences(audiences));