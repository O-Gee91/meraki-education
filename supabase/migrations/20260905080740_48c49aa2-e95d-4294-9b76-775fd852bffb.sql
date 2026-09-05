ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_submission_mode_chk;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_submission_mode_chk
  CHECK (submission_mode IN ('online','collected','other'));

DROP POLICY IF EXISTS "Signed-in users can view calendar events" ON public.calendar_events;
CREATE POLICY "Signed-in users can view calendar events"
ON public.calendar_events FOR SELECT TO authenticated
USING (
  public.can_see_audiences(audiences)
  AND (class_id IS NULL OR public.can_view_class(class_id))
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  final_role public.app_role;
  contact text := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'contact_email', '')));
  staff_domain boolean;
  wanted text := NULLIF(lower(btrim(COALESCE(NEW.raw_user_meta_data->>'username',''))), '');
  candidate text;
  n int := 1;
BEGIN
  IF contact = '' OR contact !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    contact := NEW.email;
  END IF;

  -- A username collision must never abort the auth signup transaction:
  -- pick the next free numbered variant instead.
  candidate := wanted;
  WHILE candidate IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = candidate)
  LOOP
    n := n + 1;
    candidate := left(wanted, 26) || n::text;
  END LOOP;

  INSERT INTO public.profiles (id, full_name, email, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    contact,
    candidate
  )
  ON CONFLICT (id) DO NOTHING;

  staff_domain := public.is_school_staff_email(NEW.email);

  IF requested IN ('educator','teacher') AND NEW.email_confirmed_at IS NOT NULL AND staff_domain THEN
    final_role := 'teacher';
  ELSIF requested IN ('student','parent') THEN
    final_role := requested::public.app_role;
  ELSE
    final_role := 'student';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, final_role)
  ON CONFLICT DO NOTHING;

  IF requested IN ('educator','teacher') AND NOT staff_domain THEN
    INSERT INTO public.staff_access_requests (user_id, full_name, email, note, domain_approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name',''),
      contact,
      NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'staff_note','')), ''),
      false
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;