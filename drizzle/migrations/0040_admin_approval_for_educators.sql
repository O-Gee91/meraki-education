CREATE OR REPLACE FUNCTION public.grant_teacher_on_verified_school_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Staff access is granted only through administrator approval.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  final_role public.app_role;
  contact text := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'contact_email', '')));
  wanted text := NULLIF(lower(btrim(COALESCE(NEW.raw_user_meta_data->>'username',''))), '');
  candidate text;
  n int := 1;
BEGIN
  IF contact = '' OR contact !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    contact := NEW.email;
  END IF;
  candidate := wanted;
  WHILE candidate IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = candidate)
  LOOP
    n := n + 1;
    candidate := left(wanted, 26) || n::text;
  END LOOP;

  INSERT INTO public.profiles (id, full_name, email, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), contact, candidate)
  ON CONFLICT (id) DO NOTHING;

  -- Educator signups never receive any role until an administrator approves them.
  IF requested IN ('educator','teacher') THEN
    INSERT INTO public.staff_access_requests (user_id, full_name, email, note, domain_approved)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), contact,
      NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'staff_note','')), ''),
      public.is_school_staff_email(NEW.email))
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  ELSIF requested IN ('student','parent') THEN
    final_role := requested::public.app_role;
  ELSE
    final_role := 'student';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;