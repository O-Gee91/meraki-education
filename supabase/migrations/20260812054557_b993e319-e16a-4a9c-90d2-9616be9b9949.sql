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

  IF requested IN ('student','parent') THEN
    final_role := requested::public.app_role;
  ELSE
    final_role := 'student';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, final_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;
