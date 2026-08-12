ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  final_role public.app_role;
  uname text := nullif(btrim(lower(NEW.raw_user_meta_data->>'username')), '');
BEGIN
  INSERT INTO public.profiles (id, full_name, email, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, uname)
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
