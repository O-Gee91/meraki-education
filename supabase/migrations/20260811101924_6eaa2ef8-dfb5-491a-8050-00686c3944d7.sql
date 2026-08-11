CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  category text NOT NULL DEFAULT 'event',
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view calendar events"
  ON public.calendar_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can create calendar events"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update calendar events"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Staff can delete calendar events"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();