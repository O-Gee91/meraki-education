-- Track user sign-ins so staff can see student login activity.

CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_in_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_events_user_idx ON public.login_events (user_id, signed_in_at DESC);

GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

-- Users record only their own sign-ins
CREATE POLICY "Users log their own sign-ins"
ON public.login_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users see their own history; staff (admins/teachers) see everyone's
CREATE POLICY "Users read own, staff read all"
ON public.login_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_staff());
