-- 1. Remove self-service role claiming; only admins may grant roles
DROP POLICY IF EXISTS "self role claim" ON public.user_roles;
CREATE POLICY "admins manage roles insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- 2. Signup trigger: never grant staff roles from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  final_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
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

-- 3. Validate public application submissions
CREATE OR REPLACE FUNCTION public.validate_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.student_name := btrim(NEW.student_name);
  NEW.guardian_name := btrim(NEW.guardian_name);
  NEW.guardian_email := lower(btrim(NEW.guardian_email));

  IF length(NEW.student_name) < 2 OR length(NEW.student_name) > 120 THEN
    RAISE EXCEPTION 'Invalid student name';
  END IF;
  IF length(NEW.guardian_name) < 2 OR length(NEW.guardian_name) > 120 THEN
    RAISE EXCEPTION 'Invalid guardian name';
  END IF;
  IF NEW.guardian_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' OR length(NEW.guardian_email) > 200 THEN
    RAISE EXCEPTION 'Invalid guardian email';
  END IF;
  IF NEW.phone IS NOT NULL AND length(NEW.phone) > 40 THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF NEW.notes IS NOT NULL AND length(NEW.notes) > 2000 THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  IF NEW.grade_level < 1 OR NEW.grade_level > 12 THEN
    RAISE EXCEPTION 'Invalid grade level';
  END IF;

  -- submitters may never set their own status
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_application_trg ON public.applications;
CREATE TRIGGER validate_application_trg
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.validate_application();

-- 4. Lock down direct API execution of SECURITY DEFINER helpers.
--    RLS policies invoke them internally, but anon must not call them at all,
--    and signed-in users must not call the privileged ones directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon, public;
REVOKE ALL ON FUNCTION public.is_staff() FROM anon, public;
REVOKE ALL ON FUNCTION public.can_view_student(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_view_class(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_class(uuid) TO authenticated;