CREATE TABLE public.staff_access_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  note text,
  domain_approved boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT staff_access_requests_status_check CHECK (status IN ('pending','approved','denied')),
  CONSTRAINT staff_access_requests_user_unique UNIQUE (user_id)
);

GRANT SELECT, UPDATE ON public.staff_access_requests TO authenticated;
GRANT ALL ON public.staff_access_requests TO service_role;

ALTER TABLE public.staff_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all staff access requests"
  ON public.staff_access_requests FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users can view their own staff access request"
  ON public.staff_access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can review staff access requests"
  ON public.staff_access_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER touch_staff_access_requests
  BEFORE UPDATE ON public.staff_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
BEGIN
  IF contact = '' OR contact !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    contact := NEW.email;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    contact,
    NULLIF(lower(btrim(COALESCE(NEW.raw_user_meta_data->>'username',''))), '')
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

  -- Educator/staff signups from an email outside the approved school domains
  -- need an administrator to approve them before any staff role is granted.
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