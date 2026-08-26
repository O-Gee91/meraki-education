CREATE OR REPLACE FUNCTION public.is_school_staff_email(_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(_email,''))) ~ '@([a-z0-9-]+\.)*ssbs[0-9]?(\.[a-z0-9.-]+)?$';
$$;

REVOKE ALL ON FUNCTION public.is_school_staff_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF requested IN ('educator','teacher')
     AND NEW.email_confirmed_at IS NOT NULL
     AND public.is_school_staff_email(NEW.email) THEN
    final_role := 'teacher';
  ELSIF requested IN ('student','parent') THEN
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

CREATE OR REPLACE FUNCTION public.grant_teacher_on_verified_school_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (NEW.raw_user_meta_data->>'role') IN ('educator','teacher')
     AND public.is_school_staff_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'teacher')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_teacher ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_teacher
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_teacher_on_verified_school_email();